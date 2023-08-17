## Understanding the architecture

##### COMPONENTS OF THE CONTROL PLANE

1. The etcd distributed persistent storage
2. The API server
3. The Scheduler
4. The Controller Manager

##### COMPONENTS RUNNING ON THE WORKER NODES

1. The Kubelet
2. The Kubernetes Service Proxy (kube-proxy)
3. The Container Runtime (Docker, rkt, or others)

##### ADD-ON COMPONENTS

1. The Kubernetes DNS server
2. The Dashboard
3. An Ingress controller
4. . . .

Kubernetes components of the Control Plane and the worker nodes:

![image-20230815090206989](.\image\image-20230815090206989.png)

Kubernetes system components communicate **only with the API server**. They don’t talk to each other directly.

The API server is the only component that communicates with etcd.

The components of the Control Plane can easily be split across multiple servers. There can be more than one instance of each Control Plane component running to ensure high availability. 

While multiple instances of etcd and API server can be active at the same time and do perform their jobs in **parallel**, only a **single** instance of the Scheduler and the Controller Manager may be active at a given time—with the others in standby mode.

The components on the worker nodes all need to run on the same node.

ETCD是一个很类似Zookeeper的数据库。

## API Server

The API server doesn’t do anything except **store** resources in etcd and **notify** clients about the change.

API Server处理kubectl client发送request的流程：

![image-20230815221059223](.\image\image-20230815221059223.png)

The Kubernetes API server is the central component used by all other components and by clients, such as kubectl. It provides a **CRUD interface** for querying and modifying the cluster state over a RESTful API. It stores that state in etcd.

API Server能够在资源的状态发生变化时将变化事件通知给订阅的component。

All API Server does is enable those controllers and other components to observe changes to deployed resources. A Control Plane component can request to be notified when a resource is created, modified, or deleted. This enables the component to perform whatever task it needs in response to a change of the cluster metadata.

Clients watch for changes by opening an HTTP connection to the API server. Through this connection, the client will then receive a stream of modifications to the watched objects. 

Every time an object is updated, the server sends the new version of the object to all connected clients watching the object.

When an object is updated, the API server sends the updated object to all interested watchers：

![image-20230815222712431](.\image\image-20230815222712431.png)

kubectl also supports watching resources. when deploying a pod, you don’t need to constantly poll the list of pods by repeatedly executing `kubectl get pods`. Instead, you can use the `--watch` flag and be notified of each creation, modification, or deletion of a pod:

```shell
kubectl get pods --watch
```

## Scheduler

The Scheduler only assigns a node to the pod.

All scheduler does is wait for newly created pods through the API server’s watch mechanism and assign a node to each new pod that doesn’t already have the node set.

**The Scheduler doesn’t instruct the selected node to run the pod.** All the Scheduler does is update the pod definition through the API server. The API server then notifies the Kubelet that the pod has been scheduled. As soon as the Kubelet on the target node sees the pod has been scheduled to its node, it creates and runs the pod’s containers.

## Controller Manager

You need other active components to make sure the actual state of the system converges toward the desired state, as specified in the resources deployed through the API server. This work is done by controllers running inside the Controller Manager.

The single Controller Manager process currently combines a multitude of controllers performing various reconciliation tasks. Eventually those controllers will be split up into separate processes：

1. Replication Manager (a controller for ReplicationController resources)
2. ReplicaSet, DaemonSet, and Job controllers
3. Deployment controller
4. StatefulSet controller
5. Node controller
6. Service controller
7. Endpoints controller
8. Namespace controller
9. PersistentVolume controller

Each controller connects to the API server and, through the watch mechanism to be notified of changes, but because using watches doesn’t guarantee the controller won’t miss an event, they also perform a re-list operation periodically to make sure they haven’t missed anything.

Controllers never talk to each other directly. They don’t even know any other controllers exist.

## Kubelet

The Kubelet is the component responsible for everything running on a worker node. 

Its initial job is to register the node it’s running on by creating a Node resource in the API server.

