## 运行一个image

告诉Docker运行一个image：

```shell
docker run <image>
```

**当没有指定image版本时，Docker会默认使用`latest`作为版本号。**下面的命令明确指定了版本号：

```bash
docker run <image>:<tag>
```

查看所有正在运行的container：

```
docker ps
```

或

```
docker container ls
```

![image-20230729192029183](.\image-20230729192029183.png)

## Build一个image

```
docker build -t kubia .
```

`kubia`是image的名字，`.`代表当前路径。

`-t`表示tag，即给image添加一个tag名字。一个image可以同时有多个tag名字。

该命令的含义是基于当前目录下的内容构建image，image的名字(**tag**)叫kubia。

Docker会在所指定的目录中找到`Dockerfile`文件，并根据`Dockerfile`文件中的指令构建image。

## 构建image的内部过程

![image-20230729170513588](.\image-20230729170513588.png)

1. image不是由Docker client构建的，而是由Docker daemon构建的。
2. 为了让Docker daemon构建image，需要将目录中的所有内容upload到Docker daemon。
3. 如果目录中的文件内容很多，且Docker daemon运行在远端服务器中，上传文件可能会花费较长时间。
4. Docker会先从Docker HUB中拉取base image(node:7.0)。

执行build image命令：

![image-20230729180301826](.\image-20230729180301826.png)

在创建好image后，使用如下两种命令可以查看存储在本地的image：

```
docker images
```

**或**

```
docker image ls
```

![image-20230729182148169](.\image-20230729182148169.png)

## IMAGE LAYERS

一个image由多个layer组成，不同的image之间可以share一些共同使用的layer，这使得image的传输和存储更加高效。

如果一个layer已经在下载某个image时被下载到local了，那么当下载包含那个layer的其他image时，就可以直接使用存储在local的layer，无需再次下载。

**Dockerfile中的每一条指令都对应一个layer。**

所以 `ADD app.js /app.js` 和  `ENTRYPOINT ["node", "app.js"]`两条指令会创建两个layer：

![image-20230729181909330](.\image-20230729181909330.png)

## 运行刚刚构建好的image

```
docker run --name kubia-container -p 80:8080 -d kubia
```

1. container的名字是`kubia-container`。
2. `-d`参数让启动的container与console脱离，否则console会被block导致无法向其输入任何新的命令。
3. `-p 80:8080`表示把host主机上的80端口映射到container中的8080端口。

调用container中运行的服务：

![image-20230729183209334](.\image-20230729183209334.png)

## 查看container的详细信息

```
docker inspect kubia-container
```

Docker will print out a long JSON containing low-level information about the container.

## SSH到container内部

Because multiple processes can run inside the same container, you can always run an additional process in it. 

You can even run a shell inside container:

```
docker exec -it kubia-container bash
```

![image-20230729193544301](.\image-20230729193544301.png)

This will run bash inside the existing kubia-container container. The bash process will have the same Linux namespaces as the main container process.

1. `-i`: which makes sure STDIN is kept open. You need this for entering commands into the shell.
2. `-t`: which allocates a pseudo terminal (TTY).

You need both if you want the use the shell like you’re used to.

## container中的进程也是运行在host中的进程

![image-20230730074732902](.\image-20230730074732902.png)

This proves that processes running in the container are running in the host OS. You should have noticed that the processes have different IDs inside the container vs. on the host. The container is using its own PID Linux namespace and has a completely isolated process tree, with its own sequence of numbers.

## Stopping and removing a container

```
docker stop kubia-container
```

![image-20230729225256184](.\image-20230729225256184.png)

This will stop the main process running in the container and consequently stop the container, because no other processes are running inside the container.

The container itself still exists and you can see it with **`docker ps -a`**. The **`-a`** option prints out all the containers, those running and those that have been stopped.

To truly remove a container, you need to remove it with the **`docker rm`** command:

```
docker rm kubia-container
```

![image-20230729225839400](.\image-20230729225839400.png)

This deletes the container. All its contents are removed and it can’t be started again.

# Pushing the image to an image registry

You need to re-tag your image according to Docker Hub’s rules. 

Docker Hub will allow you to push an image if the image’s repository name **starts with your Docker Hub ID**.

给一个已存在的image设置一个新的repository名字：

```shell
docker tag kubia skyliu01/kubia
```

![image-20230730073028846](.\image-20230730073028846.png)

`skyliu01/kubia`和`kubia`这两个名字指向同一个IMAGE ID，所有这一个image有两个tag。

#### PUSHING THE IMAGE TO DOCKER HUB

```
docker push skyliu01/kubia
```

![image-20230730073615433](.\image-20230730073615433.png)

#### RUNNING THE IMAGE ON A DIFFERENT MACHINE

```
docker run -p 80:8080 -d skyliu01/kubia
```

![image-20230730074411781](.\image-20230730074411781.png)

调用远端container中的服务：

![image-20230730074920607](.\image-20230730074920607.png)

`c46d9d1e09fd` 是 CONTAINER ID。

The best thing about this is that your application will have the exact same environment every time and everywhere it’s run.

If it ran fine on your machine, it should run as well on every other Linux machine.

No need to worry about whether the host machine has Node.js installed or not.



# Defining the command and arguments in Docker

1. ENTRYPOINT defines the executable invoked when the container is started.
2. CMD specifies the arguments that get passed to the ENTRYPOINT.

Although you can use the CMD instruction to specify the command you want to execute when the image is run, the correct way is to do it through the ENTRYPOINT instruction and to only specify the CMD if you want to define the **default** arguments.

CMD不是必须的，它的作用是提供**默认参数**。

如果在Run一个image的时候也提供了参数，那么在启动container时提供的参数将覆盖掉Dockerfile中CMD提供的默认参数：

```shell
docker run <image> <arguments>  # <arguments>将覆盖掉Dockerfile中CMD提供的默认参数
```

#### UNDERSTANDING THE DIFFERENCE BETWEEN THE SHELL AND EXEC FORMS

1. shell form—For example, ENTRYPOINT node app.js.
2. exec form—For example, ENTRYPOINT ["node", "app.js"].

**应该始终使用第二种方式！！！！！**This runs the node process directly (not inside a shell).

当使用 exec ENTRYPOINT 模式时，应用进程在容器中是1号进程：

![image-20230808071735019](.\image-20230808071735019.png)

下面换成shell ENTRYPOINT模式：

```shell
ENTRYPOINT node app.js
```

![image-20230808072607467](.\image-20230808072607467.png)

Shell模式相比于Exec模式多了一个 /bin/sh进程，**一定要使用Exec模式，不要使用shell模式！！！！！！**

#### 通过CMD传递参数的例子

```shell
#!/bin/bash

INTERVAL=$1 # cmd args
echo loop once every $INTERVAL seconds

while :
do
  echo loop
  sleep $INTERVAL
done
```

```dockerfile
FROM ubuntu:latest

ADD loop.sh /bin/loop.sh

ENTRYPOINT ["/bin/loop.sh"]
CMD ["10"] # default cmd args
```

```shell
docker run loop-args
```

![image-20230808080912034](.\image-20230808080912034.png)

```shell
docker run loop-args 5
```

![image-20230808081259358](.\image-20230808081259358.png)
