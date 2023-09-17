# Instant Vector

An instant vector selector returns an instant vector of the **most recent** samples before the query evaluation time, which is to say a list of zero or more time series. Each of these time series will have **one** sample, and a sample contains both a value and a timestamp.

# Range Vector

There is a second type of selector you have already seen, called the *range vector* selector. 

Unlike an instant vector selector which returns one sample per time series, a range vector selector can return **many** samples for each time series.

Range vectors are always used with the **rate** function; for example:

```
rate(process_cpu_seconds_total[1m])
```

The [1m] turns the instant vector selector into a range vector selector, and instructs PromQL to return for all time series matching the selector all samples for the minute up to the query evaluation time.

### PS

对于Gauge类型的Metric，之前以为Prometheus Server只保存Gauge Metric最后一次采集的值，而不保存Gauge Metric历史上采集到的所有值。**我的这个理解是错的！** Prometheus Server同样会保存Gauge Metric的所有的值。

这里的Instant Vector并不是指Gauge Metric，Counter Metric也不是Range Vector。

Instant Vector 和 Range Vector指的是Selector，是PromQL的查询方式。

只用Metric的名字作为查询条件，返回值类型就属于Instant Vector：

![image-20230916130639954](.\image\image-20230916130639954.png)

而加上[1m]会将查询结果从instant vector转换为range vector：

![image-20230916130824531](.\image\image-20230916130824531.png)

# Offset

Offset allows you to take the evaluation time for a query.

```
process_resident_memory_bytes{job="node"} offset 1h
```

would get memory usage an hour before the query evaluation time.

