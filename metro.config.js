const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

// .ts/.tsx를 .js/.jsx보다 먼저 로드하도록 우선순위 변경
// 이렇게 하면 같은 이름의 .js와 .ts가 공존해도 항상 .ts가 로드됨
const sourceExts = defaultConfig.resolver.sourceExts;
const tsFirst = [
  ...sourceExts.filter(ext => ext.startsWith('ts')),
  ...sourceExts.filter(ext => !ext.startsWith('ts')),
];

const config = {
  resolver: {
    sourceExts: tsFirst,
  },
};

module.exports = mergeConfig(defaultConfig, config);
