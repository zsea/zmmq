
var mongoose = require('mongoose');
var Transaction = require('./transaction');
var os = require('os');
var promify = require('./promify');
var qSchema = require('./schema');
var sleep = require('./sleep');

function Trans(conn, collection, defaultModel) {
    let _trans, models = {};
    this.__defineGetter__("__init__", function () {
        return async function () {
            _trans = await Transaction.Begin(conn, collection);
        }
    })
    this.__defineGetter__("push", function () {
        return async function (msg, options, queue) {
            options = options || {};
            let now = Date.now();
            let level = options.level || 0, groupid = options.groupid || undefined, tag = options.tag
                , start = options.start || now;
            let m;
            if (queue) {
                m = models[queue];
            }
            else {
                m = defaultModel;
            }
            if (!m) {
                m = mongoose.model(queue, qSchema);
                models[queue] = m;
            }
            var doc = new m({
                hostname: os.hostname(),
                body: JSON.stringify(msg),
                state: "waiting"
                , execute_timeout_time: 0,
                push_time: Date.now()
                //, parent_id: parent_id
                //, next: next
                , tag: tag
                , groupid: groupid
                , level: level
                , start_time: now
            });
            return await _trans.Insert(m, doc)
        }
    });
    this.__defineGetter__("Commit", function () {
        return async function () {
            await _trans.Commit();
        }
    });
    this.__defineGetter__("Rollback", function () {
        return async function () {
            await _trans.Rollback();
        }
    });
    this.__defineGetter__("done", function () {
        return async function (id, queue) {
            let m;
            if (queue) {
                m = models[queue];
            }
            else {
                m = defaultModel;
            }
            if (!m) {
                m = mongoose.model(queue, qSchema);
                models[queue] = m;
            }
            await _trans.findByIdAndUpdate(m, id, { state: "success" });
        }
    });
}
/*
 * 
 * @param {string} connectionstring - 到mongodb的连接字符串
 * @param {string} name - 队列名称
 * @param {string} parent -父队列名称
 */
function Queue(connectionstring, name) {
    var conn = mongoose.connect(connectionstring, { autoIndex: false });
    var model = mongoose.model(name, qSchema);
    var self = this;
    var pocessTag = null;
    async function done(id) {
        await promify(model.findByIdAndUpdate, model)(id, { state: "success", success_time: Date.now() });
    }
    this.__defineGetter__("Begin", function () {
        return async function () {
            let trans = new Trans(conn, "_trans", model);
            await trans.__init__();
            return trans;
        }
    })
    this.__defineGetter__("push", function () {
        return function (msg, options, queue) {
            options = options || {};
            let now = Date.now();
            let level = options.level || 0, groupid = options.groupid || undefined, tag = options.tag
                , start = options.start || now;
            let m;
            if (queue) {
                m = models[queue];
            }
            else {
                m = model;
            }
            if (!m) {
                m = mongoose.model(queue, qSchema);
                models[queue] = m;
            }
            var doc = new m({
                hostname: os.hostname(),
                body: JSON.stringify(msg),
                state: "waiting"
                , execute_timeout_time: 0,
                push_time: Date.now()
                //, parent_id: parent_id
                //, next: next
                , tag: tag
                , groupid: groupid
                , level: level
                , start_time: start
            });
            return new Promise(function (resolve, reject) {
                doc.save(function (err) {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(true)
                    }
                })
            })
        }
    });
    this.__defineGetter__("done", function () {
        return done;
    });
    this.__defineGetter__("pull", function () {
        return async function (ms) {
            while (true) {
                let query = { state: "waiting", start_time: { $lte: Date.now() }, trans_id: { $exists: false } };
                if (pocessTag) {
                    query["tag"] = pocessTag;
                }
                let msg = await promify(model.findOneAndUpdate, model)(query, { state: "execing", executeor: os.hostname(), pull_time: Date.now() }, { sort: { level: -1, push_time: 1 } });
                if (msg) {
                    return {
                        id: msg._id,
                        body: JSON.parse(msg.body),
                        done: async function () {
                            await done(msg._id);
                        },
                        groupid:msg.groupid
                    }
                }
                if (pocessTag) {
                    delete query["tag"];
                }
                msg = await promify(model.findOneAndUpdate, model)(query, { state: "execing", executeor: os.hostname(), pull_time: Date.now() }, { sort: { level: -1, push_time: 1 } });
                if (msg) {
                    return {
                        id: msg._id,
                        body: JSON.parse(msg.body),
                        done: async function () {
                            await done(msg._id);
                        },
                        groupid:msg.groupid
                    }
                }
                if (!ms) return;
                await sleep(ms);
            }
        }
    });
    this.__defineGetter__("setTag", function () {
        return function (tag) {
            pocessTag = tag;
        }
    })
}

module.exports = Queue;