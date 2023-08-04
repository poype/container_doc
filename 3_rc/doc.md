## liveness probe

For pods running in production, you should always define a liveness probe. Without one, Kubernetes has no way of knowing whether your app is still alive or not. As long as the process is still running, Kubernetes will consider the container to be healthy.

但进程在running不代表应用是健康的，例如死循环、死锁等。

#### Kubernetes提供了三种类型的 liveness probe

1. An HTTP GET probe performs an HTTP GET request on the container’s IP address, a port and path you specify. If the probe receives a response, and the response code doesn’t represent an error (in other words, if the HTTP response code is 2xx or 3xx), the probe is considered successful. If the server returns an error response code or if it doesn’t respond at all, the probe is considered a failure and the container will be restarted as a result.
2. A TCP Socket probe tries to open a TCP connection to the specified port of the container. If the connection is established successfully, the probe is successful. Otherwise, the container is restarted.
3. An Exec probe executes an arbitrary command inside the container and checks the command’s exit status code. If the status code is 0, the probe is successful. All other codes are considered failures.

#### 创建一个 liveness probe

kubia-liveness-probe.yaml文件创建的pod中定义了一个liveness probe。

这个 liveness probe 会让 kubernetes 周期性的发送 HTTP GET request 到指定的 path 和 port。 

如果 liveness probe 收到成功的 reseponse(http code 2xx)， 就认为 app 当前处于 health 状态。

如果 liveness probe 收到表示失败的 reseponse 或 一直收不到任何 response，则认为 app 当前处于failure状态并重启container。

由于 app 在返回5次成功的response后，就会开始返回http 500，所以 liveness probe 就会检测到失败：

![image-20230801074720758](.\image\image-20230801074720758.png)

liveness probe 检测到失败后，k8s 就会重启pod，所以等一会之后，pod的状态又会恢复到 Running：

![image-20230801074907177](.\image\image-20230801074907177.png)

注意到 pod 被重启的次数被加1。

You can see why the container had to be restarted by looking at what kubectl describe prints out：

![image-20230801083854090](.\image\image-20230801083854090.png)

The exit code was 137, which has a special meaning—it denotes that the process was terminated by an external signal. 

The number 137 is a sum of two numbers: 128+x, where x is the signal number sent to the process that caused it to terminate.

In the example, x equals 9, which is the number of the SIGKILL signal, meaning the process was killed forcibly.

#### Configuring additional properties of the liveness probe

You may have noticed that `kubectl describe` also displays additional information about the liveness probe:

```
Liveness:       http-get http://:8080/ delay=0s timeout=1s period=10s #success=1 #failure=3
```

