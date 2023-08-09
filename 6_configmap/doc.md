## Overriding the command and arguments in Kubernetes

Specifying the executable and its arguments in Docker vs Kubernetes:

![image-20230808082428701](.\image\image-20230808082428701.png)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: loop
spec:
  containers:
  - image: skyliu01/loop-args
    args: ["5"]               # override default args with 5
    name: loop-args
```

![image-20230808084414563](.\image\image-20230808084414563.png)

Command也可以被override，但一般应该不会这么做。

## Setting environment variables for a container

Kubernetes allows you to specify a custom list of environment variables for each container of a pod.

环境变量是以container为单位设置的，不能给整个pod设置环境变量。下图展示了在一个pod中有两个不同的container，这两个container拥有不同的环境变量。

![image-20230808215953306](.\image\image-20230808215953306.png)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: loop-env
spec:
  containers:
  - image: skyliu01/loop-env
    name: loop
    env:                  # set environment variable
    - name: INTERVAL
      value: "30"
```

![image-20230808223702892](.\image\image-20230808223702892.png)

![image-20230808223758525](.\image\image-20230808223758525.png)

#### drawback of hardcoding environment variables

Having values effectively hardcoded in the pod definition means you need to have separate pod definitions for your production and your development pods.

# Decoupling configuration with a ConfigMap

If you think of a pod descriptor as source code for your app, it’s clear you should move the configuration out of the pod description.

Kubernetes allows separating configuration options into a separate object called a ConfigMap, which is a map containing key/value pairs with the values ranging from short literals to full config files.

The contents of the map are passed to containers as either **environment variables** or as **files**.

Pods use ConfigMaps through environment variables and configMap volumes:

![image-20230809072309682](.\image\image-20230809072309682.png)

Keep multiple manifests for ConfigMaps with the **same name**, each for a different environment (development, testing, production). Because **pods reference the ConfigMap by name**, you can use a different config in each environment while using the same pod specification across all of them.

Two different ConfigMaps with the **same name** used in different environments:

![image-20230809072526551](.\image\image-20230809072526551.png)

这样Pod就可以在不同的环境中引用不同的ConfigMap，而无需对Pod的manifest做任何改动。

#### Creating a ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: loop-config
data:
  sleep-interval: "25"
```

也可以通过如下命令创建ConfigMap：

```shell
kubectl create configmap fortune-config --from-literal=sleep-interval=25
```

上面这两种方式创建了一个Map，其中 `sleep-interval` 是 key，value 是 25。

To create a ConfigMap with multiple literal entries, you add multiple --from-literal arguments:

```shell
kubectl create configmap myconfigmap
--from-literal=foo=bar 
--from-literal=bar=baz 
--from-literal=one=two
```

##### CREATING A CONFIGMAP ENTRY FROM THE CONTENTS OF A FILE

```shell
kubectl create configmap my-config --from-file=config-file.conf
```

When you run the previous command, kubectl looks for the file config-file.conf in the directory you run kubectl in. It will then store the contents of the file under the key config-file.conf in the ConfigMap (the filename is used as the map key), but you can also specify a key manually like this:

```shell
kubectl create configmap my-config --from-file=customkey=config-file.conf
```

也可以把整个目录下的全部文件都放到ConfigMap中。create an individual map entry for each file in the specified directory:

```shell
kubectl create configmap my-config --from-file=/path/to/dir
```

##### Creating a ConfigMap from individual files, a directory, and a literal value

```shell
kubectl create configmap my-config
--from-file=foo.json                 # A single file
--from-file=bar=foobar.conf          # A file stored under a custom key
--from-file=config-opts/             # A whole directory
--from-literal=some=thing            # A literal value
```

![image-20230809080313084](.\image\image-20230809080313084.png)

#### Passing a ConfigMap entry to a container as an environment variable

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: loop-config-map
spec:
  containers:
  - image: skyliu01/loop-env
    name: loop
    env:                  
    - name: INTERVAL            # Setting the environment variable called INTERVAL
      valueFrom:
        configMapKeyRef:        # Instead of setting a fixed value, you're initializing it from a ConfigMap key
          name: loop-config     # The name of the ConfigMap
          key: sleep-interval   # You're setting the variable to whatever is stored under this key.
```

![image-20230809083711733](.\image\image-20230809083711733.png)

![image-20230809083746552](.\image\image-20230809083746552.png)

#### Passing a ConfigMap entry as a command-line argument

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: loop-args-config-map
spec:
  containers:
  - image: skyliu01/loop-args
    name: loop-args
    env:
    - name: INTERVAL
      valueFrom:
        configMapKeyRef:
          name: loop-config
          key: sleep-interval
    args: ["$(INTERVAL)"]      # Referencing the environment variable in the argument
```

![image-20230809084427983](.\image\image-20230809084427983.png)

这种通过环境变量给命令行传递参数的方式有时还是会被使用到的。



#### Using a configMap volume to expose ConfigMap entries as files

先创建一个configMap，它的value是文件的内容：

```shell
kubectl create configmap file-config --from-file=loop-pod-config-map-volume.yaml
```

创建Pod：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: loop-args-config-map
spec:
  containers:
  - image: skyliu01/loop-args
    name: loop-args
    env:
    - name: INTERVAL
      valueFrom:
        configMapKeyRef:
          name: loop-config
          key: sleep-interval
    args: ["$(INTERVAL)"] 
    volumeMounts:
    - name: config
      mountPath: /root      # You're mounting the configMap volume at this location.
  volumes:
  - name: config
    configMap:              
      name: file-config     # The volume refers to your file-config ConfigMap.
```

configMap中的文件内容以volume的形式挂载到了/root目录下：

![image-20230809222450987](.\image\image-20230809222450987.png)
