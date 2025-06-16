const { getAllLibrariesEntries, getAllServicesEntries } = require('./getEntryPoints');
const { service, library, configName } = require('./processFlags');
const { allLibrariesConfig, allServicesConfig, serviceConfig, libraryConfig } = require('./configConsts');
const { getLibrariesPath, getServicesPath, getLibraryPath, getServicePath } = require('./getAssets');
const { allFileTypes } = require('./configConsts');
const rspack = require('@rspack/core');
const path = require('path');
const { allConfig } = require('./configConsts');

const codeEngineEnvironment = {
  // The environment supports arrow functions ('() => { ... }').
  arrowFunction: false,
  // The environment supports BigInt as literal (123n).
  bigIntLiteral: false,
  // The environment supports const and let for variable declarations.
  const: false,
  // The environment supports destructuring ('{ a, b } = obj').
  destructuring: false,
  // The environment supports an async import() function to import EcmaScript modules.
  dynamicImport: false,
  // The environment supports 'for of' iteration ('for (const x of array) { ... }').
  forOf: false,
  // The environment supports ECMAScript Module syntax to import ECMAScript modules (import ... from '...').
  module: false,
};

// add or override configuration options here
const generateConfig = () => {
  switch (configName) {
    case allConfig:
      const servicesEntries = getAllServicesEntries({ extensions: ['.ts'] });
      const librariesEntries = getAllLibrariesEntries({ extensions: ['.ts'] });
      return {
        entry: {
          ...Object.keys(servicesEntries).reduce((acc, name) => {
            acc[name] = {
              import: servicesEntries[name],
              filename: path.resolve(__dirname, '..', 'code', 'services', name),
            };
            return acc;
          }, {}),
          ...Object.keys(librariesEntries).reduce((acc, name) => {
            acc[name] = {
              import: librariesEntries[name],
              filename: path.resolve(__dirname, '..', 'code', 'libraries', name),
            };
            return acc;
          }, {}),
        },
        output: {
          environment: codeEngineEnvironment,
        },
      };
    case allServicesConfig:
      return {
        entry: getAllServicesEntries({ extensions: ['.ts'] }),
        output: {
          filename: `[name]`,
          path: getServicesPath(),
          environment: codeEngineEnvironment,
        },
      };
    case serviceConfig:
      return {
        entry: {
          index: [`${getServicePath(service, true)}/${service}`],
        },
        output: {
          filename: `${service}.js`,
          path: getServicePath(service),
          environment: codeEngineEnvironment,
        },
      };
    case allLibrariesConfig:
      return {
        entry: getAllLibrariesEntries({ extensions: ['.ts'] }),
        output: {
          filename: `[name]`,
          path: getLibrariesPath(),
          environment: codeEngineEnvironment,
        },
      };
    case libraryConfig:
      return {
        entry: `${getLibraryPath(library, true)}/${library}`,
        output: {
          filename: `${library}.js`,
          path: getLibraryPath(library),
          environment: codeEngineEnvironment,
        },
      };
  }
};

/** @type {import('@rspack/cli').Configuration} */
const baseConfig = {
  name: configName,
  mode: 'production',
  devtool: false,
  module: {
    rules: [
      {
        test: /\.tsx?$|\.jsx?$|\.mjs?$/,
        loader: 'babel-loader',
        include: [
          path.resolve(__dirname, '../src'),
          path.resolve(__dirname, '../../common/src'),
          path.resolve(__dirname, '../../../', 'node_modules', 'async-mutex'),
          path.resolve(__dirname, '../../../', 'node_modules', 'asn1.js'),
          path.resolve(__dirname, '../../../', 'node_modules', 'mathjs'),
          path.resolve(__dirname, '../../../', 'node_modules', '@supercharge/promise-pool'),
        ],
      },
    ],
  },
  plugins: [
    new rspack.ProvidePlugin({
      process: path.resolve(__dirname, 'polyfills/process.js'),
      Buffer: ['buffer', 'Buffer'], // note: code should do `import { Buffer } from 'buffer'` instead of relying on a global variable
    }),
  ],
  resolve: {
    extensions: allFileTypes,
    tsConfig: path.resolve(__dirname, '..', 'tsconfig.json'),
    alias: {
      buffer: path.resolve(__dirname, './lib/buffer.js'), // note: code should do `import { Buffer } from 'buffer'` instead of relying on a global variable
    },
    fallback: {
      // assert: require.resolve('assert'),
      // util: require.resolve('util'),
      // path: 'path-browserify',
      crypto: require.resolve('crypto-browserify'),
      // buffer: require.resolve('buffer/'),
      // events: require.resolve('events/'),
      stream: 'stream-browserify',
      // url: 'url',
      // http: path.resolve(__dirname, 'polyfills/http/index.js'),
      // https: path.resolve(__dirname, 'polyfills/https/index.js'),
      // child_process: false,
      // dns: false,
      // fs: false,
      // net: false,
      // os: false,
      // tls: false,
      // vm: false,
      // zlib: false,
      // tty: path.resolve(__dirname, 'polyfills/tty.js'),
      // module: false,
      // querystring: require.resolve('querystring-es3'),
    },
  },
  optimization: {
    minimize: true,
  },
};

module.exports = {
  ...baseConfig,
  ...generateConfig(),
};
