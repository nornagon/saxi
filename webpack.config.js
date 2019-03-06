const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/ui.tsx',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist', 'ui')
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: ['babel-loader']
      },
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [{
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.web.json'
          }
        }]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.exec\.js$/,
        use: ['script-loader'],
      }
    ]
  },
  resolve: {
    extensions: ['*', '.ts', '.tsx', '.js', '.jsx']
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
    })
  ],
  devtool: 'inline-source-map',
};
