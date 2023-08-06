Each container in a pod has its own isolated filesystem, because the filesystem comes from the container’s image.

Volumes are defined as a part of a pod and share the same lifecycle as the pod. This means a volume is created when the pod is started and is destroyed when the pod is deleted. Because of this, **a volume’s contents will persist across container restarts**.

After a container is restarted, the new container can see all the files that were written to the volume by the previous container.

**volume的生命周期是与pod保持一致的**，所以container即使被重启，也可以重新连接到原来的volume。

Kubernetes volumes are a component of a pod and are thus defined in the pod’s specification. Volumes aren’t a standalone Kubernetes object and cannot be created or deleted on their own.

**Volume不能独立存在，它只能作为 Pod 定义的一部分。**

A volume is available to all containers in the pod, but **it must be mounted in each container** that needs to access it.

如果某个container想要使用在pod中定义的一个volume，那么该container需要明确挂载那个volume。

Three containers sharing two volumes mounted at **various mount paths**：

![image-20230806083257657](.\image\image-20230806083257657.png)

同一个volume可以被挂载到两个container中的不同的文件路径下。例如上图的publicHtml Volume，在webServer container中是挂载到`/var/htdocs`路径下，但在ContentAgent container中是挂载到`/var/html`路径下。

Linux allows you to mount a filesystem at arbitrary locations in the file tree. When you do that, the contents of the mounted filesystem are accessible in the directory it’s mounted into.

有多种不同类型的volume，我先只关注下面这几种类型的volume：

1. emptyDir—A simple empty directory used for storing transient data.
2. hostPath—Used for mounting directories from the worker node’s filesystem into the pod.
3. gitRepo—A volume initialized by checking out the contents of a Git repository.
4. nfs—An NFS share mounted into the pod.

## emptyDir volume

`luksa/fortune` image用于生成html文件，它内部执行的shell脚本如下：

```sh
#!/bin/bash
trap "exit" SIGINT
mkdir /var/htdocs
while :
do
	echo $(date) Writing fortune to /var/htdocs/index.html
	/usr/games/fortune > /var/htdocs/index.html
	sleep 10
done
```

该shell脚本会把html内容写到`/var/htdocs/index.html`文件中。

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: fortune
spec:
  containers:
  - image: luksa/fortune
    name: html-generator
    volumeMounts:
    - name: html   # The html volume is mounted at /var/htdocs in the container.
      mountPath: /var/htdocs
  - image: nginx:alpine
    name: web-server
    volumeMounts:
    - name: html   # The html volume is mounted at /usr/share/nginx/html as read-only.
      mountPath: /usr/share/nginx/html  # this is the default directory Nginx serves files from
      readOnly: true
    ports:
    - containerPort: 80
      protocol: TCP
  volumes:
  - name: html     # A single emptyDir volume called html
    emptyDir: {}
```

The pod contains two containers and a single volume that’s mounted in both of them, yet **at different paths**.

For html-generator container，because the volume is mounted at /var/htdocs, the index.html file is written to the volume instead of the container’s top layer. 

由于同一个volume也被挂载到web-server container中，所以nginx可以读取到html-generator container 生成的文件内容。

SSH登录到容器中，html-generator在不断替换文件内容：

![image-20230806110421492](.\image\image-20230806110421492.png)

web-server container也能感知到index.html文件内容的变化：

![image-20230806110709635](.\image\image-20230806110709635.png)

#### SPECIFYING THE MEDIUM TO USE FOR THE EMPTYDIR

The emptyDir you used as the volume was created on the **actual disk of the worker node** hosting your pod, so its performance depends on the type of the node’s disks.

But you can tell Kubernetes to create the emptyDir in memory. To do this, set the emptyDir’s medium to Memory:

```yaml
 volumes:
  - name: html    
    emptyDir:
      medium: Memory # This emptyDir's files should be stored in memory.
