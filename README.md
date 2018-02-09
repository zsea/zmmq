# ZMMQ

使用mongoose实现的消息队列。

## 特性

* 优先级
* 延时队列
* 父子队列

## 安装

```shell
npm install zmmq
```

## 介绍

zmmq使用mongodb进行消息存储，各客户端使用轮询的方式进行队列中消息的读取。

## node环境

需要开启**async/await**。

## 开始使用

```javascript
var zmmq=require('zmmq');
var queue=new zmmq(url, name);
```
* ```url```: mongodb的连接字符串，示例值：```mongodb://localhost/mq```。
* ```name```: 队列名称，示例值：```test```。

### 发布一个消息

```javascript
var msg_id=await queue.push(msg,options,queue)
```

push方法返回一个消息id

#### 参数描述

* ```msg```:发布到队列中的消息，支持javascript对象，消息会转换为JSON字符串存储到mongodb。
* ```options```:发布选项，详细描述见后表。默认值：```null```。
* ```queue```:发布到的队列，默认发布到当前队列。

#### 返回值

发布成功返回```true```，发布失败抛出错误。

### 读取一个消息

```javascript
var msg=await queue.pull(ms);
```

#### 参数描述

* ```ms```:当指定该值后，若没有读取到消息，将等待ms毫秒后重新尝试读取一个消息，直到读取到一个消息。若不指定该值，没有读取到消息将返回```undefined```

#### 返回值

若有返回值，将返回一个消息对象。

```javascript
{
    id: ObjectId,
    body: Object,
    done: function,
    groupid:String
}
```

* ```id```:消息id
* ```body```:消息内容
* ```done```:消息确认函数
* ```groupid```:消息分组，可能为空。

### 确认一个消息

确认一个消息有两种方式：

1. 通过消息的```done```方法确认。

```javascript
await msg.done();
```

2. 通过**zmmq**实例的```done```方法

```javascript
await queue.done(id);
```

* ```id```:需要确认的消息id


## 事务

当有一批消息需要发布时，可以使用事务保证所有消息都发布成功或失败。

### 创建一个事务

```javascript
var trans=await queue.Begin();
```

### 发布消息

```javascript
var msg_id1=await trans.push(msg,options,queue);
var msg_id2=await trans.push(msg,options,queue);
//...
var msg_idn=await trans.push(msg,options,queue);
await trans.Commit();
```

#### 参数

与```zmmq```实例参数一致。

### 确认消息

当需要发布消息与确认消息同时成功时，使用事务进行管理。

```javascript
await trans.push(msg,options,queue);
await trans.done(id, queue)
await trans.Commit();
```

#### 参数

* ```id```:确认消费的消息id。
* ```queue```:消息所在队列，默认取```zmmq```实例所在队列。

### 回滚

```javascript
await trans.Rollback();
```

## setTag

用于设置当前```zmmq```实例的tag属性，设置了tag属性的实例在```pull```时，优先处理tag相同的消息。

```javascript
queue.setTag("xyz");

```

# 消息和事务超时

## 消息处理超时

当消息处理超时时，需要重新设置消息状态，便于下一次处理。

```javascript
await zmmq.Restore(options)
```

### 参数

 * {string} options.connstring - 连接字符串
 * {Number} [options.timeout] - 消息处理超时时间，单位分钟，默认10分钟
 * {string[]} options.queues - 需要处理超时的队列，必填
 * {Number} [options.interval] - 每轮的间隔时间，单位毫秒，默认60000

## 事务超时

以超时的方式监控异常的事务，并调对数据进行恢复。

```javascript
var trans=require('zmmq/lib/transaction');
await trans.Restore(options);
```

### 参数

 * {string} options.connstring - 连接字符串
 * {Number} [options.timeout] - 事务超时时间，单位分钟，默认10分钟
 * {string} [options.trans] - 存储事务的集合名称，默认_trans
 * {Number} [options.interval] - 每轮的间隔时间，单位毫秒，默认60000

# 父子队列

父子队列仅在事务中实现。

## 什么是父子队列

具有父子关系的队列，只有当子队列中的所有任务都完成后，父队列中相关的消息才会出列被执行。

通常情况下，一个父队列具有多个子队列。

## 发布消息

由于需要同时发布多个消息到队列，需要使用事务的特性。

在发布是，通过```options```参数指定消息的父队列关系

```javascript
//发布消息到父队列
let fid=trans.push(msg,options,"father");
//布消息到子队列，并关联父队列中的消息
await trans.push(msg,{fahter:"father:"+fid},queue);
await trans.push(msg,{fahter:"father:"+fid},queue);
await trans.push(msg,{fahter:"father:"+fid},queue);
await trans.Commit();
```

## 确认消息

和普通消息确认相同。

# options

该参数在发布消息时进行设置，指定消息的属性，可指定的属性如下：

* ```level```:消息优先级，值越大优先级越高。
* ```groupid```:消息分组id，可不指定。
* ```start```:消息什么时候才允许处理，值为unix时间戳,当当前时间大于该值时，消息才会出队。
* ```tag```:消息tag，当zmmq实例指定tag属性时，优先处理tag匹配的消息。

以下属性仅对父子队列有效，建议在事务中使用：

* ```father```:父队列信息，格式为：```{queue}:{id}```,```queue```为父队列名称,```id```为父队列中消息对应的消息id。