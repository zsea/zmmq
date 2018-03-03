/*测试事务*/
var mongoose = require('mongoose');
var Transaction = require('../lib/transaction');
var sleep = require('../lib/sleep');
process.on('unhandledRejection', function (reason, p) {
    console.error("Promise中有未处理的错误", p, " 错误原因: ", reason);
    // application specific logging, throwing an error, or other logic here
    setTimeout(function () {
        process.exit(1);
    }, 5000)
});

(async function () {
    //var mq = new mmq("mongodb://localhost/mq", "test", { done_mode: "DEL" });
    var conn = mongoose.connect("mongodb://localhost/mq", { autoIndex: false });
    var qSchema = require('../lib/schema');
    var trans = await Transaction.Begin(conn, "_trans");
    var model = mongoose.model("test", qSchema);
    console.log("创建事务成功");
    await trans.Insert(model, new model({
        body:"xyz"
    }));
    console.log("写入数据完成");
    await trans.Commit();
    await sleep(50000);
})();