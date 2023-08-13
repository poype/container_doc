This chapter covers how to **update** apps running in a Kubernetes cluster and how Kubernetes helps you move toward a true zero-downtime update process.

Deployment resource that sits on top of ReplicaSets and enables declarative application updates.

#### 只利用ReplicationController进行发布的方式：

1. Updating pods by changing a ReplicationController’s pod template and deleting old Pods：

![image-20230812163510002](.\image\image-20230812163510002.png)

2. Switching a Service from the old pods to the new ones：

![image-20230812163602000](.\image\image-20230812163602000.png)

This is called a **blue-green** deployment. Once all the new pods are up, you can **change the Service’s label selector** and have the Service switch over to the new pods. After switching over, and once you’re sure the new version functions correctly, you’re free to delete the old pods by deleting the old ReplicationController.

3. A rolling update of pods using two ReplicationControllers

![image-20230812163922343](.\image\image-20230812163922343.png)

You do this by slowly scaling down the previous ReplicationController and scaling up the new one.

# Using Deployments for updating apps declaratively

When you create a Deployment, a ReplicaSet resource is created underneath.

When using a Deployment, the actual pods are created and managed by the Deployment’s ReplicaSets, not by the Deployment directly. 

A Deployment is backed by a ReplicaSet, which supervises the deployment’s pods:

![image-20230812170833694](.\image\image-20230812170833694.png)

#### CREATING A DEPLOYMENT MANIFEST

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kubia
spec:
  replicas: 3
  template:
    metadata:
      name: kubia
      labels:
        app: kubia
    spec:
      containers:
      - image: skyliu01/kubia-v1
        name: nodejs
  selector:
    matchLabels:
      app: kubia
