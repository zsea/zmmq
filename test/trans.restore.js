var trans = require('../lib/transaction');

(async function name(params) {
    await trans.Restore({
        connstring: "mongodb://localhost/mq"
    });
})();