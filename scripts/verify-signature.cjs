/* eslint-disable @typescript-eslint/no-var-requires */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));
const targets = [
  path.resolve(__dirname, '..', 'release', `Anectta MAIL Setup ${pkg.version}.exe`),
  path.resolve(__dirname, '..', 'release', 'win-unpacked', 'Anectta MAIL.exe'),
];

console.log(`\n=== Verificação de Assinatura Digital Windows (Anectta MAIL v${pkg.version}) ===\n`);

for (const file of targets) {
  if (!fs.existsSync(file)) {
    console.log(`[AUSENTE] ${file}`);
    continue;
  }
  const psCmd = `$s = Get-AuthenticodeSignature -FilePath '${file.replace(/'/g, "''")}'; Write-Output ("Status: " + $s.Status + " | Signer: " + ($s.SignerCertificate.Subject) + " | Timestamp: " + ($s.TimeStamperCertificate.Subject))`;
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', psCmd], {
      encoding: 'utf-8',
    }).trim();
    console.log(`${path.basename(file)}\n  -> ${out}\n`);
  } catch (err) {
    console.error(`Erro ao verificar ${file}:`, err.message);
  }
}
