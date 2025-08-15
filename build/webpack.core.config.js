const webpack = require('webpack');
const { merge } = require('webpack-merge');
const commonConfig = require('./webpack.common.config');

// Core wallet build configuration - exclude agent components
const config = {
  entry: {
    background: commonConfig.entry.background,
    'content-script': commonConfig.entry['content-script'],
    pageProvider: commonConfig.entry.pageProvider,
    ui: commonConfig.entry.ui,
    offscreen: commonConfig.entry.offscreen,
  },
  output: {
    ...commonConfig.output,
    filename: '[name].js',
  },
  module: {
    ...commonConfig.module,
    rules: [
      ...commonConfig.module.rules,
      {
        // Exclude agent-related files from core build
        test: /[\\/]src[\\/]background[\\/]service[\\/]agent[\\/]/,
        exclude: /node_modules/,
        use: 'ignore-loader', // Skip agent files in core build
      },
    ],
  },
  optimization: {
    ...commonConfig.optimization,
    splitChunks: {
      cacheGroups: {
        'webextension-polyfill': {
          minSize: 0,
          test: /[\\/]node_modules[\\/]webextension-polyfill/,
          name: 'webextension-polyfill',
          chunks: 'all',
          priority: 100,
          enforce: true,
        },
        'vendors': {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: -10,
          reuseExistingChunk: true,
        },
      },
    },
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.BUILD_ENV': JSON.stringify('DEV'),
      'process.env.DEBUG': true,
      'process.env.CORE_ONLY': JSON.stringify(true),
    }),
  ],
};

module.exports = merge(commonConfig, config);