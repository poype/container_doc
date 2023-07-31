

## INTRODUCING PODS

A pod is a group of one or more tightly related containers that will always run together **on the same worker node** and **in the same Linux namespace(s)**.

Each pod is like a separate logical machine with its **own IP**, **hostname**, processes, and so on, running a single application. 

The application can be a single process, running in a single container, or it can be a main application process and additional supporting processes, **each running in its own container**. 

All the containers in a pod will appear to be running on the same logical machine, whereas containers in other pods, even if they’re running on the same worker node, will appear to be running on a different one.

Each pod has its own IP and contains one or more containers, each running an application process. Pods are spread out across different worker nodes.

All containers of a pod run on the same node. **A pod never spans two nodes**.

![image-20230730143735910](.\image-20230730143735910.png)

## Why we need pods

Containers are designed to run only a single process per container (unless the process itself spawns child processes). 

If you run multiple unrelated processes in a single container, it is your responsibility to keep all those processes running. For example, you’d have to include a mechanism for automatically restarting individual processes if they crash.

Therefore, you need to run each process in its own container. That’s how Docker and Kubernetes are meant to be used.

## PARTIAL ISOLATION BETWEEN CONTAINERS OF THE SAME POD

All containers of a pod share the same set of Linux namespaces instead of each container having its own set.

All containers of a pod run under the same Network and UTS namespaces, so they all share the same hostname and network interfaces.

All containers of a pod run under the same IPC namespace and can communicate through IPC.

**But when it comes to the filesystem, things are a little different.** 

Because most of the container’s filesystem comes from the container image, by default, **the filesystem of each container is fully isolated from other containers**. However, it’s possible to have them share file directories using a Kubernetes concept called a **Volume**.

Because containers in a pod run in the same Network namespace, they share the same IP address and port space. This means processes running
in containers of the same pod need to take care not to bind to the same port numbers. 

All the containers in a pod also have the same loopback network interface, so **a container can communicate with other containers in the same pod through localhost.**

## FLAT INTER-POD NETWORK

All pods in a Kubernetes cluster reside in a single flat, shared, network-address space:

![image-20230730163257569](.\image-20230730163257569.png)

No NAT (Network Address Translation) gateways exist between pods. When two pods send network packets between each other, they’ll each see the actual IP address of the other as the source IP in the packet, like computers on a **local area network (LAN)**.

## 使用kubectl run命令创建一个pod

The simplest way to deploy your app is to use the **`kubectl run`** command, which will create all the necessary components **without having to deal with JSON or YAML**.

```
kubectl run kubia --image=skyliu01/kubia --port=8080
```

1. **`--image=luksa/kubia`** part specifies the container image you want to run.
2. **`--port=8080`** option tells Kubernetes that your app is listening on port 8080.

![image-20230730103219142](.\image-20230730103219142.png)

#### LISTING PODS

```
kubectl get pods
```

![image-20230730110813714](.\image-20230730110813714.png)

In the Kubernetes world, what node a pod is running on isn’t that important, as long as it gets scheduled to a node that can provide the CPU and memory the pod needs to run properly.

Regardless of the node they’re scheduled to, all the apps running inside containers have the same type of OS environment.  

Each pod is provided with the requested amount of computational resources, so whether those resources are provided by one node or another doesn’t make any difference.

But you can **request additional columns** to display using the **`-o wide`** option. When listing pods, this option shows the pod’s IP and the node the pod is running on:

```
kubectl get pods -o wide
```

![image-20230730111343687](.\image-20230730111343687.png)

To see more information about the pod, you can also use the **`kubectl describe pod`** command:

![image-20230730111124001](.\image-20230730111124001.png)

#### 构建pod的流程

![image-20230730112645042](.\image-20230730112645042.png)

## Creating pods from YAML or JSON descriptors

Pods and other Kubernetes resources are **usually** created by posting a JSON or YAML manifest to the Kubernetes REST API endpoint.

You can use the kubectl get command with the **`-o yaml`** option to get the whole YAML definition of the pod:

```
kubectl get pod kubia -o yaml
```

![image-20230730164554079](.\image-20230730164554079.png)

**基于yaml文件创建一个新的pod：**

```
kubectl create -f kubia-manual.yaml
```

![image-20230730170211119](.\image-20230730170211119.png)

The **`kubectl create -f`** command is used **for creating any resource** (not only pods) from a YAML or JSON file.

After creating the pod, you can ask Kubernetes for the **full YAML** of the pod.

```
kubectl get po kubia-manual -o yaml
```

you can also tell kubectl to return JSON instead of YAML:

```
kubectl get po kubia-manual -o json
```

