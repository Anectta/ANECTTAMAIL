/**
 * Segurança de anexos: tipos que não abrem direto, programas disfarçados (pelos primeiros bytes
 * do arquivo, não pela extensão) e a marca "veio da internet" (Mark of the Web).
 */
import fs from 'fs';
import path from 'path';

/** Extensões que nunca abrem direto pelo e-mail (programas, scripts e imagens de disco). */
export const BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.msi', '.msp', '.lnk', '.vbs', '.vbe',
  '.js', '.jse', '.wsf', '.wsh', '.ps1', '.psm1', '.reg', '.hta', '.cpl', '.jar', '.dll',
  '.appx', '.msix', '.application', '.gadget', '.url',
  // Imagens de disco: podem esconder programas e "montar" um drive com um clique
  '.iso', '.img', '.vhd', '.vhdx',
]);

/** Extensões em que é normal o arquivo ser um programa (aí não é "disfarce"). */
const EXECUTABLE_EXTENSIONS = new Set(['.exe', '.dll', '.com', '.scr', '.sys', '.cpl', '.ocx', '.efi', '.msi', '.drv']);

export type ExecutableKind = 'windows' | 'linux' | 'mac';

/** Reconhece programas pelos primeiros bytes (assinatura do formato). */
export function detectExecutableSignature(head: Uint8Array): ExecutableKind | null {
  if (head.length >= 2 && head[0] === 0x4d && head[1] === 0x5a) return 'windows'; // "MZ"
  if (head.length >= 4 && head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) return 'linux'; // ELF
  if (head.length >= 4) {
    const be = ((head[0] << 24) | (head[1] << 16) | (head[2] << 8) | head[3]) >>> 0;
    const le = ((head[3] << 24) | (head[2] << 16) | (head[1] << 8) | head[0]) >>> 0;
    const MACHO = [0xfeedface, 0xfeedfacf, 0xcafebabe];
    if (MACHO.includes(be) || MACHO.includes(le)) return 'mac';
  }
  return null;
}

/** Um arquivo que diz ser documento/imagem, mas é um programa? */
export function isDisguisedExecutable(fileName: string, head: Uint8Array): ExecutableKind | null {
  const kind = detectExecutableSignature(head);
  if (!kind) return null;
  const ext = path.extname(fileName || '').toLowerCase();
  return EXECUTABLE_EXTENSIONS.has(ext) ? null : kind;
}

export function readFileHead(filePath: string, bytes = 16): Uint8Array {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

/** Conteúdo da marca "veio da internet" (zona 3 = Internet). */
export function zoneIdentifierContent(): string {
  return '[ZoneTransfer]\r\nZoneId=3\r\n';
}

/**
 * Grava a marca "veio da internet" (fluxo alternativo :Zone.Identifier do NTFS). Com ela o
 * Windows avisa antes de executar e o Office abre o arquivo em Modo Protegido.
 * Em outros sistemas (ou discos sem NTFS) não faz nada.
 */
export function applyMarkOfTheWeb(filePath: string): boolean {
  if (process.platform !== 'win32') return false;
  try {
    fs.writeFileSync(`${filePath}:Zone.Identifier`, zoneIdentifierContent());
    return true;
  } catch {
    return false;
  }
}
