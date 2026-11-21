/* eslint-disable @typescript-eslint/no-var-requires */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Localiza o signtool.exe no cache do electron-builder ou no Windows SDK.
 */
function findSignTool() {
  if (process.env.WIN_SIGNTOOL_PATH && fs.existsSync(process.env.WIN_SIGNTOOL_PATH)) {
    return process.env.WIN_SIGNTOOL_PATH;
  }

  const candidates = [];

  // 1. Cache do electron-builder (winCodeSign)
  const localAppData = process.env.LOCALAPPDATA || '';
  const winCodeSignDir = path.join(localAppData, 'electron-builder', 'Cache', 'winCodeSign');
  if (fs.existsSync(winCodeSignDir)) {
    try {
      const subdirs = fs.readdirSync(winCodeSignDir);
      for (const sub of subdirs) {
        candidates.push(path.join(winCodeSignDir, sub, 'windows-10', 'x64', 'signtool.exe'));
        candidates.push(path.join(winCodeSignDir, sub, 'windows-10', 'ia32', 'signtool.exe'));
      }
    } catch {
      // ignore
    }
  }

  // 2. Windows 10/11 SDK padrão
  const sdkBin = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
  if (fs.existsSync(sdkBin)) {
    try {
      const versions = fs.readdirSync(sdkBin).sort().reverse();
      for (const ver of versions) {
        candidates.push(path.join(sdkBin, ver, 'x64', 'signtool.exe'));
      }
    } catch {
      // ignore
    }
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'signtool.exe';
}

/**
 * Carrega variáveis de ambiente opcionais de `.env.signing` na raiz do projeto (nunca commitado).
 */
function loadLocalSigningEnv() {
  const envFile = path.resolve(__dirname, '..', '.env.signing');
  if (!fs.existsSync(envFile)) return;
  try {
    const lines = fs.readFileSync(envFile, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Hook customizado de assinatura digital Windows (Authenticode SHA-256 + RFC 3161 Timestamp)
 * invocado automaticamente pelo electron-builder (`build.win.sign`).
 *
 * Modos suportados:
 *  1) Certificado .pfx / .p12 (caminho de arquivo ou base64) via CSC_LINK + CSC_KEY_PASSWORD
 *  2) Token USB EV / Windows Certificate Store via WIN_CERT_SHA1 ou WIN_CERT_SUBJECT_NAME
 */
exports.default = async function signWindows(configuration) {
  loadLocalSigningEnv();

  const filePath = configuration.path;
  const cscLink = (process.env.CSC_LINK || '').trim();
  const cscPassword = process.env.CSC_KEY_PASSWORD || '';
  const certSha1 = (process.env.WIN_CERT_SHA1 || '').trim();
  const certSubject = (process.env.WIN_CERT_SUBJECT_NAME || '').trim();
  const timestampUrl =
    (process.env.WIN_TIMESTAMP_URL || '').trim() || 'http://timestamp.digicert.com';
  const requireSigning = process.env.REQUIRE_CODE_SIGNING === 'true';

  if (!cscLink && !certSha1 && !certSubject) {
    if (requireSigning) {
      throw new Error(
        '[CODE SIGNING] REQUIRE_CODE_SIGNING=true, mas nenhuma credencial (CSC_LINK, WIN_CERT_SHA1 ou WIN_CERT_SUBJECT_NAME) foi configurada.'
      );
    }
    console.log(
      `  • [sign-windows] Assinatura pulada (nenhum certificado configurado) -> ${path.basename(filePath)}`
    );
    return;
  }

  const signtool = findSignTool();
  const args = ['sign', '/fd', 'SHA256', '/tr', timestampUrl, '/td', 'SHA256'];

  let tempPfxPath = null;
  try {
    if (cscLink) {
      let pfxFile = cscLink;
      if (!fs.existsSync(cscLink)) {
        // Trata CSC_LINK como Base64 (padrão GitHub Actions / CI)
        tempPfxPath = path.join(os.tmpdir(), `anectta-sign-${process.pid}-${Date.now()}.pfx`);
        fs.writeFileSync(tempPfxPath, Buffer.from(cscLink, 'base64'));
        pfxFile = tempPfxPath;
      }
      args.push('/f', pfxFile);
      if (cscPassword) {
        args.push('/p', cscPassword);
      }
    } else if (certSha1) {
      // Token USB EV / Repositório de Certificados do Windows por Thumbprint SHA-1
      args.push('/sha1', certSha1);
    } else if (certSubject) {
      // Repositório de Certificados do Windows por Subject Name
      args.push('/n', certSubject);
    }

    args.push('/d', 'Anectta MAIL', '/du', 'https://anectta.com', filePath);

    console.log(`  • [sign-windows] Assinando ${path.basename(filePath)} com SHA-256 + RFC 3161...`);
    execFileSync(signtool, args, { stdio: 'inherit' });
  } finally {
    if (tempPfxPath && fs.existsSync(tempPfxPath)) {
      try {
        fs.unlinkSync(tempPfxPath);
      } catch {
        // ignore
      }
    }
  }
};