Then it needs to continuously monitor the API server for Pods that have been scheduled to the node, and start the pod’s containers. It does this by telling the configured container runtime (which is Docker, CoreOS’ rkt, or something else) to run a container from a specific container image. The Kubelet then constantly monitors running containers and reports their status, events, and resource consumption to the API server.

The Kubelet is also the component that runs the container **liveness** probes, restarting containers when the probes fail.

Lastly, it terminates containers when their Pod is deleted from the API server and notifies the server that the pod has terminated.

## kube-proxy

Every worker node also runs the kube-proxy, whose purpose is to make sure clients can connect to the services you define through the Kubernetes API.

The kube-proxy makes sure connections to the service IP and port end up at one of the pods backing that service. When a service is backed by more than one pod, the proxy performs load balancing across those pods.

The kube-proxy only uses iptables rules to redirect packets to a **randomly** selected backend pod without passing them through an actual proxy server.

kube-proxy只是利用iptables转发packet，并没有真正的proxy server存在：

![image-20230816084651420](.\image\image-20230816084651420.png)

这种实现方式并不能真正的支持round-robin， 它只能随机的选择一个Pod。

For example, if a service has two backing pods but only five clients, don’t be surprised if you see four clients connect to pod A and only one client connect to pod B.

## How controllers cooperate

1. Even before you start the whole process, the controllers, the Scheduler, and the Kubelet are watching the API server for changes to their respective resource types.
   ![image-20230816085302750](.\image\image-20230816085302750.png)

2. The chain of events that unfolds when a Deployment resource is posted to the API server:

   ![image-20230816201605656](.\image\image-20230816201605656.png)

## Event

Both the Control Plane components and the Kubelet **emit events to the API server** as they perform these actions. They do this by creating Event resources, which are like any other Kubernetes resource. 

You can retrieve events directly with **`kubectl get events`**. 

```shell
kubectl get events --watch
```

下面展示的是创建Deployment资源时的Event列表：

![image-20230816205105609](.\image\image-20230816205105609.png)



## Understanding what a running pod is

![image-20230816210049500](.\image\image-20230816210049500.png)

注意这里的 pause container，每一个Pod中都有一个pause container。

This pause container is the container that holds all the containers of a pod together. 

The pause container is an infrastructure container whose sole purpose is to hold all these namespaces. All other user-defined containers of the pod
then use the namespaces of the pod infrastructure container.

A two-container pod results in three running containers sharing the same Linux namespaces:

![image-20230816210631141](.\image\image-20230816210631141.png)

## Inter-pod networking

When pod A connects to (sends a network packet to) pod B, the source IP pod B sees must be the same IP that pod A sees as its own. There should be no network address translation (NAT) performed in between—the packet sent by pod A must reach pod B with both the source and destination address unchanged.

![image-20230816221107336](.\image\image-20230816221107336.png)

Packet的源IP地址和目标IP地址在发送过程中不会有任何改变。所有的POD就好像运行在只有一个交换机的局域网中一样。

## How services are implemented

Everything related to Services is handled by the kube-proxy process running on each node.

Each Service gets its own stable IP address and port. The IP address is virtual—it’s not assigned to any network interfaces and is never listed as either the source or the destination IP address in a network packet when the packet leaves the node.

Service的IP地址根本就不会出现在网络Packet中。

When a service is created in the API server, the virtual IP address is assigned to it immediately. Soon afterward, the API server notifies **all** kube-proxy agents running on the worker nodes that a new Service has been created.

Then, each kube-proxy makes that service addressable on the node it’s running on. It does this by setting up a few iptables rules, which make sure each packet destined for the service IP/port pair is intercepted and its destination address modified, so the packet is redirected to one of the pods backing the service.

Besides watching the **API server** for changes to Services, kube-proxy also watches for changes to **Endpoints** objects.

Network packets sent to a Service’s virtual IP/port pair are modified and redirected to a randomly selected backend pod：

![image-20230816224214181](.\image\image-20230816224214181.png)

Packet is first handled by node A’s **kernel** according to the iptables rules set up on the node.

The **kernel** checks if the packet matches any of those iptables rules. One of them says that if any packet has the destination IP equal to 172.30.0.1 and destination port equal to 80, the packet’s destination IP and port should be replaced with the IP and port of a randomly selected pod.