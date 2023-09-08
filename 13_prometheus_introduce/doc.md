# 理解instrument这个词

instrument panel 就像下图这样：

![image-20230907075728861](.\image\image-20230907075728861.png)

可以将instrument理解为检测。

# Prometheus Architecture

![image-20230907073815244](.\image\image-20230907073815244.png)

### Client Libraries

对于自己的project，我们可以在project中直接引入Prometheus Client Library。我们可以为project自定义各类metric，并生成对应的Event给Prometheus Server。

Client libraries are available for all the major languages and runtimes. The Prometheus project provides official client libraries in Go, Python, Java/JVM, and Ruby.

With usually only two or three lines of code, you can both define a metric and add your desired instrumentation inline in code you control. This is referred to as direct instrumentation.

As metrics-based monitoring does not track individual events, client library memory usage does not increase the more events you have. Rather, memory is related to the number of metrics you have.

Event数量的增多并不会导致内存消耗增加，但如果metric定义的太多，将会占用更多的内存。

### Exporters

An exporter is a piece of software that you deploy right beside the application you want to obtain metrics from.

一个exporter要做的事情：

1. Gathering the required data from the application.
2. Transforming data into the correct format.
3. Taking in requests from Prometheus, returns metric data in a response to Prometheus.

### Service Discovery

Prometheus Server需要知道被监控的Application都在哪，也就是说要想办法让Prometheus知道需要监控谁。

Once you have all your applications instrumented and your exporters running, Prometheus needs to know **where they are**.

With dynamic environments you cannot simply provide a list of applications and exporters, as it will get out of date. This is where service discovery comes in.

Prometheus has integrations with many common service discovery mechanisms, such as Kubernetes, EC2, and Consul.

Prometheus allows you to configure how metadata from service discovery is mapped to monitoring targets and their labels using **relabelling**.

### Scraping

Service discovery and relabelling give us a list of targets to be monitored. Now Prometheus needs to fetch the metrics. Prometheus does this by sending a HTTP request called a scrape. The response to the scrape is parsed and saved into storage.

Scrapes happen regularly; usually you would configure it to happen every 10 to 60 seconds for each target.

### Storage

Prometheus stores data only on the local machine. 

Prometheus does not offer a clustered storage solution to store data across multiple machines.

The storage system can handle ingesting millions of samples per second, making it possible to monitor **thousands** of machines with a **single Prometheus server**.

The **compression** algorithm used can achieve **1.3 bytes** per sample on real-world data.

An SSD is recommended, but not strictly required.

### Recording Rules and Alerts

周期性的根据recording rules对数据执行预计算，这样在用户执行PromQL查询时速度就可以很快了。

Recording rules allow PromQL expressions to be evaluated on a regular basis and their results ingested into the storage engine.

Alerting rules are another form of recording rules. They also evaluate PromQL expressions regularly, and any results from those expressions become alerts. Alerts are sent to the Alertmanager.

### What Prometheus Is Not

Prometheus is designed for operational monitoring, where small inaccuracies due to factors like failed scrapes are a fact of life.

Prometheus只提供99.9%正确的数据。因此，在涉及金钱或账单的应用程序中，应该谨慎使用Prometheus。

### 容器化对监控的意义

容器使用namespace做隔离，使用cgroup做资源管控，用这种轻量级的方法模拟一个主机实例。

有了cgroup技术，所有应用的资源管控都是通过cgroup去管理的，那么监控本质上就可以标准化了。

因为cgroup里面除了你的控制参数(比如说一个应用能用多少CPU，能用多少内存)，它还有真实的资源用量(cgroup知道你用了多少CPU和多少内存)。所以我们可以通过读取cgroup的这些文件，就能知道这些应用它用了多少资源。

所以Kubernetes是怎么做的？Kubernetes利用一个叫CAdvisor的组件(新版本kubernetes开始自己实现这个组件了)，Kubernetes通过CAdvisor读取这些cgroup文件，然后去把这些真实的资源用量汇总起来，最后上报到监控系统。

所以在容器化时代，kubernetes自动就帮我们拉取了很多监控数据，不需要依赖额外的agent从application中获取监控数据了。当然这是通用能力，如果你有一些特定的一些监控的metric要上报的话，你还是需要额外去获取那些metric数据。