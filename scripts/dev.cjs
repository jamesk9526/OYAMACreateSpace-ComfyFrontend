const { spawn } = require('node:child_process');
const path = require('node:path');
process.chdir(path.resolve(__dirname, '..'));
require('./version.cjs').writeVersion();
const env = { ...process.env, OYAMA_MOCK: process.argv.includes('--mock') ? '1' : '0' };
delete env.ELECTRON_RUN_AS_NODE;
const bin = path.join(
  path.dirname(require.resolve('electron-vite/package.json')),
  'bin/electron-vite.js',
);
const child = spawn(process.execPath, [bin, 'dev'], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code || 0));
