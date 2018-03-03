var mmq = require('../lib/index');
var sleep = require('../lib/sleep');
process.on('unhandledRejection', function (reason, p) {
    console.error("Promise中有未处理的错误", p, " 错误原因: ", reason);
    // application specific logging, throwing an error, or other logic here
    setTimeout(function () {
        process.exit(1);
    }, 5000)
});
(async function name(params) {
    var mq = new mmq("mongodb://localhost/mq", "children", { done_mode: "DEL" });
    while (true) {
        var msg = await mq.pull();
        console.log("child", msg);
        if (msg) {
            await msg.done();

        }
        else {
            break;
        }
    }
    console.log("completed.");
    process.exit();
})();