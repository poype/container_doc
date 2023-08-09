Secrets can be used the same way as a ConfigMap. You can

1. Pass Secret entries to the container as environment variables
2. Expose Secret entries as files in a volume

Secrets are **always stored in memory** and never written to physical storage.

From Kubernetes version 1.7, etcd stores Secrets in encrypted form, making the system much more secure.

## Creating a Secret

```yaml
kubectl create secret generic test.secret --from-file=test_key --from-literal=SECRET_1=123 --from-literal=SECRET_2=456
```

![image-20230810065424035](D:\Workspace\container_doc\7_secret\image\image-20230810065424035.png)

## Using the Secret in a pod

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: loop-pod-secret
spec:
  containers:
  - image: skyliu01/loop-args
    name: loop-args
    env:
    - name: SECRET_1
      valueFrom:
        secretKeyRef:             # The variable should be set from the entry of a Secret.
          name: test.secret
          key: SECRET_1
    - name: SECRET_2
      valueFrom:
        secretKeyRef:         
          name: test.secret
          key: SECRET_2
    volumeMounts:
    - name: certs
      mountPath: /root     
  volumes:
  - name: certs
    secret:              
      secretName: test.secret     # You define the secret volume here, referring to the test.secret Secret.
```

在container中，secret的值还是能够轻松查出来，与configMap并无明显区别。

但此处的test_key文件不会真正存储在磁盘。

![image-20230810071145397](.\image\image-20230810071145397.png)
