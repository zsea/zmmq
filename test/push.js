var mmq = require('../lib/index');
var sleep = require('../lib/sleep');
(async function name(params) {
    var mq = new mmq("mongodb://localhost/mq", "test");
    //var trans = await mq.Transaction.Begin();
    var trans = await mq.Begin();
    for (let i = 0; i < 10; i++) {
        //await trans.push(i,{tag:i<5?"海海":"蚊子"});
        await trans.push("levle", { level: 10 });
        await sleep(1000);
        break;
    }

    await trans.Commit();
    console.log("pushed.");
    process.exit();
})();