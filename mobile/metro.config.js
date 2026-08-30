const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);

// The bundled pool-data snapshot lives at the repo root, outside this
// project root, so Metro must be told to watch it.
config.watchFolders = [repoRoot];
config.resolver.blockList = [
  new RegExp(path.join(repoRoot, 'node_modules') + '/.*'),
  new RegExp(path.join(repoRoot, '.venv') + '/.*'),
  new RegExp(path.join(repoRoot, 'dist') + '/.*'),
];

module.exports = config;
