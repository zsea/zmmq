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
            let father = options.father, children = options.children;
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
                , start_time: now,
                father: father,
                //children: children,
                uncompleted: children
            });
            await _trans.Insert(m, doc);
            if (father) {
                let fatherArray = father.split(":");
                //console.log(father);
                let fm = models[fatherArray[0]];
                if (!fm) {
                    fm = mongoose.model(fatherArray[0], qSchema);
                    models[fatherArray[0]] = fm;
                }
                _trans.findByIdAndUpdate(fm, fatherArray[1], { $addToSet: { children: m.modelName + ":" + doc._id, uncompleted: m.modelName + ":" + doc._id } })
            }
            return doc._id + "";
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
            if (!queue) {
                queue = m.modelName;
            }
            let origin = await _trans.findByIdAndUpdate(m, id, { state: "success" });
            if (origin && origin.father) {
                let fInfo = origin.father.split(":");
                let q = fInfo[0], father_id = fInfo[1];
                if (!q || !father_id) {
                    throw new Error("父队列信息错误。")
                }
                m = models[q];
                if (!m) {
                    m = mongoose.model(q, qSchema);
                    models[q] = m;
                }
                await _trans.findByIdAndUpdate(m, father_id, { $pull: { uncompleted: queue + ':' + id } });
            }
        }
    });
    this.__defineGetter__("Close", function () {
        return function () {
            _trans = null;
            models = null;
        }
    })
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
    async function Begin() {
        let trans = new Trans(conn, "_trans", model);
        await trans.__init__();
        return trans;
    }
    async function done(id) {
        let _trans = await Begin();
        await _trans.done(id, name);
        await _trans.Commit();
        _trans.Close();
        _trans = null;
        //await promify(model.findByIdAndUpdate, model)(id, { state: "success", success_time: Date.now() });
    }
    async function push(msg, options, queue) {
        let _trans = await Begin();
        var id = await _trans.push(msg, options, queue);
        await _trans.Commit();
        _trans.Close();
        _trans = null;
        return id;
    }
    this.__defineGetter__("Begin", function () {
        return Begin;
    })
    this.__defineGetter__("push", function () {
        return push;
    });
    this.__defineGetter__("done", function () {
        return done;
    });
    this.__defineGetter__("pull", function () {
        return async function (ms) {
            while (true) {
                let query = { state: "waiting", start_time: { $lte: Date.now() }, trans_id: { $exists: false }, "uncompleted.0": { $exists: false } };
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
                        groupid: msg.groupid
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
                        groupid: msg.groupid
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
/**
 * 
 * @param {object} options - 选项
 * @param {string} options.connstring - 连接字符串
 * @param {Number} [options.timeout] - 消息处理超时时间，单位分钟，默认10分钟
 * @param {string[]} options.queues - 需要处理超时的队列，必填
 * @param {Number} [options.interval] - 每轮的间隔时间，单位毫秒，默认60000
 */
async function restore(options) {
    var timeout = (options.timeout || 10) * 60 * 1000;
    var conn = mongoose.connect(options.connstring, { autoIndex: false });
    var models = (options.queues || []).map(function (q) {
        return mongoose.model(q, qSchema);
    });
    while (true) {
        for (let i = 0; i < models.length; i++) {
            await promify(models[i].update, models[i])({ pull_time: { $lt: Date.now() - timeout }, state: 'execing' }, { state: 'waiting' }, { multi: true });
        }
        await sleep(options.interval || 60000);
    }
}
module.exports = Queue;
module.exports.Restore = restore;