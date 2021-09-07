/**
 * slice() reference.
 */
// 方便使用 slice 将类数组转换为数组
var slice = Array.prototype.slice;

/**
 * 导出 co 模块
 */
module.exports = co["default"] = co.co = co;

/**
 * co 核心函数，调用 co 会返回 promise
 * @param {Function} fn
 * @return {Promise}
 * @api public
 */
function co(gen) {
  // 保存 co 函数调用的上下文 this 对象
  var ctx = this;

  // 获取除了 gen 参数的其他参数组成的数组
  var args = slice.call(arguments, 1);

  // 返回一个 promise 对象
  return new Promise(function (resolve, reject) {
    // gen 是一个函数，就调用它创建一个迭代器对象
    if (typeof gen === "function") gen = gen.apply(ctx, args);

    // gen 是一个普通函数调用，直接 resolve gen 的返回值
    if (!gen || typeof gen.next !== "function") return resolve(gen);

    onFulfilled();

    /**
     * @param {Mixed} res
     * @return {Promise}
     * @api private
     *
     * 第一次调用时, res 的值为 undefined
     * 后面每次迭代都接受 promise resolve 的结果
     */

    function onFulfilled(res) {
      var ret;
      try {
        /**
         * 迭代器对象调用 next() 获取 yield 后每次迭代的值
         * 调用 next() 方法时, 如果传入了 res, 这个参数会传给上一条执行 yield 语句左边的变量
         */
        ret = gen.next(res);
      } catch (e) {
        return reject(e);
      }
      /**
       * ret => {value: any, done: boolean}
       * 在 next 函数中根据 done 值判断迭代器是否结束。如果没有结束，则尝试将 value 转成 promise
       * 核心代码是 toPromise 这个函数
       */
      next(ret);
      return null;
    }

    /**
     * @param {Error} err
     * @return {Promise}
     * @api private
     */

    function onRejected(err) {
      var ret;
      try {
        ret = gen.throw(err);
      } catch (e) {
        return reject(e);
      }
      next(ret);
    }

    /**
     * @param {Object} ret
     * @return {Promise}
     * @api private
     */

    function next(ret) {
      /**
       * done -> true, 迭代器结束
       * done -> false, 继续处理 value 值
       */

      // 当 done 为 true, 迭代结束, 成功 resolve value值
      if (ret.done) return resolve(ret.value);

      // 把 yield 后紧跟迭代器返回的值转成 promise
      var value = toPromise.call(ctx, ret.value);

      // 如果 yield 迭代的值可以被转换为 promise 对象
      // 成功，使用 onFulfilled 函数接受成功的结果
      // 失败，使用 onRejected 函数接受失败的结果
      if (value && isPromise(value)) return value.then(onFulfilled, onRejected);

      // yidle 迭代器返回的值不能为 toPromise 转换为 promise 对象，则抛错
      // 因此 yidle 后迭代的值是受 co 函数限制的
      return onRejected(
        new TypeError(
          "You may only yield a function, promise, generator, array, or object, " +
            'but the following object was passed: "' +
            String(ret.value) +
            '"'
        )
      );
    }
  });
}

/**
 * @param {Mixed} obj
 * @return {Promise}
 * @api private
 * 将 yield 后迭代的值转成 promise 【核心代码】
 *
 */
function toPromise(obj) {
  // 值为 falsy , 返回原值
  if (!obj) return obj;

  // 如果 yield 后迭代的值是 promise, 直接返回这个 promise
  if (isPromise(obj)) return obj;

  // 如果 yield 后迭代的值是 Generator 函数, 再次调用 co 处理 Generator。co 调用的返回的值是 promise
  if (isGeneratorFunction(obj) || isGenerator(obj)) return co.call(this, obj);

  // 如果 yield 后迭代的值是 Thunk 函数, 使用 thunkToPromise 将 Thunk 转成 promise并返回
  if ("function" == typeof obj) return thunkToPromise.call(this, obj);

  // 如果 yield 后迭代的值是数组, 将数组每一项都尝试转为 promise, 调用 Promise.all 处理，返回一个新的 promise
  if (Array.isArray(obj)) return arrayToPromise.call(this, obj);

  // 如果 yield 后迭代的值是继承自 Object 的对象, 将对象中所有 key 对应的 value 值都尝试转为 promise
  if (isObject(obj)) return objectToPromise.call(this, obj);

  return obj;
}