```

创建Deployment必须加上`--record`参数，这个参数对部署历史记录至关重要：

```shell
kubectl create -f kubia-deployment-v1.yaml --record
```

![image-20230812171900516](.\image\image-20230812171900516.png)

还自动创建了一个ReplicationSet：

![image-20230812172639802](.\image\image-20230812172639802.png)

#### Updating a Deployment

Deployment 有两种发布策略：

1. Recreate strategy, which deletes all the old pods at once and then creates new ones.  The Recreate strategy causes all old pods to be deleted before the new ones are created.
2. The RollingUpdate strategy, on the other hand, removes old pods one by one, while adding new ones at the same time, keeping the application available throughout the whole process, and ensuring there’s no drop in its capacity to handle requests.

**RollingUpdate** 是 Deployment 默认使用的 Strategy。

为了能更好的观察发布过程的细节，使用下面的命令将发布速度降下来：

```shell
kubectl patch deployment kubia -p '{"spec": {"minReadySeconds": 10}}'
```

设置Deployment的 minReadySeconds 属性为10 秒。

为了观察发布过程中对Request和Response的影响，通过下面命令持续发送Request给对应的service：

```shell
while true; do curl http://192.168.10.102:30123; done
```

**Trigger the actual rollout, change the image:**

```shell
kubectl set image deployment kubia nodejs=luksa/kubia:v2
```

在发布过程中，同时包含V1和V2两种response：

![image-20230812183825539](.\image\image-20230812183825539.png)

在发布过程中，同时存在新老两个RepliationSet，老RepliationSet的DESIRED不断减少，新RepliationSet的DESIRED不断增加：

![image-20230812183945318](.\image\image-20230812183945318.png)

老 ReplicationSet 管理的Pod数量逐步变成0，但它不会被删除：

![image-20230812184039914](.\image\image-20230812184039914.png)

A Deployment at the start and end of a rolling update:

![image-20230812191338387](.\image\image-20230812191338387.png)

#### Rolling back a deployment

In version 3, you’ll introduce a bug that makes your app handle only the first four requests properly. All requests from the fifth request onward will return an internal server error (HTTP status code 500).

部署第三个版本，第三个版本的image处理完前4个request后会开始报错：

```shell
kubectl set image deployment kubia nodejs=luksa/kubia:v3
```

Roll back to the previously deployed version by telling Kubernetes to undo the last rollout of a Deployment:

```shell
kubectl rollout undo deployment kubia
```

![image-20230812203318527](.\image\image-20230812203318527.png)

Rolling back a rollout is possible because Deployments keep a revision history. As you’ll see later, the history is stored in the underlying ReplicaSets. When a rollout completes, **the old ReplicaSet isn’t deleted**, and this enables rolling back to any revision, not only the previous one. 

The revision history can be displayed with the kubectl rollout history command:

```shell
kubectl rollout history deployment kubia
```

![image-20230812204055068](.\image\image-20230812204055068.png)

Remember the **--record** command-line option you used when creating the Deployment? Without it, the CHANGE-CAUSE column in the revision history would be empty, making it much harder to figure out what’s behind each revision.

--record 参数已经被弃用了。

![image-20230812221235396](.\image\image-20230812221235396.png)

可以在Revision History之间任意切换：

```shell
kubectl rollout undo deployment kubia --to-revision=1
```

每个revision都对应一个ReplicaSet。部署完成后，老的ReplicaSet不会被自动删除就是为了方便roll back。

![image-20230812221448563](.\image\image-20230812221448563.png)

Each ReplicaSet stores the complete information of the Deployment at that specific revision, so you shouldn’t delete it manually. If you do, you’ll lose that specific revision from the Deployment’s history, preventing you from rolling back to it.

revision的历史纪录也不是无限多的，the length of the revision history is limited by the `revisionHistoryLimit` property on the Deployment resource. 

如果历史记录中的revision超过revisionHistoryLimit指定的数量，则最老的ReplicaSet会被自动删除。

Older ReplicaSets are deleted automatically. 

#### Controlling the rate of the rollout

Two properties affect how many pods are replaced at once during a Deployment’s rolling update, **maxSurge** and **maxUnavailable**.

![image-20230813080359683](.\image\image-20230813080359683.png)

Rolling update of a Deployment with three replicas and default maxSurge and maxUnavailable:

![image-20230813081006322](.\image\image-20230813081006322.png)

Rolling update of a Deployment with the maxSurge=1 and maxUnavailable=1:

![image-20230813081146047](.\image\image-20230813081146047.png)

#### Pausing the rollout process

```shell
kubectl rollout pause deployment kubia
```

![image-20230813092651390](.\image\image-20230813092651390.png)

A single new pod should have been created, but all original pods should also still be running.

![image-20230813092739150](.\image\image-20230813092739150.png)

Once the new pod is up, a part of all requests to the service will be redirected to the new pod. This way, you’ve effectively run a canary release.

Resume the deployment to replace all the old pods with new ones:

```shell
kubectl rollout resume deployment kubia
```

![image-20230813093203875](.\image\image-20230813093203875.png)

## 一个完整的Depoloyment manifest：

```yaml
apiVersion: apps/v1beta1
kind: Deployment
metadata:
  name: kubia
spec:
  replicas: 3
  minReadySeconds: 10
  strategy:
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
    type: RollingUpdate
  template:
    metadata:
      name: kubia
      labels:
        app: kubia
    spec:
      containers:
      - image: luksa/kubia:v3
        name: nodejs
        readinessProbe:
          periodSeconds: 1
          httpGet:
            path: /
            port: 8080
```

## 总结

Deployment 控制了多个 ReplicaSet，每个ReplicaSet对应一个revision 的 image。

当部署一个新版本的image时，新ReplicaSet的Desired值会被不断加1，老ReplicaSet的Desired值会被不断减1，以此来实现新版本Pod替换老版本Pod的作用。

# Ways of modifying Deployments and other resources

Modifying an existing resource in Kubernetes：

![image-20230812184429968](.\image\image-20230812184429968.png)