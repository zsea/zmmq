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
function SaveDoc(doc) {
    return new Promise(function (resolve, reject) {
        doc.save(function (err) {
            if (err) {
                reject(err);
            }
            else {
                resolve(doc);
            }
        })
    })
}
/**创建一个事务对象，包含回滚和提交操作 */
/**
 * @param {string} id - 事务id
 * @param {object} conn - mongodb连接对象
 * @param {string} collection - 存储事务信息的集合名称
 */
function Transaction(id, trans_model) {
    var model_affect = {};
    this.__defineGetter__("Rollback", async function () { });
    this.__defineGetter__("Commit", function () {
        return async function () {
            //var models=[];
            for (let k in model_affect) {
                await promify(model_affect[k].update,model_affect[k])({ trans_id: id }, { $unset: { 'trans_id': '' } });
            }
            await promify(trans_model.findByIdAndRemove,trans_model)(id);
        }
    });
    this.__defineGetter__("Insert", function () {
        return async function (model, doc) {
            if (!model_affect[`${model.db}_${model.collection}_${model.modelName}`]) {
                model_affect[`${model.db}_${model.collection}_${model.modelName}`] = model;
            }
            await promify(trans_model.findByIdAndUpdate, trans_model)(id, { $push: { redo: { id: doc._id, "action": "insert" } } });
            doc.trans_id = id;
            return promify(doc.save, doc)();
        }
    });
    this.__defineGetter__("findByIdAndUpdate", async function (model, docid, updater) {
        if (!model_affect[`${model.db}_${model.collection}_${model.modelName}`]) {
            model_affect[`${model.db}_${model.collection}_${model.modelName}`] = model;
        }
        var origin = await promify(model.findByIdAndUpdate)(docid, { trans_id: id }); //锁定原始数据
        if (!origin) return;
        await promify(trans_model.findByIdAndUpdate)(id, { $push: { id: docid, "origin": origin, "action": "update" } });//添加redo操作
        await promify(model.findByIdAndUpdate)(docid, updater); //正式修改数据
        return origin;
    });
    this.__defineGetter__("findByIdAndRemove", async function (model, docid) {
        if (!model_affect[`${model.db}_${model.collection}_${model.modelName}`]) {
            model_affect[`${model.db}_${model.collection}_${model.modelName}`] = model;
        }
        var origin = await promify(model.findByIdAndUpdate)(docid, { trans_id: id }); //锁定原始数据
        if (!origin) return;
        await promify(trans_model.findByIdAndUpdate)(id, { $push: { id: docid, "origin": origin, action: "remove" } });//添加redo操作
        await promify(model.findByIdAndRemove)(docid);
        return origin;
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