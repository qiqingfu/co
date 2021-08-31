/**
 * slice() reference.
 */
// 方便使用 slice 对数组或类数组进行浅拷贝
var slice = Array.prototype.slice;

/**
 * Expose `co`.
 */
// 导出 co
module.exports = co["default"] = co.co = co;

/**
 * Wrap the given generator `fn` into a
 * function that returns a promise.
 * This is a separate function so that
 * every `co()` call doesn't create a new,
 * unnecessary closure.
 *
 * @param {GeneratorFunction} fn
 * @return {Function}
 * @api public
 */

co.wrap = function (fn) {
  createPromise.__generatorFunction__ = fn;
  return createPromise;
  function createPromise() {
    return co.call(this, fn.apply(this, arguments));
  }
};

/**
 * Execute the generator function or a generator
 * and return a promise.
 *
 * @param {Function} fn
 * @return {Promise}
 * @api public
 */
// co 核心函数
function co(gen) {
  // 获取 co 函数调用时的上下文对象 this
  var ctx = this;

  // 获取除第一个参数外的所有参数集合
  var args = slice.call(arguments, 1);

  // we wrap everything in a promise to avoid promise chaining,
  // which leads to memory leak errors.
  // see https://github.com/tj/co/issues/180
  // 返回一个 Promise 对象
  return new Promise(function (resolve, reject) {
    // 如果 gen 是 Generator 函数, 立即调用它并将 args 作为参数传入
    // 返回一个迭代器对象
    if (typeof gen === "function") gen = gen.apply(ctx, args);

    // 如果 gen 不存在, 或者 gen 不是 Generator 调用创建的迭代器对象, 直接 resolve gen
    if (!gen || typeof gen.next !== "function") return resolve(gen);

    onFulfilled();

    /**
     * @param {Mixed} res
     * @return {Promise}
     * @api private
     */

    function onFulfilled(res) {
      var ret;
      try {
        /**
         * 获取迭代器的值 ret {value: string, done: boolean}
         * 调用 next() 方法时, 如果传入了参数, 那么这个参数会传给上一条执行 yield 语句左边的变量
         */
        ret = gen.next(res);
      } catch (e) {
        return reject(e);
      }
      /**
       * ret 就是 Generator 函数中 yield 后面的值
       * 对 ret 值进行处理, 将它转换为 promise 对象
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
     * Get the next value in the generator,
     * return a promise.
     *
     * @param {Object} ret
     * @return {Promise}
     * @api private
     */

    function next(ret) {
      /**
       * 如果 done 为 true, 说明迭代器超出迭代序列的末尾, 则停止迭代结束
       * 如果 done 为 false,说明迭代器能够生成序列中的下一个值
       */

      // 当 done 为 true, 迭代结束, 成功 resolve value值
      if (ret.done) return resolve(ret.value);

      // 把 yield 后紧跟迭代器返回的 value 值转换成 Promise
      var value = toPromise.call(ctx, ret.value);

      // value 存在, 并且 value 是 promise 对象
      // 就调用它的 then 方法, 第一个回调函数接受 promise resolve 的结果
      if (value && isPromise(value)) return value.then(onFulfilled, onRejected);

      // yidle 值不符合处理逻辑的类型
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
 * Convert a `yield`ed value into a promise.
 *
 * @param {Mixed} obj
 * @return {Promise}
 * @api private
 */

function toPromise(obj) {
  // 值为假, 直接返回
  if (!obj) return obj;

  // 如果该值已经是 Promise, 直接返回这个 Promise
  if (isPromise(obj)) return obj;

  // 如果值是生成器函数或生成器对象, 则调用 co 递归处理这个生成器, 返回一个 Promise
  if (isGeneratorFunction(obj) || isGenerator(obj)) return co.call(this, obj);

  // 如果是一个函数, 使用 thunkToPromise 处理并返回一个 Promise
  if ("function" == typeof obj) return thunkToPromise.call(this, obj);

  // 将数组中的每个值都转换为 Promise, 并使用 Promise.all 处理
  if (Array.isArray(obj)) return arrayToPromise.call(this, obj);

  // 如果值是一个继承自 Object 的对象, 将对象转换为 Promise, 转换规则为 objectToPromise 实现
  if (isObject(obj)) return objectToPromise.call(this, obj);

  return obj;
}

/**
 * Convert a thunk to a promise.
 *
 * @param {Function}
 * @return {Promise}
 * @api private
 */
// 将 thunk 函数处理成 Promise
function thunkToPromise(fn) {
  var ctx = this;
  return new Promise(function (resolve, reject) {
    fn.call(ctx, function (err, res) {
      if (err) return reject(err);
      // 如果回调函数接受的参数大于 2 个, 除了 err 之外的所有参数作为数组类型返回
      if (arguments.length > 2) res = slice.call(arguments, 1);
      resolve(res);
    });
  });
}

/**
 * Convert an array of "yieldables" to a promise.
 * Uses `Promise.all()` internally.
 *
 * @param {Array} obj
 * @return {Promise}
 * @api private
 */

// 对一组值转换为 Promise, 并使用 Promise.all 接受这组 Promise 的结果
function arrayToPromise(obj) {
  return Promise.all(obj.map(toPromise, this));
}

/**
 * Convert an object of "yieldables" to a promise.
 * Uses `Promise.all()` internally.
 *
 * @param {Object} obj
 * @return {Promise}
 * @api private
 */

function objectToPromise(obj) {
  // 相当于 new Object 创建出一个新的对象
  var results = new obj.constructor();

  // 获取这个对象的所有 key 组成的数组
  var keys = Object.keys(obj);

  // 存储 promise 的数组
  var promises = [];

  // 遍历对象的 key 数组
  for (var i = 0; i < keys.length; i++) {
    // 对象的每一个 key
    var key = keys[i];

    // 将 key 对应的值转换为 Promise
    var promise = toPromise.call(this, obj[key]);

    // 校验, 如果转换成了 promise 对象, 执行 defer 逻辑
    if (promise && isPromise(promise)) defer(promise, key);
    // 否则, 将 key 对应的普通值存储到 results 中
    else results[key] = obj[key];
  }

  // 返回一个新的 promise 对象, 等待所有 promise 的 resolve 回调都结束才触发 then 函数
  return Promise.all(promises).then(function () {
    return results;
  });

  function defer(promise, key) {
    // predefine the key in the result
    results[key] = undefined;
    // 存储一组 promise.then 返回的新的 promise 对象
    promises.push(
      promise.then(function (res) {
        results[key] = res;
      })
    );
  }
}

/**
 * Check if `obj` is a promise.
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */

function isPromise(obj) {
  return "function" == typeof obj.then;
}

/**
 * Check if `obj` is a generator.
 *
 * @param {Mixed} obj
 * @return {Boolean}
 * @api private
 */

// 是否是一个生成器对象
// 生成器对象有 next 和 throw 方法
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

// 校验 obj 是不是生成器函数
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

/**
 * Check for plain object.
 *
 * @param {Mixed} val
 * @return {Boolean}
 * @api private
 */

function isObject(val) {
  return Object == val.constructor;
}
