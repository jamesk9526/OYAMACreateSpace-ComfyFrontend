// Serial app checks against prevalidated graphs. Every child helper reuses known prompts.
const { spawnSync } = require('node:child_process');
const reopen = process.argv.includes('--reopen');
for (const native of [false, true]) {
  for (const route of [
    'h3-text',
    'h3-image',
    'h3-reference',
    'continue-last',
    'continue-selected',
    'continue-motion',
  ]) {
    const args = [
      'scripts/h3-preview-live-smoke.cjs',
      `--route=${route}`,
      `--steps=${native ? 12 : 6}`,
      '--routed',
    ];
    if (native) args.push('--native');
    if (route === 'h3-reference') args.push('--maximum-identity');
    if (reopen) args.push('--packaged', '--reuse-complete');
    console.log(
      `VERIFY ${route} ${native ? 'Native' : 'Turbo'} ${reopen ? 'packaged restart' : 'live'}`,
    );
    const result = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) process.exit(result.status || 1);
    if (route === 'continue-motion') {
      const latent = spawnSync(
        process.execPath,
        [...args, '--latent-context', '--job-scoped-context'],
        { stdio: 'inherit', windowsHide: true },
      );
      if (latent.status !== 0) process.exit(latent.status || 1);
    }
  }
}
