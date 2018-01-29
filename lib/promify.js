module.exports = function (func,self) {
    //console.log(func);
    return function () {
        var in_arguments = arguments;
        
        return new Promise(function (resolve, reject) {
            var args = [];
            for (let i = 0; i < in_arguments.length; i++) {
                args.push(in_arguments[i]);
            }
            args.push(function (e, v) {
                if (e) {
                    reject(e)
                }
                else {
                    resolve(v);
                }
            })
            func.apply(self, args);
        })
    }
}