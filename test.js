var mmq = require('./lib/index');

(async function name(params) {
    var mq = new mmq("mongodb://localhost/mq", "test");
    var trans = await mq.Transaction.Begin();
    await trans.Insert(mq.Model, new mq.Model({
        body: "abcdefg"
    }));
    await trans.Insert(mq.Model, new mq.Model({
        body: "xxxxkkk"
    }));
    await trans.Commit();
    console.log("completed.");
    process.exit();
})();