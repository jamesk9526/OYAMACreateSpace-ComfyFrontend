const { spawnSync } = require('node:child_process');
const { writeVersion } = require('./version.cjs');
const path = require('node:path');
process.chdir(path.resolve(__dirname, '..'));
function run(pkg, bin, args) {
  const file = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), bin);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status || 1);
}
async function main() {
  if (process.argv.includes('--package'))
    await require('./fetch-media-tools.cjs').prepareMediaTools();
  const version = writeVersion();
  run('typescript', 'bin/tsc', ['--noEmit']);
  run('electron-vite', 'bin/electron-vite.js', ['build']);
  if (process.argv.includes('--package')) {
    run('@playwright/test', 'cli.js', ['test']);
    run('electron-builder', 'cli.js', [
      '--win',
      'nsis',
      '--x64',
      '--publish',
      'never',
      // Reuse the locked dependency's Windows runtime. Avoid a second archive extraction
      // whose staging-directory rename can fail under Windows file scanning.
      ...(process.platform === 'win32' && process.arch === 'x64'
        ? [
            `--config.electronDist=${path.join(path.dirname(require.resolve('electron/package.json')), 'dist')}`,
          ]
        : []),
      `--config.buildVersion=${version.windowsVersion}`,
      `--config.extraMetadata.version=${version.version}`,
      `--config.artifactName=OYAMA-CreateSpace-${version.version}-Setup.exe`,
    ]);
  }
  console.log(
    `Built ${version.version}${process.argv.includes('--package') ? ' — installer in release/' : ''}`,
  );
  if (process.argv.includes('--package'))
    console.log(
      `Installer: ${path.resolve('release', `OYAMA-CreateSpace-${version.version}-Setup.exe`)}`,
    );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
