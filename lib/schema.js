var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var qSchema = new Schema({
    hostname: String //push消息的机器的主机名
    , body: String    //消息内容
    , state: String   //消息状态：waiting,execing,failed,success,timeout
    , execute_timeout_time: Number //消息执行超时时间
    , execute_hostname: String       //正在执行的主机名
    , push_time: Number//入队时间
    , pull_time: Number//出队时间
    , failCount: Number//失败次数
    , groupid: String //消息分组
    , tag: String     //队列标记
    //, next: String     //当所有子任务都成功时，当前任务需要进入的下一个队列
    //, locked: Boolean  //队列被锁定时，不允许读取和修改
    //, lock_time: Number//锁定队列的时间
    //, lock_release_time: Number //自动释放锁的时间
    , level: Number       //队列优先级
    , trans_id: String     //事务锁id
    , executeor: String    //消息处理者
    , success_time: Number //消息处理成功的时间
});
qSchema.index({ state: 1 }, { push_time: 1 }, {
    execute_timeout_time: 1
}, {
        parent: 1
    }, {
        locked: 1
    }, { lock_release_time: 1 });

module.exports = qSchema;