Aggregation operators work only on **instant vectors**, and they also output instant vectors.

使用下面的样例数据做Aggregation的使用说明：

```java
node_filesystem_size_bytes{device="/dev/sda1",fstype="vfat",
instance="localhost:9100",job="node",mountpoint="/boot/efi"} 100663296
node_filesystem_size_bytes{device="/dev/sda5",fstype="ext4",
instance="localhost:9100",job="node",mountpoint="/"} 90131324928
node_filesystem_size_bytes{device="tmpfs",fstype="tmpfs",
instance="localhost:9100",job="node",mountpoint="/run"} 826961920
node_filesystem_size_bytes{device="tmpfs",fstype="tmpfs",
instance="localhost:9100",job="node",mountpoint="/run/lock"} 5242880
node_filesystem_size_bytes{device="tmpfs",fstype="tmpfs",
instance="localhost:9100",job="node",mountpoint="/run/user/1000"} 826961920
node_filesystem_size_bytes{device="tmpfs",fstype="tmpfs",
instance="localhost:9100",job="node",mountpoint="/run/user/119"} 826961920
```

# Grouping

### without

Use the without clause when aggregating to **specify the specific labels you want to remove**.

```java
sum without(fstype, mountpoint)(node_filesystem_size_bytes)
```

will group the time series, ignoring the fstype and mountpoint labels, into three groups:

```shell
# Group-1 {device="/dev/sda1",instance="localhost:9100",job="node"}
node_filesystem_size_bytes{device="/dev/sda1",fstype="vfat",
instance="localhost:9100",job="node",mountpoint="/boot/efi"} 100663296

# Group-2 {device="/dev/sda5",instance="localhost:9100",job="node"}
node_filesystem_size_bytes{device="/dev/sda5",fstype="ext4",
instance="localhost:9100",job="node",mountpoint="/"} 90131324928

# Group-3 {device="tmpfs",instance="localhost:9100",job="node"}
node_filesystem_size_bytes{device="tmpfs",fstype="tmpfs",
instance="localhost:9100",job="node",mountpoint="/run"} 826961920
node_filesystem_size_bytes{device="tmpfs",fstype="tmpfs",
instance="localhost:9100",job="node",mountpoint="/run/lock"} 5242880
node_filesystem_size_bytes{device="tmpfs",fstype="tmpfs",
instance="localhost:9100",job="node",mountpoint="/run/user/1000"} 826961920
node_filesystem_size_bytes{device="tmpfs",fstype="tmpfs",
instance="localhost:9100",job="node",mountpoint="/run/user/119"} 826961920
```

### by

Where without specifies the labels to remove, by specifies the labels to keep.

You cannot use both by and without in the same aggregation.

```java
sum by(job, instance, device)(node_filesystem_size_bytes)
```

与

```java
sum without(fstype, mountpoint)(node_filesystem_size_bytes)
```

产生的结果相同。

# Operators

sum

count

avg

min and max

stddev and stdvar

topk and bottomk

quantile

count_values

