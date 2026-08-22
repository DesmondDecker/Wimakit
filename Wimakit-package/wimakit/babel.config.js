﻿﻿module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated v4 (SDK 54) split its worklets Babel transform
    // out into a separate package (react-native-worklets) that no longer ships
    // bundled inside reanimated itself. babel-preset-expo does NOT include this
    // automatically. This MUST be last in the plugins array per the reanimated
    // v4 migration guide.
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'], // The root of your source code
          alias: { '@': '.' }, // Maps '@/' to the project root
        },
      ],
      'react-native-worklets/plugin', // Must be last
    ],
  };
};
