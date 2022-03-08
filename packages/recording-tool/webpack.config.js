const path = require('path');

module.exports = {
  entry: path.join(__dirname, './libs/recorder.ts'), // 入口
  output: { // 输出
    path: path.join(__dirname, './dist'),
    filename: 'bundle.js'
  },
  module: {
    rules: [
      {
        // 配置 babel 转化的规则
        test: /\.js/, 
        use: 'babel-loader',
        exclude: /node_modules/
      },
      {
        test: /\.ts?$/,
        use: {
          loader: 'ts-loader',
        },
        exclude: /node_modules/
      }
    ]
  },
  mode: 'development'
}