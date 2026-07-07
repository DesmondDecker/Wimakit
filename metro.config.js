const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...config.resolver.extraNodeModules,
    tslib: path.resolve(__dirname, 'node_modules/tslib/tslib.js'),
  },
  resolverMainFields: ['react-native', 'main', 'browser'],
  sourceExts: [...(config.resolver.sourceExts || []), 'mjs'],
  // Fix for Windows "node:sea" invalid character error - disable package exports to prevent metro from creating invalid directories
  unstable_enablePackageExports: false,
  // Aggressively block sea modules from the crawler and resolver
  blockList: [
    /.*\.expo\/.*\/node:sea.*/,
    /node_modules\/.*\/node:sea.*/,
    /node_modules\/(.*\/)?(node:sea|sea|node%3Asea)/
  ],
  // Superior aliasing for platform-specific modules in Expo 53+
  resolveRequest: (context, moduleName, platform) => {
    // If bundling for web explicitly, redirect native-only modules to a safe placeholder.
    if (platform === 'web' && (
      moduleName.startsWith('react-native-webview') ||
      moduleName.startsWith('react-native-maps')
    )) {
      return {
        type: 'sourceFile',
        filePath: path.resolve(__dirname, 'node_modules/react-native-web/dist/index.js'),
      };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

config.watchFolders = Array.from(new Set([...(config.watchFolders || []), path.resolve(__dirname)]));

// Additional safeguard for request URLs
config.server = {
  ...config.server,
  rewriteRequestUrl: (url) => {
    if (!url) return url;
    return (url.includes('node:sea') || url.includes('%3Asea') || url.includes('<anonymous>')) ? '/_error' : url;
  },
};

// Disable server-side rendering during development to prevent instability and crashes.
config.transformer.unstable_allowRequireContext = true;

module.exports = config;