## Viewing application logs

```
kubectl logs kubia-manual
```

![image-20230730173238257](.\image-20230730173238257.png)

If your pod includes multiple containers, you have to explicitly specify the container name by including the **`-c <container name>`** option when running kubectl logs.

```
kubectl logs kubia-manual -c kubia
```

kubia-manual 是pod的名字

kubia 是container的名字

#### 调用pod中的服务

When you want to talk to a specific pod without going through a service, Kubernetes allows you to configure port forwarding to the pod. This is done through the **`kubectl port-forward`** command.

The following command will forward your machine’s local port 8888 to port 8080 of your kubia-manual pod:

```
kubectl port-forward kubia-manual 8888:8080
```

![image-20230730174130782](.\image-20230730174130782.png)

再次查看日志就会发现有很多Request的日志：

![image-20230730174256059](.\image-20230730174256059.png)

## SSH登录到pod

```
kubectl exec -it kubia-manual -- bash
```

当一个pod中包含多个container时，就要明确指定container的名字：

```
kubectl exec -it kubia-manual -c kubia -- bash
```

![image-20230730180721129](.\image-20230730180721129.png)

## Organizing pods with labels

Labels are a simple, yet incredibly powerful, Kubernetes feature for organizing **not only** pods, **but** **all** other Kubernetes resources.

A resource can have more than one label, as long as the **keys** of those labels are **unique** within that resource.

You usually attach labels to resources when you create them, but you can also add additional labels or even modify the values of existing labels later without having to recreate the resource.

The kubectl get pods command doesn’t list any labels by default, but you can see them by using the **`--show-labels`** switch:

```
kubectl get pods --show-labels
```

![image-20230730181829502](.\image-20230730181829502.png)

Instead of listing all labels, if you’re only interested in certain labels, you can specify them with the **`-L`** switch and have each displayed in its own column.

```
kubectl get po -L creation_method,env
```

![image-20230730182047082](.\image-20230730182047082.png)

#### Modifying labels of existing pods

##### 给一个pod增加一个label

```
kubectl label po kubia-manual creation_method=manual
```

给 kubia-manual pod 增加 creation_method label，其值也是 manual。

![image-20230730182213455](.\image-20230730182213455.png)

##### 修改pod中已存在label的值

```
kubectl label po kubia-manual-v2 env=debug --overwrite
```

将 pod kubia-manual-v2 的 env label 的值从prod修改为debug。

You need to use the **--overwrite** option when changing existing labels.

![image-20230730183458276](.\image-20230730183458276.png)

#### label selector

选择特定 label 的 pod：

```
kubectl get pod -l creation_method=manual
```

![image-20230730191235341](.\image-20230730191235341.png)

To list all pods that include the env label, whatever its value is:

```
kubectl get pod -l env
```

把那些不包含env label的pod选择出来：

```
kubectl get pod -l '!env'
```

![image-20230730191534930](.\image-20230730191534930.png)

其他一些利用label的选择表达式：

1. creation_method!=manual to select pods with the creation_method label with any value other than manual。
2. env in (prod,devel) to select pods with the env label set to either prod or devel
3. env notin (prod,devel) to select pods with the env label set to any value other than prod or devel

A selector can also include multiple comma-separated criteria. Resources need to match all of them to match the selector. 

For example, you want to select only pods running the beta release of the product catalog microservice, you’d use the following selector: app=pc,rel=beta

## Using labels and selectors to constrain pod scheduling

一般情况，创建好的pod会被随机调度到任意一个node上。

通过给node增加label，可以让一个pod被调度到特定的node上。

给一个 node 增加 label：

```
kubectl label node node1.k8s gpu=true
```

通过label过滤选择对应的node：

```
kubectl get nodes -l gpu=true
```

![image-20230730192726973](.\image-20230730192726973.png)

通过nodeSelector属性指定pod需要被调用到哪类node上：

![image-20230730193251786](.\image-20230730193251786.png)

## Annotating pods

Annotations are similar to labels, but they aren’t meant to hold identifying information. They can’t be used to group objects the way labels can.

Annotations can hold **much larger pieces of information** and are primarily meant to be used by tools.

A great use of annotations is adding descriptions for each pod or other API object, so that everyone using the cluster can quickly look up information about each individual object. For example, an annotation used to specify the name of the person who created the object.

adding an annotation to your kubia-manual pod:

```
kubectl annotate pod kubia-manual mycompany.com/someannotation="foo bar"
```

![image-20230730194053870](.\image-20230730194053870.png)

## Stopping and removing pods

delete the kubia-gpu pod by name:

```
kubectl delete po kubia-gpu
```

