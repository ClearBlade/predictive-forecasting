module.exports = (api) => {
  // This caches the Babel config
  api.cache.using(() => `env=${process.env.NODE_ENV};isServer`);
  return {
    sourceType: 'unambiguous',
    presets: [
      '@babel/typescript',
      [
        '@babel/preset-env',
        {
          useBuiltIns: 'usage',
          corejs: '3.20',
        },
      ],
      [
        "@babel/preset-react", 
        {
          "runtime": "automatic"
        }
      ],
    ],
    plugins: [
      ['@babel/plugin-transform-runtime', 
      {
        "useESModules": true,
        "regenerator": false
      }],
    ],
    env: {
      test: {
        presets: [
          ["@babel/preset-env", {
            "targets": "current node"
          }]
        ]
      }
    }
  };
};
