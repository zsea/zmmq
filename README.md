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
var queue=new mmq(url, name);
```
* ```url```: mongodb的连接字符串，示例值：```mongodb://localhost/mq```。
* ```name```: 队列名称，示例值：```test```。

### 发布一个消息

```javascript
await queue.push(msg,options,queue)
```

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

### options

该参数在发布消息时进行设置，指定消息的属性，可指定的属性如下：

* ```level```:消息优先级，值越大优先级越高。
* ```groupid```:消息分组id，可不指定。
* ```start```:消息什么时候才允许处理，值为unix时间戳,当当前时间大于该值时，消息才会出队。
* ```tag```:消息tag，当zmmq实例指定tag属性时，优先处理tag匹配的消息。

## 事务

当有一批消息需要发布时，可以使用事务保证所有消息都发布成功或失败。

### 创建一个事务

```javascript
var trans=await queue.Begin();
```

### 发布消息

```javascript
await trans.push(msg,options,queue);
await trans.push(msg,options,queue);
//...
await trans.push(msg,options,queue);
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