![image-20230730200402327](.\image-20230730200402327.png)

By deleting a pod, you’re instructing Kubernetes to terminate all the containers that are part of that pod. Kubernetes sends a SIGTERM signal to the process and waits a certain number of seconds (30 by default) for it to shut down **gracefully**. If it doesn’t shut down in time, the process is then killed through SIGKILL.

Deleting pods using label selectors:

```
kubectl delete po -l creation_method=manual
```

![image-20230730200735690](.\image-20230730200735690.png)

Tell Kubernetes to delete all pods in the current namespace by using the **--all** option:

```
kubectl delete po --all
```

![image-20230730201209337](.\image-20230730201209337.png)

## Using namespaces to group resources

Namespaces provide a scope for resource names. 

Namespaces enable you to separate resources that don’t belong together into nonoverlapping groups. 

If several users or groups of users are using the same Kubernetes cluster, and they each manage their own distinct set of resources, they should each use their own namespace. 

This way, they don’t need to take any special care not to inadvertently modify or delete the other users’ resources and don’t need to concern themselves
with name conflicts.

Besides isolating resources, namespaces are also used for allowing only certain users access to particular resources and even for limiting the amount of computational resources available to individual users. 

list all namespaces in your cluster:

```
kubectl get ns
```

or

```
kubectl get namespace
```

![image-20230730194503830](.\image-20230730194503830.png)

当不指定任何namespace时，默认使用default namespace。

When listing resources with the `kubectl get` command, you’ve never specified the namespace explicitly, so kubectl always defaulted to the default namespace, showing you only the objects in that namespace.

list pods in kube-system namespace only:

```
kubectl get po --namespace kube-system
```

![image-20230730194835694](.\image-20230730194835694.png)

#### Creating a namespace

可以通过 post 一个 yaml 文件创建namespace，也可以通过简单的命令创建一个namespace。

```
kubectl create -f custom-namespace.yaml
```

**OR**

```
kubectl create namespace custom-namespace
```

![image-20230730195851406](.\image-20230730195851406.png)

#### Deleting the whole namespace

Delete the whole namespace, the pods in that namespace will be deleted along with the namespace automatically.

```
kubectl delete ns custom-namespace
```

## Kubernetes dashboard

默认情况下不会部署 Dashboard。参考如下Doc部署 Dashboard：

```
https://kubernetes.io/zh-cn/docs/tasks/access-application-cluster/web-ui-dashboard/
```

#### 访问dashboard

你可以使用 `kubectl` 命令行工具来启用 Dashboard 访问，命令如下：

```
kubectl proxy
```

kubectl 会使得 Dashboard 可以通过 http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/ 访问。

登录dashboard需要的token:

```
eyJhbGciOiJSUzI1NiIsImtpZCI6IkppdnBSX0JqNVg2UXB2NEhIWGlkdEJXUEVxaEE5SEt2NHlEa3RhX3ZHSFEifQ.eyJpc3MiOiJrdWJlcm5ldGVzL3NlcnZpY2VhY2NvdW50Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9uYW1lc3BhY2UiOiJrdWJlcm5ldGVzLWRhc2hib2FyZCIsImt1YmVybmV0ZXMuaW8vc2VydmljZWFjY291bnQvc2VjcmV0Lm5hbWUiOiJhZG1pbi11c2VyIiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9zZXJ2aWNlLWFjY291bnQubmFtZSI6ImFkbWluLXVzZXIiLCJrdWJlcm5ldGVzLmlvL3NlcnZpY2VhY2NvdW50L3NlcnZpY2UtYWNjb3VudC51aWQiOiIxMzZkNDQwNS0zYjc3LTQwZjgtYTg1Zi01ZWIyNzE2NTRmN2MiLCJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6a3ViZXJuZXRlcy1kYXNoYm9hcmQ6YWRtaW4tdXNlciJ9.Yq859JmzNEayHR5Du1sRoDFHLgbImA4v_hgNDDrPUmDvyNYveID6m9SsolM05U9EtTM4Z2XiOm2Bsuxs9V0LxKTm4NeUY3md-hHIBWiRIGY6wqXPTZWi4to6C7xzkfnapj7xZ09TN6nJZNEWnFRhmKsZEe0kx54mmO3wqnwvs5pyglgU2jk0WOROU2bT34vP6vBvdwBFdbKmNzPcnOWjZ7DghJ6x7-p4wz59SXMjzdWaQkizkzb87yzzYumOPeFULoi-m7fnTA7mq1zx7U8LPGOAC21lXb-wyt_Mf9Ca10JXqkePDvjKbiOEmB1-9ReyFxE1s2toZQsWks74rio8FA
```