```

## ~~gitRepo~~

A gitRepo volume is an emptyDir volume initially populated with the contents of a Git repository.

![image-20230806111520115](.\image\image-20230806111520115.png)

```
Warning: spec.volumes[0].gitRepo: deprecated in v1.11
```

gitRepo 类型的volume 已经被 deprecate 了。



## hostPath volume

A hostPath volume mounts a file or directory on the worker node into the container’s filesystem.

![image-20230806113035954](.\image\image-20230806113035954.png)

hostPath volumes are the first type of **persistent storage** we’re introducing, because the emptyDir volumes’ contents get deleted when a pod is torn down, whereas a hostPath volume’s contents don’t.

If a pod is deleted and the next pod uses a hostPath volume pointing to the same path on the host, the new pod will see whatever was left behind by the previous pod, but only if it’s scheduled to the same node as the first pod.

**It’s not a good idea to use a hostPath volume for regular pods, because it makes the pod sensitive to what node it’s scheduled to.**

# Persistent Storage

When an application running in a pod needs to persist data to disk and have that same data available even when the pod is rescheduled to another node, you can’t use any of the volume types we’ve mentioned so far. Because this data needs to be accessible from any cluster node, it must be stored on some type of network-attached storage(NAS).
To learn about volumes that allow persisting data, you’ll create a pod that will run the MongoDB document-oriented NoSQL database. 

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mongodb 
spec:
  volumes:
  - name: mongodb-data
    gcePersistentDisk:      # The type of the volume is a GCE Persistent Disk.
      pdName: mongodb       # The name of the persistent disk must match the actual PD you created earlier.
      fsType: ext4          # The filesystem type is EXT4
  containers:
  - image: mongo
    name: mongodb
    volumeMounts:
    - name: mongodb-data
      mountPath: /data/db
    ports:
    - containerPort: 27017
      protocol: TCP
```

The volume referencing an external GCE Persistent Disk:

![image-20230806121320493](.\image\image-20230806121320493.png)

1. 本质上就是在Google Cloud先申请一块GCE persistent disk。在Google Cloud可以用下面的命令创建这块disk：
   ```
   gcloud compute disks create --size=1GiB --zone=europe-west1-b mongodb
   ```

   注意这块 disk 的名字叫 mongodb，这个名字必须与 volume 定义中的 pdName 相同。

2. 然后创建volume，volume的类型是gcePersistentDisk，让这个volume指向GCE persistent disk。

这样Pod中的容器就能将数据写入到 GCE persistent disk 中，即使 Pod 被迁移到另外一个Node，由于该 Pod 仍然连接的是同一快 GCE persistent disk，所以后面的Pod仍然可以读取到先前Pod的数据。

每个 Cloud Provider 都有对应的存储。

If your Kubernetes cluster is running on Amazon’s AWS EC2, you can use an **awsElasticBlockStore** volume to provide persistent storage for your pods. 

If your cluster runs on Microsoft Azure, you can use the **azureFile** or the **azureDisk** volume.

# Decoupling pods from the underlying storage technology

All the persistent volume types we’ve explored so far have required the developer of the pod to have knowledge of the actual network storage infrastructure available in the cluster. This is against the basic idea of Kubernetes, which aims to hide the actual infrastructure from both the application and its developer, leaving them free from worrying about the specifics of the infrastructure and making apps portable across a wide array of cloud providers.

Ideally, a developer deploying their apps on Kubernetes should never have to know what kind of storage technology is used underneath. Infrastructure-
related dealings should be the sole domain of the cluster administrator.

只有运维人员才需要关心到底使用的是什么存储技术、Pod是在AWS上运行、还是在AliCloud上运行。

## PersistentVolumes and PersistentVolumeClaims

PersistentVolumes are provisioned by cluster admins and consumed by pods through PersistentVolumeClaims：

![image-20230806133845642](.\image\image-20230806133845642.png)

1. Cluster administrator sets up the underlying storage and then registers it in Kubernetes by creating a **PersistentVolume** resource through the Kubernetes API server. When creating the PersistentVolume, the admin specifies its size and the access modes it supports.
2. When a cluster user needs to use persistent storage in one of their pods, they first create a **PersistentVolumeClaim** manifest, specifying the minimum size and the access mode they require. The user then submits the PersistentVolumeClaim manifest to the Kubernetes API server, and Kubernetes finds the appropriate PersistentVolume and binds the volume to the claim.
3. The PersistentVolumeClaim can then be used as one of the volumes inside a pod.
4. **Other users cannot use the same PersistentVolume** until it has been released by deleting the bound PersistentVolumeClaim.

