var mongoose = require('mongoose');
var os = require('os');
var promify = require('./promify');
var qSchema = require('./schema');
var sleep = require('./sleep');
var Schema = mongoose.Schema;
var transSchema = new Schema({
    pid: String,
    time: Number, //事务创建时间，单位：毫秒
    hostname: String,
    redo: Array,
    state: String //事务状态：writing/commit/rollback
});

/**创建一个事务对象，包含回滚和提交操作 */
/**
 * @param {string} id - 事务id
 * @param {object} conn - mongodb连接对象
 * @param {string} collection - 存储事务信息的集合名称
 */
function Transaction(id, trans_model) {
    var model_affect = {};
    this.__defineGetter__("Rollback", function () {
        return async function () {
            let trans_info = await promify(trans_model.findById, trans_model)(id);
            if (!trans_info) {
                return;
            }
            await promify(trans_model.findByIdAndUpdate, trans_model)(id, { state: "rollback" });
            var redo = trans_info.redo;
            for (let i = 0; i < redo.length; i++) {
                let model = model_affect[redo[i].model];
                let docid = redo[i].id;
                switch (redo[i].action) {
                    case "insert": {
                        await promify(model.findByIdAndRemove, model)(docid);
                        break;
                    }
                    case "update": {
                        await promify(model.findByIdAndRemove, model)(docid);
                        await model.create([redo[i].origin]);
                        break;
                    }
                    case "remove": {
                        await promify(model.findByIdAndRemove, model)(docid);
                        await model.create([redo[i].origin]);
                        break;
                    }
                }
            }
            await promify(trans_model.findByIdAndRemove, trans_model)(id);
        }
    });
    this.__defineGetter__("Commit", function () {
        return async function () {
            //var models=[];
            await promify(trans_model.findByIdAndUpdate, trans_model)(id, { state: "commit" });
            throw Error("aaaaa")
            for (let k in model_affect) {
                await promify(model_affect[k].update, model_affect[k])({ trans_id: id }, { $unset: { 'trans_id': '' } }, { multi: true });
            }
            await promify(trans_model.findByIdAndRemove, trans_model)(id);
        }
    });
    this.__defineGetter__("Insert", function () {
        return async function (model, doc) {
            let model_key = model.modelName;
            if (!model_affect[model_key]) {
                model_affect[model_key] = model;
            }
            await promify(trans_model.findByIdAndUpdate, trans_model)(id, { $push: { redo: { id: doc._id, "action": "insert", model: model_key } } });
            doc.trans_id = id;
            return promify(doc.save, doc)();
        }
    });
    this.__defineGetter__("findByIdAndUpdate", function () {
        return async function (model, docid, updater) {
            let model_key = model.modelName;
            if (!model_affect[model_key]) {
                model_affect[model_key] = model;
            }
            var origin = await promify(model.findByIdAndUpdate, model)(docid, { trans_id: id }); //锁定原始数据
            if (!origin) return;
            await promify(trans_model.findByIdAndUpdate, trans_model)(id, { $push: { redo: { id: docid, "origin": origin, "action": "update", model: model_key } } });//添加redo操作
            await promify(model.findByIdAndUpdate, model)(docid, updater); //正式修改数据
            return origin;
        }
    });
    this.__defineGetter__("findByIdAndRemove", function () {
        return async function (model, docid) {
            let model_key = model.modelName;
            if (!model_affect[model_key]) {
                model_affect[model_key] = model;
            }
            var origin = await promify(model.findByIdAndUpdate, model)(docid, { trans_id: id }); //锁定原始数据
            if (!origin) return;
            await promify(trans_model.findByIdAndUpdate, trans_model)(id, { $push: { redo: { id: docid, "origin": origin, action: "remove", model: model_key } } });//添加redo操作
            await promify(model.findByIdAndRemove, model)(docid);
            return origin;
        }
    });
}

/**
 * 
 * @param {object} conn - mongodb连接对象
 * @param {string} collection - 存储事务信息的集合名称
 */
function begin(conn, collection) {
    var model = mongoose.model(collection, transSchema);
    var doc = new model({
        hostname: os.hostname(),
        time: Date.now(),
        redo: [],
        state: "writing"
    });
    doc.pid = doc._id;
    return new Promise(function (resolve, reject) {
        doc.save(function (err) {
            if (err) {
                reject(err);
            }
            else {
                resolve(new Transaction(doc._id, model));
            }
        })
    })
}

/**
 * 
 * @param {object} options - 选项
 * @param {string} options.connstring - 连接字符串
 * @param {Number} [options.timeout] - 事务超时时间，单位分钟，默认10分钟
 * @param {string} [options.trans] - 存储事务的集合名称，默认_trans
 * @param {Number} [options.interval] - 每轮的间隔时间，单位毫秒，默认60000
 */
async function restore(options) {
    var conn = mongoose.connect(options.connstring, { autoIndex: false });
    var trans_model = mongoose.model(options.trans || '_trans', transSchema);
    var timeout = (options.timeout || 10) * 60 * 1000;
    let cache_models = {};
    async function rollback(trans_info) {
        var redo = trans_info.redo;
        for (let i = 0; i < redo.length; i++) {
            let model = cache_models[redo[i].model];
            if (!model) {
                model = mongoose.model(redo[i].model, qSchema);
                cache_models[redo[i].model] = model;
            }
            let docid = redo[i].id;
            switch (redo[i].action) {
                case "insert": {
                    await promify(model.findByIdAndRemove, model)(docid);
                    break;
                }
                case "update": {
                    await promify(model.findByIdAndRemove, model)(docid);
                    await model.create([redo[i].origin]);
                    break;
                }
                case "remove": {
                    await promify(model.findByIdAndRemove, model)(docid);
                    await model.create([redo[i].origin]);
                    break;
                }
            }
        }
        await promify(trans_model.findByIdAndRemove, trans_model)(trans_info._id);
    }
    async function commit(trans_info) {
        var redo = trans_info.redo;
        for (let i = 0; i < redo.length; i++) {
            let model = cache_models[redo[i].model];
            if (!model) {
                model = mongoose.model(redo[i].model, qSchema);
                cache_models[redo[i].model] = model;
            }
            let docid = redo[i].id;
            await promify(model.findByIdAndUpdate, model)(docid, { $unset: { 'trans_id': '' } });
        }
        await promify(trans_model.findByIdAndRemove, trans_model)(trans_info._id);
    }
    while (true) {
        let trans_info = await promify(trans_model.findOne, trans_model)({ time: { $lt: Date.now() - timeout } });
        if (!trans_info) {
            await sleep(options.interval || 60000);
            continue;
        }
        if (trans_info.state == "writing" || trans_info.state == "rollback") {
            await rollback(trans_info);
        }
        else if (trans_info.state == "commit") {
            await commit(trans_info);
        }
    }
}
module.exports = {
    Begin: begin
    , Restore: restore
}