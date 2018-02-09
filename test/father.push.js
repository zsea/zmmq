var mmq = require('../lib/index');
var sleep = require('../lib/sleep');
(async function() {
    var mq = new mmq("mongodb://localhost/mq", "children");
    //var trans = await mq.Transaction.Begin();
    var trans = await mq.Begin();
    var fid = await trans.push("father_msg", null, 'father')
    for (let i = 0; i < 10; i++) {
        //await trans.push(i,{tag:i<5?"海海":"蚊子"});
        let mid = await trans.push("levle", { level: 10, father: "father:" + fid },"children");
        //ids.push();
        //await sleep(1000);
        //break;
    }

    await trans.Commit();
    console.log("pushed.");
    process.exit();
})();