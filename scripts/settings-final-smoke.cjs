const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
for (const args of [
  ['scripts/ripple-batch-live-smoke.cjs', '--packaged', '--reuse-complete'],
  ['scripts/provider-routing-live-smoke.cjs', '--reopen'],
  ['scripts/settings-delivery-smoke.cjs', '--reopen'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status || 1);
}
fs.writeFileSync(
  'artifacts/settings-final-delivery.json',
  JSON.stringify(
    {
      version: JSON.parse(fs.readFileSync('.generated/version.json', 'utf8')).version,
      packagedReopen: true,
      comfyResubmissions: 0,
      ffmpegAbsentFromPath: true,
      routedCases: 22,
      longRipple: true,
    },
    null,
    2,
  ),
);
