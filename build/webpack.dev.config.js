const webpack = require('webpack');

// for extension local test, can build each time
const config = {
  mode: 'development',
  // Use a CSP-safe source map that doesn't rely on eval, required for MV3 extension contexts
  devtool: 'cheap-module-source-map',
  watch: true,
  watchOptions: {
    ignored: ['**/public', '**/node_modules'],
    followSymlinks: false,
    aggregateTimeout: 1000, // Delay rebuilding to reduce memory pressure
    poll: 2000, // Poll less frequently
  },
  optimization: {
    removeAvailableModules: false,
    removeEmptyChunks: false,
    splitChunks: false,
    minimize: false, // Don't minimize in development
    usedExports: false, // Skip tree shaking
    sideEffects: false, // Skip side effects detection
  },
  performance: {
    hints: false, // Disable performance hints to save memory
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.BUILD_ENV': JSON.stringify('DEV'),
      'process.env.DEBUG': true,
    }),
  ],
};

module.exports = config;
