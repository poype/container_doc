Requests and limits are specified for **each container** individually, not for the pod as a whole. 

The pod’s resource requests and limits are the sum of the requests and limits of all its containers.

**Creating pods with resource requests:**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: requests-pod
spec:
  containers:
  - image: busybox
    command: ["dd", "if=/dev/zero", "of=/dev/null"]
    name: main
    resources:
      requests:
        cpu: 200m     # The container requests 200 millicores, 1/5 of a single CPU core’s time
        memory: 10Mi  # requests 10 mebibytes of memory.
```

##### millicores定义

毫核代表CPU 时间的一小部分，而不是 CPU 数量。最好把 millicores 看作是表示分数的一种方式，*x* millicores对应分数 x/1000。

例如 100 millicores = 100/1000 = 1/10，这意味着它使用了10 秒中的 1 秒。

如果该值大于 1，则该进程正在使用多个 CPU。值 2300mcpu 用于表示该进程使用了 2 个完整的 CPU时间， 外加 3/10的CPU时间。

##### mebibytes(Mi)定义

a unit of information equal to 1024 kibibytes or 2^20 (1,048,576) bytes.

10Mi 就是 10MB

##### 如果不指定resources.requests

When you don’t specify a request for CPU, you’re saying you don’t care how much CPU time the process running in your container is allotted. In the worst case, it may not get any CPU time at all.

## Understanding how resource requests affect scheduling

By specifying resource requests, you’re specifying the **minimum** amount of resources your pod needs. This information is what the Scheduler uses when scheduling the pod to a node. When scheduling a pod, the Scheduler will only consider nodes with enough unallocated resources to meet the pod’s resource requirements.

The Scheduler doesn’t look at how much of each individual resource is being used at the exact time of scheduling but at the sum of **resources requested** by the existing pods deployed on the node.

Scheduler并不根据每个Pod真实使用的resource大小计算Node中resource的剩余量，它只根据每个Pod定义的request resource计算Node中资源的剩余量。

The Scheduler only cares about requests, not actual usage：

![image-20230820224538236](.\image\image-20230820224538236.png)

虽然A、B、C三个Pod的实际CPU使用时间没有那么多，但由于它们request的cpu时间很多，仍然导致Pod D无法被调度到该Node。

#### SELECTING THE BEST NODE FOR A POD

Scheduler 会先将那些无法容纳Pod的Node过滤掉。然后Scheduler会根据每个Pod的 request resource，主要基于两种算法从剩余的Node中选择出最优的Node承载Pod。

1. **LeastRequestedPriority**
   It prefers nodes with fewer requested resources (with a greater amount of unallocated resources).

2. **MostRequestedPriority**
   It prefers nodes that have the most requested resources (a smaller amount of unallocated CPU and memory).

The Scheduler is configured to use only one of those functions. 

As we’ve discussed, they both consider the amount of **requested resources**, not the amount of resources actually consumed.

If you have a set of nodes, you usually want to spread CPU load evenly across them. However, that’s not the case when running on cloud infrastructure, where you can add and remove nodes whenever necessary. By configuring the Scheduler to use the MostRequestedPriority function, you guarantee that Kubernetes will use the smallest possible number of nodes while still providing each pod with the amount of CPU/memory it requests. Because you’re paying for individual nodes, this saves you money（**省钱**）.

#### NODE’S CAPACITY

The Scheduler needs to know how much CPU and memory each node has, the **Kubelet** reports this data to the API server, making it available through the Node resource.

![image-20230821075952996](.\image\image-20230821075952996.png)

The output shows two sets of amounts related to the available resources on the node: the node’s capacity and allocatable resources. The Scheduler bases its decisions only on the **allocatable resource** amounts.

## Limiting resources available to a container

Setting resource requests for containers in a pod ensures each container gets the **minimum** amount of resources it needs.

Requests don’t limit the amount of CPU a container can use.You’d need to specify a CPU limit to do that.

CPU is a compressible resource, which means the amount used by a container can be throttled without affecting the process running in the container

Memory is obviously different—it’s incompressible. Once a process is given a chunk of memory, that memory can’t be taken away from it until it’s released by the process itself.

Without limiting memory, a container (or a pod) running on a worker node may eat up all the available memory and affect all other pods on the node and any new pods scheduled to the node. A single malfunctioning or malicious pod can practically make the whole node unusable. To prevent this from happening, Kubernetes allows you to specify resource limits for every container.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: limited-pod
spec:
  containers:
  - image: busybox
    command: ["dd", "if=/dev/zero", "of=/dev/null"]
    name: main
    resources:
      limits:
        cpu: 1         # This container will be allowed to use at most 1 CPU core.
        memory: 20Mi   # The container will be allowed to use up to 20 mebibytes of memory.
```

