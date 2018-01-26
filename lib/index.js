var mongoose = require('mongoose');
var os = require('os');

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
    , parent_id: ObjectId //父队列id
    , parent_name: String  //父队列名称
    , next: String     //当所有子任务都成功时，当前任务需要进入的下一个队列
    , locked: Boolean  //队列被锁定时，不允许读取和修改
    , lock_time: Number//锁定队列的时间
    , lock_release_time: Number //自动释放锁的时间
    , level: Number       //队列优先级
});
qSchema.index({ state: 1 }, { push_time: 1 }, {
    execute_timeout_time: 1
}, {
        parent: 1
    }, {
        locked: 1
    }, { lock_release_time: 1 });
function push(msg) {

}
function pull() {

}
/**
 * 
 * @param {string} connectionstring - 到mongodb的连接字符串
 * @param {string} name - 队列名称
 * @param {string} parent -父队列名称
 */
function Queue(connectionstring, name, parent) {
    var conn = mongoose.connect(connectionstring, { autoIndex: false });
    var model = mongoose.model(name, qSchema)
    this.__defineGetter__("push", function (msg, level, parent_id, next) {
        var doc = new model({
            hostname: os.hostname(),
            body: JSON.stringify(msg),
            state: "waiting"
            , execute_timeout_time: 0,
            push_time: Date.now()
            , parent_id: parent_id
            , next: next
            , level: level || 0
        });
        return new Promise(function (resolve, reject) {
            doc.save(function (err) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve()
                }
            })
        })
    });
}