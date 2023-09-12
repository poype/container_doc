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

