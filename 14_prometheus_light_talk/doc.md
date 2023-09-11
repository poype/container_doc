counter metrics all ended with _total, while there is no such suffix on gauges. This is a convention within Prometheus that makes it easier to identify what type of metric you are working with.

It is also strongly recommended that you include the unit of your metric at the end of its name. For example, a counter for bytes processed might be *myapp_requests_processed_bytes_total*.

### Metric

##### metric family

```java
Summary summaryMetric = Summary.build()
                               .name("summary_metric")
                               .help("study prometheus summary metric")
                               .register();
```

这段代码定义了一个名字是 "summary_metric" 的 metric family。

##### time series

summary_metric_count{path="/foo"} is a time series, distinguished by a name and labels. This is what PromQL works with. 

### Instrumentation and Target Labels

Labels come from two sources, ***instrumentation labels*** and ***target labels***.

Instrumentation labels, come from your instrumentation. They are about things that are known inside your application or library.

Target labels identify a specific monitoring target; that is, a target that Prometheus scrapes. Target labels are attached by Prometheus as part of the process of scraping metrics.

### Discovery

在Pod中添加一个专门用于Discovery的sidecar，通过命令行参数给这个sidecar传入需要被Prometheus scrape的container和对应的端口，可以同时传入多个container和端口。也就是说一个Pod可以同时包含多个container向Prometheus吐数据。

sidecar会将指定好的port和path注册到consul，例如将如下信息注册到consul：

```
我的IP是 192.168.10.100
:8090/metrics
:9090/metrics
:8088/metrics
```

Prometheus通过consul就能获取到这些地址信息，之后Prometheus每隔30s就会从这些地址拉取相应的metric数据。



### Kubernetes对Prometheus的支持

![image-20230910223357336](.\image\image-20230910223357336.png)

![image-20230910223510618](.\image\image-20230910223510618.png)
