const co = require("co");

// Generator 函数分别迭代的值类型
/**
 * Promise
 * Generator 函数
 * Thunk 函数
 * 数组，可以包含以上任意类型
 * 对象, value 可以包含以上任意类型
 */

function* generator() {
  const user = {
    name: "ejtoia",
    hobby: ["write code", "movie"],
    age: Promise.resolve(25),
  };
  const result = yield user;
  return result;
}

co(generator).then((data) => {
  console.log(data); // { name: 'ejtoia', hobby: [ 'write code', 'movie' ], age: 25 }
});
