虽然Prometheus提供了 Gauge、Counter、Summary 和 Histogram 四种类型的metric，但本质上只有Gauge 和 Counter两种类型的metric，Summary 和 Histogram 这两种类型的metric其实都是由多个 Counter 类型的metric组合构成的。

# Gauge

在四种类型的Metric中，Gauge是最简单的类型。Counter类型的metric可以转换为Gauge类型，但Gauge类型无法再转换为其它类型的metric。直接碰到Gauge类型的metric，或者是由其它类型的metric转换到Garge，就可以考虑开始做聚合运算了。

Gauges are a snapshot of state, and usually when aggregating them you want to take a sum, average, minimum, or maximum.

```java
public void run() {
    // 注册到default registry，也可以通过参数指定注册到其它的registry
    Gauge inProgress = Gauge.build()
                            .name("gauge_metric")
                            .help("study prometheus gauge metric")
                            .labelNames("app", "path", "latency")
                            .register();

    int metricValue1 = 0;
    int metricValue2 = 0;
    while(true) {
        try {
            // 延迟3秒
            TimeUnit.MILLISECONDS.sleep(3000);
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }

        // 生成随机数，给不同标签的metric增加或减少相应的值
        int number = TestUtil.randomNumber() % 100;
        if (number % 5 == 0) {
            metricValue1 -= number;
            inProgress.labels("order", "/get", "88").dec(number);   // 减少
        } else if (number % 5 == 1) {
            metricValue1 += number;
            inProgress.labels("order", "/get", "88").inc(number);   // 增加
        } else if (number % 5 == 2) {
            metricValue2 -= number;
            inProgress.labels("pay", "/get", "99").dec(number);     // 减少
        } else if (number % 5 == 3) {
            metricValue2 += number;
            inProgress.labels("pay", "/get", "99").inc(number);     // 增加
        } else {
            metricValue2 += number;
            inProgress.labels("pay", "/get", "99").inc(number);     // 增加
        }
        System.out.println("Gauge metric1 value is " + metricValue1);
        System.out.println("Gauge metric2 value is " + metricValue2);
    }
}
```

上面的代码对Gauge的值加加减减，使Gauge的value时而增加，时而减少。Prometheus每次采集到的就是Gauge在那个时刻的值。

采集到的值：

```
gauge_metric{app="order",path="/get",latency="88",} 38.0
gauge_metric{app="pay",path="/get",latency="99",} 49.0
```

### 直接输入metric

直接输入metric的名字，显示的就是metric当前的value：

![image-20230912075219805](.\image\image-20230912075219805.png)

### 通过label过滤 TS

![image-20230912075427961](.\image\image-20230912075427961.png)

### sum函数

sum函数是把多个time series当前的值相加在一起。**注意它不是把一个time series历史上的所有值相加在一起**。

对于 sum(gauge_metric{app="pay"})，由于gauge_metric{app="pay"}只对应一个time series，所以sum的值与TS原始的值相同。

![image-20230912080430242](.\image\image-20230912080430242.png)

![image-20230912080518076](.\image\image-20230912080518076.png)

由于label过滤后只剩下一个time series，所以sum后的值与time series的值相同。

去掉过滤的label条件，则会对应两个time series，此时sum函数会返回那两个time series当前值的和。

![image-20230912080918578](.\image\image-20230912080918578.png)

![image-20230912081039145](.\image\image-20230912081039145.png)

**同理，其它聚合函数应用到Gauge类型上都只是利用time series当前的值做各种计算，与time series历史上的值没有关系。**

### max函数

取多个time series中的最大值

![image-20230912085438687](.\image\image-20230912085438687.png)

![image-20230912085525631](.\image\image-20230912085525631.png)

### min函数

取多个time series中的最小值

![image-20230912085717839](.\image\image-20230912085717839.png)

![image-20230912085626645](.\image\image-20230912085626645.png)

### avg函数

![image-20230912090102099](.\image\image-20230912090102099.png)

(329 + 15042) / 2 = 7685.5

![image-20230912090200526](.\image\image-20230912090200526.png)

### without

![image-20230912092851886](.\image\image-20230912092851886.png)

![image-20230912092924869](.\image\image-20230912092924869.png)

without的作用是将参数列表中的label排除，在剩余的label中，相同的会被分成一组，然后再做聚合运算。

下面是metric的原始数据：

