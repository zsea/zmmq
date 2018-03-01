var mmq = require('../lib/index');
var sleep=require('../lib/sleep');
(async function name(params) {
    var mq = new mmq("mongodb://localhost/mq", "father");
    //var trans = await mq.Transaction.Begin();
    while(true){
        var msg=await mq.pull(500);
        console.log(msg);
        if(msg){
            
            await msg.done();
        }
        else{
            break;
        }
    }
    console.log("completed.");
    process.exit();
})();