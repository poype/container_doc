Because the reference to the PersistentVolumeClaim is in the pod template, which is used to stamp out multiple pod replicas, you can’t make each replica use its **own** separate PersistentVolumeClaim. 

You can’t use a ReplicaSet to run a distributed data store, where each instance needs its own separate storage—at least not by using a single ReplicaSet. To be honest, none of the API objects you’ve seen so far make running such a data store possible. 

All pods from the same ReplicaSet always use the same PersistentVolumeClaim and PersistentVolume:

![image-20230813104914199](.\image\image-20230813104914199.png)

In addition to storage, certain clustered applications also require that each instance has a long-lived **stable identity**.

Pods can be killed from time to time and replaced with new ones. When a ReplicaSet replaces a pod, the new pod is a completely new pod with a **new hostname and IP**. 

Certain apps(like **zookeeper**) require the administrator to list all the other cluster members and their IP addresses (or hostnames) in each member’s configuration file. But in Kubernetes, every time a pod is rescheduled, the new pod gets both a new hostname and a new IP address, so the whole application cluster would have to be reconfigured every time one of its members is rescheduled.

##### STATEFULSETS

A StatefulSet makes sure pods are rescheduled in such a way that they retain their identity and state. It also allows you to easily scale the number of pets up and down. A StatefulSet, like a ReplicaSet, has a desired replica count field that determines how many pets you want running at that time. Similar to ReplicaSets, pods are created from a pod template specified as part of the StatefulSet. But unlike pods created by ReplicaSets, pods created by the StatefulSet aren’t exact replicas of each other. **Each can have its own set of volumes**—in other words, storage (and thus persistent state)—which differentiates it from its peers. **Pet pods also have a predictable (and stable) identity** instead of each new pod instance getting a completely random one.

## Providing a stable network identity

Each pod created by a StatefulSet is assigned an ordinal index (zero-based), which is then used to derive the pod’s name and hostname, and to attach stable storage to the pod.

Pods created by a StatefulSet have predictable names (and hostnames), unlike those created by a ReplicaSet：

![image-20230813180954311](.\image\image-20230813180954311.png)

ReplicaSet创建Pod的名字后缀都是随机的，但StatefulSet创建Pod的名字后缀是按照顺序递增的ID。

#### REPLACING LOST PETS

When a pod instance managed by a StatefulSet disappears, the StatefulSet makes sure it’s replaced with a new instance—similar to how ReplicaSets do it. But in contrast to ReplicaSets, the replacement pod gets the **same name and hostname** as the pod that has disappeared.

A StatefulSet replaces a lost pod with a new one with the same identity:

![image-20230813183619248](.\image\image-20230813183619248.png)

whereas a ReplicaSet replaces it with a completely new unrelated pod:

![image-20230813183739029](.\image\image-20230813183739029.png)

#### SCALING A STATEFULSET

Scaling the StatefulSet creates a new pod instance with the next unused ordinal index. If you scale up from two to three instances, the new instance will get index 2.

Scaling down a StatefulSet always removes the pod with the highest ordinal index first:

![image-20230813184303947](.\image\image-20230813184303947.png)

如果是对 ReplicaSet 进行 scaling down, 则会随机删除一个pod。

StatefulSets scale down **only one pod** instance at a time. The scale-down of StatefulSets must be sequential. Because a distributed data store may lose data if multiple nodes go down at the same time.

## Providing stable dedicated storage to each stateful instance

Because PersistentVolumeClaims map to PersistentVolumes one-to-one, each pod of a StatefulSet needs to reference a different PersistentVolumeClaim to have its **own** separate PersistentVolume.

The StatefulSet has to create the PersistentVolumeClaims as well, the same way it’s creating the pods.

A StatefulSet creates both pods and PersistentVolumeClaims:

![image-20230813190235510](.\image\image-20230813190235510.png)

A StatefulSet can also have one or more volume claim templates, which enable it to **stamp out PersistentVolumeClaims along with each pod instance**.

The PersistentVolumes for the claims can either be provisioned up-front by an administrator or just in time through dynamic provisioning of PersistentVolumes.

