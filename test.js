var mmq = require('./lib/index');

(async function name(params) {
    var mq = new mmq("mongodb://localhost/mq", "test");
    var trans = await mq.Transaction.Begin();
    await trans.Insert(mq.Model, new mq.Model({
        body: "abcdefg"
    }));
    /*await trans.Insert(mq.Model, new mq.Model({
        body: "xxxxkkk"
    }));*/
    await trans.findByIdAndUpdate(mq.Model, "5a702714a68a200130165086", { body: 'xxxdf' });
    //await trans.findByIdAndRemove(mq.Model, "5a6fe761ac5ced10bc65b7cd");
    await trans.Commit();
    //await trans.Rollback();
    console.log("completed.");
    process.exit();
})();