**运维人员负责创建PV，开发人员负责创建PVC。**

#### Assume the role of a cluster administrator and create a PersistentVolume

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: mongodb-pv
spec:
  capacity: 
    storage: 1Gi      # Defining the PersistentVolume's size
  accessModes:        
    - ReadWriteOnce   # It can either be mounted by a single client for reading and writing
    - ReadOnlyMany    # or by multiple clients for reading only.
  persistentVolumeReclaimPolicy: Retain   # After the claim is released, the PV should be retained (not erased or deleted).
  gcePersistentDisk:
    pdName: mongodb
    fsType: ext4
```

PersistentVolumes, like cluster Nodes, **don’t belong to any namespace**, unlike pods and PersistentVolumeClaims.

![image-20230806135745808](.\image\image-20230806135745808.png)

这样运维管理员就利用 PV 屏蔽了 底层真实存储技术的细节。

#### 现在扮演developer的角色，创建PersistentVolumeClaim

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mongodb-pvc 
spec:
  resources:
    requests:
      storage: 1Gi
  accessModes:
  - ReadWriteOnce   # You want the storage to support a single client
  storageClassName: ""
```

As soon as you create the claim, Kubernetes finds the appropriate PersistentVolume and binds it to the claim.

The PersistentVolume’s capacity must be large enough to accommodate what the claim requests. Additionally, the volume’s access modes must include the access modes requested by the claim

有下面三种 access mode：

1. RWO—ReadWriteOnce—Only a single node can mount the volume for reading and writing.
2. ROX—ReadOnlyMany—Multiple nodes can mount the volume for reading.
3. RWX—ReadWriteMany—Multiple nodes can mount the volume for both reading and writing.

We’ve already said that PersistentVolume resources are cluster-scoped and thus cannot be created in a specific namespace, **but PersistentVolumeClaims can only be created in a specific namespace**. They can then only be used by pods in the **same namespace**.

#### Using a PersistentVolumeClaim in a pod

The PersistentVolume is now yours to use. Nobody else can claim the same volume until you release it.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mongodb 
spec:
  containers:
  - image: mongo
    name: mongodb
    volumeMounts:
    - name: mongodb-data
      mountPath: /data/db
    ports:
    - containerPort: 27017
      protocol: TCP
  volumes:
  - name: mongodb-data
    persistentVolumeClaim:  # Referencing the PersistentVolumeClaim by name in the pod volume
      claimName: mongodb-pvc
```



#### The benefits of using PersistentVolumes and claims

Using the GCE Persistent Disk directly or through a PVC and PV:

![image-20230806141048896](.\image\image-20230806141048896.png)

The developer doesn’t have to know anything about the actual storage technology used underneath. 

The same pod and claim manifests can now be used on many different Kubernetes clusters.

可以支持跨多种不同的Cloud Provider。

#### Recycling PersistentVolumes

当删除一个PVC后，这个PVC所指向的PV的状态会变成 Released。但这个PV还不能马上分配给其它PVC使用。

Because you’ve already used the volume, it may contain data and shouldn’t be bound to a completely new claim without giving the cluster admin a chance to clean it up. Without this, a new pod using the same PersistentVolume could read the data stored there by the previous pod, even if the claim and pod were created in a different namespace.

在之前创建PV时，我们将persistentVolumeReclaimPolicy参数的值设置成了Retain。You wanted Kubernetes to retain the volume and its contents after it’s released from its claim. 

为了能够让PV能够继续被其他PVC使用，the only way to manually recycle the PersistentVolume to make it available again is to delete and recreate the PersistentVolume resource.

你也可以将persistentVolumeReclaimPolicy设置为Delete。The Delete policy deletes the underlying storage.

## Dynamic provisioning of PersistentVolumes

就简单了解下吧！

![image-20230806160740484](.\image\image-20230806160740484.png)

 