const path = require('path');
const webpack = require('webpack');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
  entry: path.join(__dirname, './libs/index.js'), // 入口
  output: { // 输出
    path: path.join(__dirname, './dist'),
    filename: 'index.js',
    library: 'CoolRecorder',
    libraryTarget: 'umd',
  },
  resolve: {
    extensions: [".js"]
  },
  module: {
    rules: [
      {
        // 配置 babel 转化的规则
        test: /\.js$/, 
        use: 'babel-loader',
        exclude: /node_modules/
      },
      {
        // 对于worker文件进行打包
        test: /\.worker\.js$/,
        use: { loader: 'worker-loader', options: { inline: true }}
      }
    ]
  },
  plugins: [
    // 使得打包得体积更小
    new webpack.optimize.ModuleConcatenationPlugin(),
    new CleanWebpackPlugin()
  ],
  mode: 'development',
  devServer: {}
}