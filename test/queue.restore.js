var mmq = require('../lib/index');
var sleep = require('../lib/sleep');

(async function () {
    await mmq.Restore({
        connstring:"mongodb://localhost/mq",
        queues:['test']
    });
})();