```
gauge_metric{app="mall", instance="192.168.1.6:8090", job="java", latency="88", path="/get"}    9854
gauge_metric{app="order", instance="192.168.1.6:8090", job="java", latency="88", path="/get"}   10770
gauge_metric{app="pay", instance="192.168.1.6:8090", job="java", latency="99", path="/get"}     11064
gauge_metric{app="pay", instance="192.168.1.6:8090", job="java", latency="99", path="/post"}    12553
gauge_metric{app="vendor", instance="192.168.1.6:8090", job="java", latency="87", path="/get"}  10638
```

使用without排除app 和 latency两个label：

```
sum without(app,latency)(gauge_metric)
```

还剩下三个label，会将剩余三个label完全一样的time series分到一组，然后再执行sum聚合运算。

由于intance 和 job两个标签的值都只有一个，所以相当于所有path="/get"被分到一组，所有path="/post"的被分到一组。

分组后执行sum聚合运算的结果：

```

{instance="192.168.1.6:8090", job="java", path="/get"}    42326
{instance="192.168.1.6:8090", job="java", path="/post"}   12553

```

42326 = 9854 + 10770 + 11064 + 10638

# Counter

Counters track the total number of some event since application started.  But the total is of little use to you on its own, **what you really want to know is how quickly the counter is increasing over time**.

```java
public void run() {
    // 定义一个counter类型的metric
    Counter requestCounter = Counter.build()
                                    .name("counter_metric")
                                    .labelNames("path", "method", "code")
                                    .help("study prometheus counter metric")
                                    .register();

    long total = 0;

    while(true) {
        try {
            // 延迟3秒
            TimeUnit.MILLISECONDS.sleep(3000);
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }

        // 加1
        requestCounter.labels("/aaa", "GET", "200").inc();
        // 打印counter的值
        System.out.println(++total);
    }
}
```

虽然代码中指定metric的名字是counter_metric，但metric的真实名字是counter_metric_total，会自动加一个total后缀。

对于Counter类型的metric，application会吐出下面格式的value：

```java
// counter类型暴露的值
counter_metric_total{path="/aaa",method="GET",code="200",} 480.0

// gauge类型暴露的值
gauge_metric{app="pay",path="/get",latency="99",} 49.0
```

看上去Counter类型吐出的值的形式与Gauge类型相同，但Counter与Gauge类型最大的区别是，Prometheus Server不仅会存储Counter类型metric当前采集到的值，而且还会存储这个metric在历史上采集到的所有的值。

![image-20230913070722353](.\image\image-20230913070722353.png)

Counter就像是一条递增的曲线，Prometheus会周期性的在一些时间点上采集曲线上的值。但由于Prometheus是每隔一段时间采集一次metric的值，无法采集到这条曲线上的所有值，所以**Prometheus并不能100%完全准确的绘制出counter metric的曲线**。

例如，Prometheus每个10秒拉取一次数据，application每隔3秒就会给counter metric加1，所以上图中的曲线并不是纯直线，是一个梯度一个梯度递增的。每一个梯度横跨10秒，两个相邻的梯度之间相差3或4个高度。

### rate函数

rate函数的功能是按照设置的一个时间段，取 counter 这个时间段中的平均每秒的增量。

下面代码生成counter metric的值：

```java
long total = 0;
while(true) {
    try {
        // 每隔1秒执行一次加counter的操作
        TimeUnit.MILLISECONDS.sleep(1000);
    } catch (InterruptedException e) {
        throw new RuntimeException(e);
    }

    if (total < 300) {
        // 第一个5分钟每次加1
        requestCounter.labels("/aaa", "GET", "200").inc();
    } else if (total < 600) {
        // 第二个5分钟每次加2
        requestCounter.labels("/aaa", "GET", "200").inc(2);
    } else if (total < 900) {
        // 第三个5分钟每次加4
        requestCounter.labels("/aaa", "GET", "200").inc(4);
    } else if (total < 1200) {
        // 第四个5分钟每次加8
        requestCounter.labels("/aaa", "GET", "200").inc(8);
    } else {
        // 第五个5分钟每次加16
        requestCounter.labels("/aaa", "GET", "200").inc(16);
    }
}
```

rate(1m) 这样的取值方法 比起 rate(5m)，因为它取的时间短，所以任何某一瞬间的突起或者降低会在成图得时候体现的更加细致、敏感。
而 rate(5m) 会把整个5分钟内的都一起平均了，当发生瞬间凸起得时候，会显得图平缓了一些 ( 因为取得时间段长 把波峰波谷 都给平均削平了)

时间窗口越短，在某一瞬间的突起或者降低就会在成图的时候体现的更加细致、敏感。

