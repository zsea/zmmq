var mongoose = require('mongoose');
var os = require('os');
var promify = require('./promify');
var qSchema = require('./schema');
var Schema = mongoose.Schema;
var transSchema = new Schema({
    pid: String,
    time: Number,
    hostname: String,
    redo: Array
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
            for (let k in model_affect) {
                await promify(model_affect[k].update, model_affect[k])({ trans_id: id }, { $unset: { 'trans_id': '' } }, { multi: true });
            }
            await promify(trans_model.findByIdAndRemove, trans_model)(id);
        }
    });
    this.__defineGetter__("Insert", function () {
        return async function (model, doc) {
            let model_key = `${model.db}_${model.collection}_${model.modelName}`;
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
            let model_key = `${model.db}_${model.collection}_${model.modelName}`;
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
            let model_key = `${model.db}_${model.collection}_${model.modelName}`;
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
        redo: []
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
module.exports = {
    Begin: begin
}