StatefulSets don’t delete PersistentVolumeClaims when scaling down; then they can **reattach** them when scaling back up:

![image-20230813201342105](.\image\image-20230813201342105.png)

## STATEFULSET’S AT-MOST-ONE

Kubernetes must take great care to ensure two stateful pod instances are never running with the same identity and are bound to the same PersistentVolumeClaim. This means a StatefulSet must be absolutely certain that a pod is no longer running before it can create a replacement pod.



# Deploying the app through a StatefulSet

#### CREATING THE GOVERNING SERVICE

before deploying a StatefulSet, you first need to create a headless Service, which will be used to provide the **network identity** for your stateful pods.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: kubia
spec:
  clusterIP: None  # The StatefulSet's governing Service must be headless.
  selector:
    app: kubia
  ports:
  - name: http
    port: 80
```

创建这个headless service是为了给statefulset中的每个pod提供一个稳定的网络标识。

在Service章节中已经学过，kubia service在K8S集群内部对应的域名是：

```http
kubia.default.svc.cluster.local
```

1. `kubia` corresponds to the service name.
2. `default` stands for the **namespace** the service is defined in.
3. `svc.cluster.local` is a configurable cluster **domain suffix** used in all cluster local service names.

利用Service，可以通过如下域名访问到一个单独的Pod：

```http
kubia-0.kubia.default.svc.cluster.local
kubia-1.kubia.default.svc.cluster.local
kubia-2.kubia.default.svc.cluster.local
```

可以看出Pod的域名就是在Service的域名前加上Pod的名字。由于StatefulSet中Pod的名字是稳定不变的，所有每个Pod就有一个稳定的网络域名。

由于创建这个Service的目的是为了给StatefulSet中的每个Pod提供一个稳定的网络标识，并不是用来做Porxy，所以将它的clusterIP设置为None。

#### CREATING THE STATEFULSET MANIFEST

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: kubia
spec:
  serviceName: kubia
  replicas: 3
  selector:
    matchLabels:
      app: kubia  # has to match spec.template.metadata.labels
  template:
    metadata:
      labels:
        app: kubia  # Pods created by the StatefulSet will have the app=kubia label.
    spec:
      containers:
      - name: kubia
        image: luksa/kubia-pet
        ports:
        - name: http
          containerPort: 8080
        volumeMounts:
        - name: data
          mountPath: /var/data
  volumeClaimTemplates:   # The PersistentVolumeClaims will be created from this template.
  - metadata:
      name: data
    spec:
      resources:
        requests:
          storage: 1Mi
      accessModes:
      - ReadWriteOnce
```

Pod是按照id的递增顺序一个一个被创建的：

![image-20230813220931308](.\image\image-20230813220931308.png)

删除一个Pod，触发创建一个新的Pod：

![image-20230813221336268](.\image\image-20230813221336268.png)

kubia-0 pod从 node2 转移到了 node1，它的名字没有变化，但IP地址还是变了。

虽然IP地址变了，但由于Pod的名字并没有变，所以 kubia-0 pod 的hostname没有变。仍然可以使用下面的域名访问到kubia-0 Pod：

```http
kubia-0.kubia.default.svc.cluster.local
```

A stateful pod may be rescheduled to a different node, but it retains the name, hostname, and storage.

![image-20230813222054009](D:\Workspace\container_doc\10_stateful\image\image-20230813222054009.png)

## 总结

对于StatefulSet中的Pod，要保持的状态有两种类型：

1. 要有一个稳定的网络标识，即使 Pod 挂机被重新调度到另外一个node，网络标识也不能变。
2. 每个Pod要有独立的Storage，当 Pod 挂机被重新创建，新创建的Pod也要使用原来分配的Storage。

关于稳定的网络标识，K8S是通过headless service给每个Pod提供一个稳定的hostname。

关于每个Pod独立的Storage，StatefulSet中有volumeClaimTemplates属性。根据这个template，StatefulSet会自动为每个Pod创建独有的PVC，PVC的名字与其Pod名字类似，也是利用一个顺序递增的ID组装成PVC的名字。