而**时间窗口越大，当发生瞬间突起的时候，会显得图平缓了一些**(因为取得时间段长 把波峰波谷都给**平均**削平了)。

**时间窗口取20秒，绘制的曲线比较真实。**

```
rate(counter_metric3_total[20s])
```

![image-20230914090613655](.\image\image-20230914090613655.png)

**时间窗口取1分钟，在增速变化临界处的曲线已经开始变得平缓。**

```
rate(counter_metric3_total[1m])
```

![image-20230914090400704](.\image\image-20230914090400704.png)

**时间窗口取5分钟，梯度信息几乎已全部丢失，前25分钟变成了一条平滑的曲线。**

```
rate(counter_metric3_total[5m])
```

![image-20230914091100270](.\image\image-20230914091100270.png)

rate函数画的曲线只能反应一下大概的增长速率，对于那种突增的情况，是无法精确体现在曲线中的。

下面的文章是对rate函数执行过程的介绍：
```http
https://mopitz.medium.com/understanding-prometheus-rate-function-15e93e44ae61
```

下面以`rate(counter_metric3_total[1m])`为例，介绍rate函数的执行过程：

1. [1m]表示将1分钟作为一个时间窗口对采集到的数据进行分组。假设Prometheus配置的scrape周期是15秒，那一分钟的时间窗口内将会有3或4个采集点。
2. 计算每个组内数据增长的平均值。(0, 1] 内的速率平均值做为第一秒的值，(1, 2]内的速度平均值作为第二秒的值，这样就得到一系列的点。
3. 将上述得到的点用线连接起来，就得到了增长曲线图。这就解释了为什么在增速变化的交界处，曲线是斜着上去的。

**The output of rate is a gauge, so the same aggregations apply as for gauges.**

# Summary

The power of a summary is that it allows you to calculate the average size of an event. For example, the average amount of bytes that are being returned in each response. If you had three responses of size 1, 4, and 7, then the average would be their sum divided by their count, which is to say 12 divided by 3.

# Histogram

Histogram metrics allow you to track the **distribution** of the size of events, allowing you to calculate **quantiles** from them.

```java
public void run() {
    Histogram histogram = Histogram.build()
                                   .name("histogram_metric")
                                   .help("study prometheus histogram metric")
                                   .buckets(1, 2, 5, 10, 30, 50, 100, 300, 500, 1000)  // 每个bucket都会对应一个label
                                   .register();

    int count = 0;
    int sum = 0;

    while(true) {
        try {
            TimeUnit.MILLISECONDS.sleep(3000);
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }

        int number = TestUtil.randomNumber() % 1000;
        count++;
        sum = sum + number;

        histogram.observe(number);
    }
}
```

上述代码将会创建下列time series，全都是counter类型：

```java
histogram_metric_bucket{le="1.0",} 0.0
histogram_metric_bucket{le="2.0",} 0.0
histogram_metric_bucket{le="5.0",} 0.0
histogram_metric_bucket{le="10.0",} 0.0
histogram_metric_bucket{le="30.0",} 0.0
histogram_metric_bucket{le="50.0",} 1.0
histogram_metric_bucket{le="100.0",} 3.0
histogram_metric_bucket{le="300.0",} 5.0
histogram_metric_bucket{le="500.0",} 10.0
histogram_metric_bucket{le="1000.0",} 18.0
histogram_metric_bucket{le="+Inf",} 18.0
histogram_metric_count 18.0
histogram_metric_sum 8770.0
```

histogram_metric_bucket中的标签le表示小于等于的意思。`le：less than or equal to`。

比如给定一个值501，由于501 大于 500，  所以histogram_metric_bucket{le="500.0",}不会被加1。

计算P90，即表示90%的value都小于等于某个值。例如，90%的request latency都不高于某个值：

```java
histogram_quantile(0.90, rate(histogram_metric_bucket[1m]))
```

![image-20230916112441734](.\image\image-20230916112441734.png)

下面是P10：

![image-20230916112550418](.\image\image-20230916112550418.png)

Using histogram_quantile should be the **last** step in a query expression. 

Quantiles cannot be aggregated, or have arithmetic performed upon them. Accordingly, when you want to take a histogram of an aggregate, first aggregate up with sum and then use histogram_quantile:

```java
histogram_quantile(
	0.90,
	sum without(instance)(rate(prometheus_tsdb_compaction_duration_bucket[1d])))
```

先执行聚合，再计算分位数。

Histogram metrics also include _sum and _count metrics, which **work exactly the same as for the summary metric**.













