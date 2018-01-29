
var mongoose = require('mongoose');
var Transaction = require('./transaction');
var os = require('os');

var qSchema = require('./schema');
/*
 * 
 * @param {string} connectionstring - 到mongodb的连接字符串
 * @param {string} name - 队列名称
 * @param {string} parent -父队列名称
 */
function Queue(connectionstring, name, parent) {
    var conn = mongoose.connect(connectionstring, { autoIndex: false });
    var model = mongoose.model(name, qSchema);
    var trans = {};
    trans.__defineGetter__("Begin", function () {
        return function () {
            return Transaction.Begin(conn, "_trans");
        }
    });
    this.__defineGetter__("push", function () {
        return function (msg, level, parent_id, next) {
            var doc = new model({
                hostname: os.hostname(),
                body: JSON.stringify(msg),
                state: "waiting"
                , execute_timeout_time: 0,
                push_time: Date.now()
                , parent_id: parent_id
                , next: next
                , level: level || 0
            });
            return new Promise(function (resolve, reject) {
                doc.save(function (err) {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve()
                    }
                })
            })
        }
    });
    this.__defineGetter__("Transaction", function () {
        return trans;
    });
    this.__defineGetter__("Model",function(){
        return model;
    })
}

module.exports = Queue;