1. The `delay=0s` part shows that the probing begins immediately after the container is started.
2. The timeout is set to only 1 second, so the container must return a response in 1 second or the probe is counted as failed.
3. The container is probed every 10 seconds (period=10s)
4. The container is restarted after the probe fails three consecutive times (#failure=3)

These additional parameters can be customized when defining the probe. For example, to set the initial delay, add the **initialDelaySeconds** property to the liveness probe as shown in the following listing：

```yaml
livenessProbe: 
	httpGet:
    	path: /
    	port: 8080
    initialDelaySeconds: 15	  # Kubernetes will wait 15 seconds before executing the first probe.
```

If you don’t set the initial delay, the prober will start probing the container as soon as it starts, which usually leads to the probe failing, because the app isn’t ready to start receiving requests.

**initialDelaySeconds 这个属性应该必须要添加的。**

## Introducing ReplicationControllers

**When a node fails, only pods backed by a ReplicationController are recreated.** Pod A is lost completely, nothing will ever recreate it.

![image-20230802062105566](.\image\image-20230802062105566.png)

ReplicationController 根据 Pod 的 label 对 Pod 进行管理，它确保 Pod 的数量永远与其 desired number 相匹配。

If too few such pods are running, it creates new replicas from a pod template. If too many such pods are running, it removes the excess replicas.

#### ReplicationController‘s RECONCILIATION LOOP

![image-20230802063425860](.\image\image-20230802063425860.png)

#### THREE PARTS OF A REPLICATIONCONTROLLER

1. A label selector, which determines what pods are in the ReplicationController’s scope
2. A replica count, which specifies the desired number of pods that should be running
3. A pod template, which is used when creating new pod replicas

![image-20230802063702634](.\image\image-20230802063702634.png)

A ReplicationController’s replica count, the label selector, and even the pod template can all be modified at any time, **but only changes to the replica count affect existing pods**.

#### Changes to the label selector and the pod template have no effect on existing pods.

1. Changing the label selector makes the existing pods fall out of the scope of the ReplicationController, so the controller stops caring about them.

2. Changing  the template only affects new pods created by this ReplicationController.

#### THE BENEFITS OF USING A REPLICATIONCONTROLLER

1. It makes sure a pod (or multiple pod replicas) is always running by starting a new pod when an existing one goes missing.
2. When a cluster node fails, it creates replacement replicas for all the pods that were running on the failed node.
3. It enables easy horizontal scaling of pods—both manual and automatic.

## Creating a ReplicationController

```yaml
apiVersion: v1
kind: ReplicationController    # This manifest defines a ReplicationController
metadata:
  name: kubia                  # The name of this ReplicationController
spec:
  replicas: 3                  # The desired number of pod instances 
  selector:
    app: kubia                 # The pod selector determining what pods the RC is operating on
  template:                    # The pod template for creating new pods
    metadata:
      labels:
        app: kubia
    spec:
      containers:
      - name: kubia
        image: skyliu01/kubia
        ports:
        - containerPort: 8080
```

The pod labels in the template must obviously match the label selector of the ReplicationController. 

可以不明确指定 RC 的 selector：

Not specifying the selector at all is also an option. In that case, it will be configured automatically from the labels in the pod template.

查询 ReplicationController：

```
kubectl get rc
```

![image-20230802073617712](.\image\image-20230802073617712.png)



#### 删除一个 Pod

手动删除一个 node2 上的 pod，RC 会自动在 node1 上创建一个新的 pod。确保 pod 的数量永远是3。

![image-20230802071401407](D:\Workspace\container_doc\3_rc\image\image-20230802071401407.png)

#### 关掉 node1 节点

关掉 node1 节点，模拟一个node宕机：

![image-20230802084112083](.\image\image-20230802084112083.png)

虽然最终确定了，在关闭node2后，原来运行在node2上的pod会被自动转移到node1上。但这个过程花费的时间很多，至少需要5分钟。

但将node2关闭后，K8S马上就能检测到有一个Node处于NotReady状态。它知道有一个Node挂了，但并没有马上转移Pod。

下面是书中对于“等Node挂掉很久才开始创建新Pod”的解释：

Kubernetes waits a while before rescheduling pods (in case the node is unreachable because of a temporary network glitch or because the Kubelet is restarting). If the node stays unreachable for **several minutes**, the status of the pods that were scheduled to that node changes to Unknown. At that point, the ReplicationController will immediately spin up a new pod.

另外一个现象是原来运行在node2上的pod一直无法被**完全**删除掉，那三个Pod一直处于Terminating状态。直到node2节点被重新启动后，原来的那些pod才会被真正删除掉。

## ReplicationController只是根据label来管理pod

Pods created by a ReplicationController aren’t tied to the ReplicationController in any way. At any moment, a ReplicationController manages pods that match its label selector. By changing a pod’s labels, it can be removed from or added to the scope of a ReplicationController.

Removing a pod from the scope of a ReplicationController by changing its labels:

![image-20230802221819426](.\image\image-20230802221819426.png)

After you change the pod’s label from app=kubia to app=foo, the ReplicationController no longer cares about the pod. Because the controller’s replica count is set to 3 and only two pods match the label selector, the ReplicationController spins up pod kubia-2qneh to bring the number back up to three.

#### label 在 kubernetes 中是一个非常重要的概念 ！！！！！！

## Changing the pod template

Changing a ReplicationController’s pod template only affects pods created **afterward** and **has no effect on existing pods**.

![image-20230802222304247](.\image\image-20230802222304247.png)

## Horizontally scaling pods

SCALING UP 

```
kubectl scale rc kubia --replicas=10
```

![image-20230802222632899](.\image\image-20230802222632899.png)

SCALE DOWN

```
kubectl scale rc kubia --replicas=3
```

![image-20230802223059276](.\image\image-20230802223059276.png)

You’re not telling Kubernetes what or how to do it. You’re just specifying the desired state.

## Deleting a ReplicationController

When you delete a ReplicationController through kubectl delete, the pods are also deleted.

但是，如果在执行delete命令时添加了**`--cascade=false`**参数，那RC管理的Pod就不会被删除。

Deleting a replication controller with `--cascade=false` leaves pods unmanaged.

![image-20230803074815767](.\image\image-20230803074815767.png)

```
kubectl delete rc kubia --cascade=false
```

![image-20230803075201784](.\image\image-20230803075201784.png)

后面要使用 `--cascade=orphan`，orphan 是孤儿的意思。

## ReplicaSets

ReplicaSet is a new generation of ReplicationController and replaces it completely (ReplicationControllers will eventually be deprecated).

You should always create ReplicaSets instead of ReplicationControllers from now on.

#### ReplicaSet has more expressive pod selectors.

A single ReplicationController can’t match pods with the label `env=production` and those with the label `env=devel` at the same time. It can only match either pods with the `env=production` label or pods with the `env=devel` label. But a single ReplicaSet can match both sets of pods and treat them as a single group.

Similarly, a ReplicationController can’t match pods based merely on the presence of a label key, regardless of its value, whereas a ReplicaSet can. For example, a ReplicaSet can match all pods that include a label with the key env, whatever its actual value is (you can think of it as env=*).

#### Defining a ReplicaSet

```yaml
apiVersion: apps/v1          # ReplicaSets belong to the apps API group and version v1beta2.
kind: ReplicaSet
metadata:
  name: kubia
spec:
  replicas: 3
  selector:
    matchLabels:             # You are using the simpler matchLabels selector here.
      app: kubia
  template:                  # The template is the same as in the ReplicationController.
    metadata:
      labels:
        app: kubia
    spec:
      containers:
      - name: kubia
        image: skyliu01/kubia
        ports:
        - containerPort: 8080
        livenessProbe:
          httpGet:
            path: /
            port: 8080
```

#### 删除 ReplicaSet

删除ReplicaSet的同时，它管理的 pod 也会被自动清除：

![image-20230803223721285](.\image\image-20230803223721285.png)

## DaemonSets

DaemonSets run only a single pod replica on each node, whereas ReplicaSets scatter them around the whole cluster randomly.

![image-20230804072253265](.\image\image-20230804072253265.png)

**DaemonSet doesn’t have any notion of a desired replica count.** It doesn’t need it because its job is to ensure that a pod matching its pod selector is running on each node.

A DaemonSet deploys pods to all nodes in the cluster, unless you specify that the pods should only run on a subset of all the nodes. This is done by specifying the **nodeSelector** property in the pod template, which is part of the DaemonSet definition.

默认DS会在每个node上都运行一个pod，但如果在**pod的定义中**指定nodeSelector属性，那么就只会在特定的node上运行pod。注意nodeSelector属性是在pod的定义中，而不是在DS的定义中。

创建一个DaemonSet：

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: ssd-monitor
spec:
  selector:
    matchLabels:
      app: ssd-monitor
  template:
    metadata:
      labels:
        app: ssd-monitor
    spec:
      nodeSelector:
        disk: ssd     # node selector, which selects nodes with the disk=ssd label
      containers:
        - name: main
          image: luksa/ssd-monitor
```

刚创建好DaemonSet后，K8S没有创建任何一个pod，因为此时没有一个node拥有对应的 label。

![image-20230804074907090](.\image\image-20230804074907090.png)

给一个node增加label后，会在那个node上自动创建一个pod：

![image-20230804075243403](.\image\image-20230804075243403.png)

![image-20230804075327986](.\image\image-20230804075327986.png)

如果此时将 node2 节点的 disk label 换成其它值，那么运行的pod会被自动删除掉：

![image-20230804075735130](.\image\image-20230804075735130.png) 
