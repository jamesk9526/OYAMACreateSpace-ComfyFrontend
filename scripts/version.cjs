const fs = require('node:fs');
const path = require('node:path');
function createVersion(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '.').slice(0, 15);
  const days = Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(2026, 0, 1)) /
      86400000,
  );
  const tick = Math.floor(
    (now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()) / 2,
  );
  return {
    version: `2.0.0+${stamp}`,
    stamp,
    builtAt: now.toISOString(),
    windowsVersion: `2.0.${days}.${tick}`,
  };
}
function writeVersion() {
  const value = createVersion();
  fs.mkdirSync(path.resolve('.generated'), { recursive: true });
  fs.writeFileSync('.generated/version.json', JSON.stringify(value, null, 2));
  return value;
}
module.exports = { createVersion, writeVersion };
