// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// This is the standard solution for a common issue where Metro bundles
// Node.js-specific modules for a client-side app. The `socket.io-client`
// library uses the `debug` package, which has different entry points for
// Node.js and the browser. Metro sometimes incorrectly resolves the Node.js
// version, which attempts to import the 'tty' module, causing a build failure.
//
// By adding this alias, we explicitly tell Metro to always use the
// browser-safe version of the `debug` library, resolving the error.
//
// We also add the `@` alias here to match tsconfig.json and babel.config.js,
// ensuring Metro can resolve absolute imports from the project root.
config.resolver.alias = {
  ...config.resolver.alias,
  'debug': 'debug/src/browser',
  '@': path.resolve(__dirname),
};

// Required for Metro to resolve source files from the project root.
config.watchFolders = [__dirname];

module.exports = config;