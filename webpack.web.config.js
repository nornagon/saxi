const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  ...require('./webpack.config.js'),
  entry: './src/ui.tsx',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist', 'ui'),
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
    })
  ]
};