The sum of resource limits of all pods on a node can exceed 100% of the node’s capacity:

![image-20230821093205608](D:\Workspace\container_doc\12_resource\image\image-20230821093205608.png)

#### Exceeding the limits

What happens when a process running in a container tries to use a greater amount of resources than it’s allowed to?

when a CPU limit is set for a container, the process isn’t given more CPU time than the configured limit.

With memory, it’s different. When a process tries to allocate memory over its limit, the process is killed(**OOMKilled**).

#### how apps in containers see limits

limited-pod 的 resource limit 分别是 1 CPU时间 和 20Mi 的内存。下图是在其container内部执行top和free两个命令显示的CPU和内存总资源，container 看到的是**整个Node的资源**大小：

![image-20230821094753086](.\image\image-20230821094753086.png)

container中的进程看到的资源要比它实际能够使用的资源上限多很多。

Even though you set a limit on how much memory is available to a container, **the container will not be aware of this limit**.

This has an unfortunate effect on any application that looks up the amount of memory available on the system and uses that information to decide how much memory it wants to reserve.

Exactly like with memory, containers will also see all the node’s CPUs, regardless of the CPU limits configured for the container. Certain applications look up the number of CPUs on the system to decide how many worker threads they should run. Again, such an app will run fine on a development laptop, but when deployed on a node with a much bigger number of cores, it’s going to spin up too many threads.

##### 让container获取真正的资源上限

要想在container内部获取到真正分配给container的资源上限(Limiting resources)，可以读取container中对应cgroup的文件：

```shell
cat /sys/fs/cgroup/memory/memory.limit_in_bytes  # memory limit
cat /sys/fs/cgroup/cpu/cpu.cfs_quota_us          # cpu limit
cat /sys/fs/cgroup/cpu/cpu.cfs_period_us         # cpu limit
```

![image-20230821100730156](.\image\image-20230821100730156.png)

cpu.cfs_quota_us 文件中的的值与kubernetes中的cpu资源单位millicores是100倍的关系：

| K8S中cpu资源数值 | cpu.cfs_quota_us文件中的数值 |
| :--------------: | :--------------------------: |
|        1         |            100000            |
|      1000m       |            100000            |
|       300m       |            30000             |

## QoS classes

Resource limits can be overcommitted. This has an important consequence—when 100% of the node’s resources are used up, certain containers will need to be killed.

同一个节点上的多个Pod的resource **limit**的总和可以超过节点上总共的资源。这就带来一个问题，当有多个Pod要申请的Memory总和超过了节点拥有的Memory总量时，应该把哪个Pod删除掉，以便腾出更多的memory资源交给另一个Pod使用？

Kubernetes does this by categorizing pods into three Quality of Service (QoS) classes:

1. **BestEffort (the lowest priority)**
   The lowest priority QoS class is the BestEffort class. It’s assigned to pods that don’t have any requests or limits set at all (**in any of their containers**).
   In the worst case, they may get almost no CPU time at all and will be the first ones killed when memory needs to be freed for other pods.
2. **Guaranteed (the highest)**
   This class is given to pods whose containers’ requests are equal to the limits for all resources.
   **a.** Requests and limits need to be set for both CPU and memory.
   **b.** They need to be set for **each** container.
   **c.** They need to be equal (the limit needs to match the request for each resource in each container).
   Because a container’s resource requests, if not set explicitly, default to the limits, specifying the limits for all resources (for each container in the pod)
   is enough for the pod to be Guaranteed.
3. **Burstable**
   In between BestEffort and Guaranteed is the Burstable QoS class. All other pods fall into this class.

![image-20230821202808904](.\image\image-20230821202808904.png)

The QoS class of a **single-container** pod based on resource requests and limits CPU:

![image-20230821202937179](.\image\image-20230821202937179.png)

A Pod’s QoS class derived from the classes of its containers:

![image-20230821203033761](.\image\image-20230821203033761.png)

When the system is overcommitted, the QoS classes determine which container gets killed first so the freed resources can be given to higher priority pods. 

First in line to get killed are pods in the BestEffort class, followed by Burstable pods, and finally Guaranteed pods, which **only** get killed if system processes need **memory**.

**只有当内存资源紧缺时才会删除Pod。**

#### Which pods get killed first

![image-20230821205932153](.\image\image-20230821205932153.png)

对于两个相同QoS的Pod，OOM scores高的Pod会先被删除。

**更容易被OOM Kill的POD会先被干掉，因为即使这种Pod获取到更多的内存资源，它们也更有可能被OOM Kill，所以还不如就先把它们干掉**。

Each running process has an OutOfMemory (OOM) score. OOM scores are calculated from two things: the percentage of the available memory the process is consuming and a fixed OOM score adjustment, which is based on the pod’s QoS class and the container’s requested memory.