A Kubernetes Service is a resource you create to make a single, constant point of entry to a group of pods providing the same service. Each service has an IP address and port that **never change** while the service exists. Clients can open connections to that IP and port, and those connections are then routed to one of the pods backing that service. 

A service can be backed by more than one pod. Connections to the service are **load-balanced** across all the backing pods.

This way, clients of a service don’t need to know the location of individual pods providing the service, **allowing those pods to be moved around the cluster at any time**.

能支持一个 pod 在 cluster 内任意移动是 **“服务高可用”** 和 **“提高资源利用率”** 的基础。

## Creating services

Service 也是根据 label 决定为哪些 pod 提供 proxy.

Label selectors determine which pods belong to the Service.

下面为三个 pod 创建一个 service：

![image-20230804101638467](.\image\image-20230804101638467.png)

![image-20230804102042261](.\image\image-20230804102042261.png)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: kubia
spec:
  ports:
  - port: 80            # The port this service will be available on
    targetPort: 8080    # The container port the service will forward to
  selector:
    app: kubia          # All pods with the app=kubia label will be part of this service.
```

The kubia  service will accept connections on port 80 and route each connection to port 8080 of one of the pods matching the app=kubia label selector.

![image-20230804102713980](.\image\image-20230804102713980.png)

`10.98.101.116`是 cluster IP，只能在 cluster 内部访问。

尝试在 cluster 内部访问service：

```
kubectl exec kubia-bms77 -- curl -s http://10.98.101.116
```

![image-20230804103109699](.\image\image-20230804103109699.png)

![image-20230804103410163](.\image\image-20230804103410163.png)

Service并不是一个真实的proxy，它是一个虚拟的概念。所以第5步发送response并没有经过Service。

#### EXPOSING MULTIPLE PORTS IN THE SAME SERVICE

Service定义中的ports属性是要给数组，可以同时配置多个端口映射关系：

```yaml
spec:
  ports:
  - name: http         # Port 80 is mapped to the pods' port 8080.
    port: 80
    targetPort: 8080
  - name: https        # Port 443 is mapped to pods' port 8443.
    port: 443
    targetPort: 8443
  selector:
    app: kubia
```

#### DISCOVERING SERVICES THROUGH ENVIRONMENT VARIABLES

由于现存的 pod 是在创建service之前创建的，所以那些pod的环境变量中不包含kubia service的信息。

先将那些 pod 删除。再查看新创建pod中的环境变量。

![image-20230804105933351](.\image\image-20230804105933351.png)

**KUBIA_SERVICE_HOST** and the **KUBIA_SERVICE_PORT** environment variables, which hold the IP address and port of the kubia service, respectively.

#### DISCOVERING SERVICES THROUGH DNS

Kubernetes 集群内有自定义的DNS服务器，运行在集群内的pod都使用这个DNS服务器做域名解析：

![image-20230804110830008](.\image\image-20230804110830008.png)

Any DNS query performed by a process running in a pod will be handled by Kubernetes’ own DNS server, which knows all the services running in your system.

kubia service对应的域名是：

```
kubia.default.svc.cluster.local
```

1. `kubia` corresponds to the service name.
2. `default` stands for the **namespace** the service is defined in.
3. `svc.cluster.local` is a configurable cluster **domain suffix** used in all cluster local service names.

![image-20230804111641920](.\image\image-20230804111641920.png)

You can omit the **svc.cluster.local** suffix:

![image-20230804111959581](.\image\image-20230804111959581.png)

且如果你的consumer 与 service provider 是在同一个namespace下，namespace的部分也可以省略。所以这里域名中的default也可以省略:

![image-20230804112209539](.\image\image-20230804112209539.png)

#### YOU CAN’T PING A SERVICE IP

The service’s cluster IP is a virtual IP, and only has meaning when combined with the service port. 

所以你不能 ping service 的 IP。

# Endpoints

An Endpoints resource is a list of IP addresses and ports exposing a service. 

Service 是根据其背后的 Endpoints 转发request的。

注意！资源类型的名字是 Endpoints，有复数！！！

![image-20230804113532219](.\image\image-20230804113532219.png)

![image-20230804114208762](.\image\image-20230804114208762.png)

Although the pod selector is defined in the service spec, it’s not used directly when redirecting incoming connections. Instead, the selector is used to build a list of IPs and ports, which is then stored in the **Endpoints** resource.

如果你创建一个没有 pod selector 的service，kubernetes将不会为其创建 Endpoints resource.

To create a service with manually managed endpoints, you need to create both a Service and an Endpoints resource.

创建一个没有 pod selector 的service:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-service   # The name of the service must match the name of the Endpoints object
spec:                      # This service has no selector defined.
  ports:
  - port: 80
```

