var mmq = require('../lib/index');
var sleep = require('../lib/sleep');
(async function name(params) {
    var mq = new mmq("mongodb://localhost/mq", "test");
    mq.setTag("蚊子");
    //var trans = await mq.Transaction.Begin();
    //await mq.push("aaa,ttt");
    //await mq.push("bbbbbbb");
    //await mq.push("aaa,ttt");
    //await mq.push("aaa,ttt");
    //console.log("pushed.");
    //return;
    while (true) {
        var msg = await mq.pull(1000);
        console.log(msg);
        if(!msg) break;
        //await sleep(30000);
        await msg.done();
    }
    //await mq.done(msg.id);
    /*var trans=await mq.Begin();
    for(let i=0;i<10;i++){
        await trans.push(i,{},"x2");

    }
    await trans.done(msg.id,"test");
    await trans.Commit();*/
    console.log("completed.");
    process.exit();
})();