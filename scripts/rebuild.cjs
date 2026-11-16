const { rebuild } = require('@electron/rebuild');
const path = require('path');
const electronPkg = require('electron/package.json');

const electronVersion = electronPkg.version || '33.2.1';
const buildPath = path.resolve(__dirname, '..');

console.log(`[REBUILD] Reconstruindo dependências nativas para Electron v${electronVersion} (arch: ${process.arch})...`);

rebuild({
  buildPath,
  electronVersion,
  arch: process.arch,
  force: true,
})
  .then(() => {
    console.log('[REBUILD] ✓ Dependências nativas reconstruídas com sucesso!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[REBUILD] ❌ Erro ao reconstruir:', err);
    process.exit(1);
  });