创建 Endpoints resource：

```yaml
apiVersion: v1
kind: Endpoints
metadata:
  name: external-service    # The name of the Endpoints object must match the name of the service.
subsets:
  - addresses:              # The IPs of the endpoints that the service will forward connections to
    - ip: 11.11.11.11
    - ip: 22.22.22.22
    ports:
    - port: 80              # The target port of the endpoints
```

![image-20230804115658976](.\image\image-20230804115658976.png)

**创建一个用于代理外部的服务的Service，就需要像这样分别创建Serivce和Endpoints两类资源。**

# Exposing services to external clients

![image-20230804120747757](.\image\image-20230804120747757.png)

You have a few ways to make a service accessible externally:

1. Setting the service type to NodePort.
2. Setting the service type to LoadBalancer.
3. Creating an Ingress resource.

#### NodePort

```yaml
apiVersion: v1
kind: Service
metadata:
  name: kubia-nodeport
spec:
  type: NodePort           # Set the service type to NodePort.
  ports:
  - port: 80               # This is the port of the service's internal cluster IP.
    targetPort: 8080       # This is the target port of the backing pods.
    nodePort: 30123        # The service will be accessible through port 30123 of each of your cluster nodes.
  selector:
    app: kubia
```

NodePort Service 相比于普通的Service，除了建立Service和Endpoints两类资源外，它还会在 K8s Cluster 中的每个 Node上都建立一个监听端口，在本例中这个监听端口就是 30213。

External client 可以将 request 发送给 Cluster 中的任意一个节点，节点会将request转发给内部的Service。

我的两个节点的IP分别是 `192.168.10.102` 和 `192.168.10.103`，所以在浏览器中发送下面两个请求都可以访问到服务：

```http
http://192.168.10.102:30123/
http://192.168.10.103:30123/
```

![image-20230804223334175](.\image\image-20230804223334175.png)

Your pods are now accessible to the whole internet through port 30123 on any of your nodes. It doesn’t matter what node a client sends the request to.

But if you only point your clients to the first node, when that node fails, your clients can’t access the service anymore. That’s why it makes sense to put a load balancer in front of the nodes to make sure you’re spreading requests across all healthy nodes and never sending them to a node that’s offline at that moment.

#### LoadBalancer

LoadBalancer service is an **extension** of a NodePort service.

LoadBlancer 就是在 NodePort 的基础上，在所有 Node 前面安装一个 ALB。这个ALB会在所有Node之间做负载均衡，这样所有的request就会分发给Cluster中的每个Node。

External Client只访问ALB的IP地址，这样当添加新的Node或某个Node下线时，对External Client没有任何影响。

Kubernetes clusters running on cloud providers usually support the automatic provision of a load balancer from the cloud infrastructure.

如果K8S Cluster是运行在云环境下，这个load balancer可以由云厂商自动提供。

如果K8S Cluster没有运行在云环境下，那就没有人自动提供这个load balancer，那么LoadBalancer  Service就会退化成NodePort Service。

```yaml
apiVersion: v1
kind: Service
metadata:
  name: kubia-loadbalancer
spec:
  type: LoadBalancer  # obtains a load balancer from the infrastructure hosting the Kubernetes cluster.
  ports:
  - port: 80
    targetPort: 8080
  selector:
    app: kubia
```

![image-20230805065838870](.\image\image-20230805065838870.png)

The LoadBalancer-type service is a NodePort service with an additional infrastructure-provided load balancer.

#### LoadBalancer 和 NodePort 两种 Service 的缺点

1. When an external client connects to a service through the node port, the randomly chosen pod may or may not be running on the same node that received the connection. **An additional network hop is required** to reach the pod.
2. The backing pod can’t see the actual client’s IP, which may be a problem for some applications that need to know the client’s IP.
3. Each LoadBalancer service requires its own load balancer with its own public IP address. 每一个Service都需要一个ALB和一个Public IP，而我们希望所有服务对外部用户使用的都是一个IP地址。

## Ingress

Multiple services can be exposed through a single Ingress, when a client sends an HTTP request to the Ingress, the host and path in the request determine which service the request is forwarded to.