/**
 * 接受 Thunk 函数，返回一个 promise 对象
 * resolve 的值就是 Thunk 函数接受的结果
 */
function thunkToPromise(fn) {
  var ctx = this;
  return new Promise(function (resolve, reject) {
    fn.call(ctx, function (err, res) {
      if (err) return reject(err);
      // 如果回调接受的参数大于 2 个, resolve 的值为除 err 外所有参数组成的数组
      if (arguments.length > 2) res = slice.call(arguments, 1);
      resolve(res);
    });
  });
}

/**
 * Promise.all 返回一个新的 promise 对象
 * @param {Array} obj
 * @return {Promise}
 * @api private
 */
function arrayToPromise(obj) {
  return Promise.all(obj.map(toPromise, this));
}

/**
 * 将一个对象转成 promise，返回 Promise.all 对所有 promises resolve 的结果值 results 对象
 */
function objectToPromise(obj) {
  // 相当于 new Object 创建出一个新的对象
  var results = new obj.constructor();

  // 获取 obj 对象的所有可枚举的 key 组成数组
  var keys = Object.keys(obj);

  // 用于存储对 value 转换的 promise
  var promises = [];

  // 循环 obj key 数组
  for (var i = 0; i < keys.length; i++) {
    // obj 的每一个 key
    var key = keys[i];

    // 将 obj key 对应的 value 值尝试转换为 promise 对象
    var promise = toPromise.call(this, obj[key]);

    // 转换的 promise 可能是异步的处理，因此需要先将异步的处理存放到 promises 数组中
    if (promise && isPromise(promise)) defer(promise, key);
    // 转换后的不是 promise, 直接把 value 赋值给 results 对应的 key
    else results[key] = obj[key];
  }

  // 返回一个新的 promise 对象, 等待所有 promise 的 resolve 回调都结束才触发 then 函数
  // 只有所有的 promise 都 resolve 了，obj 对象 key 对应的值才赋值到 results 对象中
  // 并返回最终的 results 值
  return Promise.all(promises).then(function () {
    return results;
  });

  function defer(promise, key) {
    // 先初始化 results key 的值
    results[key] = undefined;
    // 将 promise 先存储到 promises 数组中
    promises.push(
      promise.then(function (res) {
        results[key] = res;
      })
    );
  }
}

/**
 * 检查 obj 是不是 promise 对象
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */

function isPromise(obj) {
  return "function" == typeof obj.then;
}

/**
 *
 * @param {Mixed} obj
 * @return {Boolean}
 * @api private
 */

// 检查 obj 是不是生成器对象
function isGenerator(obj) {
  return "function" == typeof obj.next && "function" == typeof obj.throw;
}

/**
 * Check if `obj` is a generator function.
 *
 * @param {Mixed} obj
 * @return {Boolean}
 * @api private
 */

// 校验 obj 是不是 Generator
function isGeneratorFunction(obj) {
  // 获取构造函数对象
  var constructor = obj.constructor;
  if (!constructor) return false;

  // 判断构造函数的 name 和 displayName, 如果符合直接返回 true
  if (
    "GeneratorFunction" === constructor.name ||
    "GeneratorFunction" === constructor.displayName
  )
    return true;
  return isGenerator(constructor.prototype);
}

// 检查 val 是不是一个普通对象 {} 或 new Object()
function isObject(val) {
  return Object == val.constructor;
}
