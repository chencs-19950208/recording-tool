const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
  entry: path.join(__dirname, './libs/recorder.ts'), // 入口
  output: { // 输出
    path: path.join(__dirname, './dist'),
    filename: 'recorder.js'
  },
  devtool: "source-map",
  resolve: {
    extensions: [".ts", ".tsx", ".js"]
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
  plugins: [
    new CleanWebpackPlugin()
  ],
  mode: 'development',
}