![image-20230805083802846](.\image\image-20230805083802846.png)

在使用Ingress前，要确保Ingress controller已经在K8S Cluster中安装好。有多种类型的Ingress controller。

Google Kubernetes Engine uses Google Cloud Platform’s own HTTP load-balancing features to provide the Ingress functionality.

下面我们使用 ingress-nginx 作为 Ingress controller 。

ingress-nginx is an Ingress controller for Kubernetes using [NGINX](https://www.nginx.org/) as a reverse proxy and load balancer.

#### 安装ingress-nginx

参考如下地址安装ingress-nginx:

```http
https://kubernetes.github.io/ingress-nginx/deploy/
```

但安装ingress-nginx的过程有点复杂，因为国内网络的原因，导致docker image下载失败，所以还要参考下面的link修改对应的image：

```http
https://blog.csdn.net/weixin_43988498/article/details/122792536
```

ingress-nginx-controller安装成功：

![image-20230805190652059](.\image\image-20230805190652059.png)

#### Creating an Ingress resource

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress      # Ingress有属于自己的类型，而不是用Service类型
metadata:
  name: kubia
spec:
  rules:
  - host: kubia.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: kubia
            port:
              number: 80
```

![image-20230805193012446](.\image\image-20230805193012446.png)

#### Accessing pods through an Ingress

![image-20230805192749677](.\image\image-20230805192749677.png)

#### Exposing multiple services through the same Ingress

一个Ingress可以配置多个路由规则，所以一个Ingress可以同时支持作为多个Service的代理。

### 可能是Ingress Controller的搭建有问题，创建的Ingress一直无法获取到IP地址，无法继续实验，先跳过了！！！！

# readiness probes

The readiness probe is invoked periodically and determines whether the specific pod should receive client requests or not. When a container’s readiness probe returns success, it’s signaling that the container is ready to accept requests.

#### TYPES OF READINESS PROBES

Like liveness probes, three types of readiness probes exist:

1. An Exec probe, where a process is executed. The container’s status is determined by the process’ exit status code.
2. An HTTP GET probe, which sends an HTTP GET request to the container and the HTTP status code of the response determines whether the container is ready or not.
3. A TCP Socket probe, which opens a TCP connection to a specified port of the container. If the connection is established, the container is considered ready.

When a container is started, Kubernetes can be configured to **wait for a configurable amount of time** to pass before performing the first readiness check. After that, it invokes the probe periodically. If a pod reports that it’s not ready, it’s removed from the **service**. If the pod then becomes ready again, it’s re-added.

在 pod 中的服务真正准备好之前，该pod是不会被加入到service中的。

Unlike liveness probes, if a container fails the readiness check, it won’t be killed or restarted. This is an important distinction between liveness and readiness probes.

**A pod whose readiness probe fails is removed as an endpoint of a service:**

![image-20230805220614247](.\image\image-20230805220614247.png)

#### 为 Pod 添加 readiness probe

```yaml
apiVersion: v1
kind: ReplicationController
metadata:
  name: kubia
spec:
  replicas: 3
  selector:
    app: kubia
  template:
    metadata:
      labels:
        app: kubia
    spec:
      containers:
      - name: kubia
        image: skyliu01/kubia
        ports:
        - name: http
          containerPort: 8080
        readinessProbe:
          exec:
            command:  # The readiness probe will periodically perform the command ls /var/ready inside the container.
            - ls
            - /var/ready
```

The readiness probe will periodically perform the command ls /var/ready inside the container. The ls command returns exit code zero if the file exists, or a non-zero exit code otherwise. If the file exists, the readiness probe will succeed; otherwise, it will fail.

此时 service 的 Endpoints为空：

![image-20230805221753576](.\image\image-20230805221753576.png)

在一个Pod的container中创建了`/var/ready`文件后，Service中的Endpoints就有值了：

![image-20230805222427710](.\image\image-20230805222427710.png)

##### readiness probe的详细信息：

![image-20230805222835395](.\image\image-20230805222835395.png)

```
Readiness:      exec [ls /var/ready] delay=0s timeout=1s period=10s #success=1 #failure=3
```

#### ALWAYS DEFINE A READINESS PROBE

If you don’t add a readiness probe to your pods, they’ll become service endpoints almost immediately. If your application takes too long to
start listening for incoming connections, client requests hitting the service will be forwarded to the pod while it’s still starting up and not ready to accept incoming connections. Clients will therefore see “Connection refused” types of errors.
