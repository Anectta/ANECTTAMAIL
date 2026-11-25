/**
 * Bloqueio do Anectta com PIN (opcional, desligado por padrão).
 *
 * O PIN, o código de recuperação e o código do gestor NÃO são guardados: só o hash
 * (PBKDF2-SHA256 com sal aleatório). O código do celular segue o padrão TOTP (RFC 6238),
 * compatível com Google Authenticator, Microsoft Authenticator, Authy etc.
 *
 * Saídas se esquecer o PIN: (1) código do celular, (2) código de recuperação,
 * (3) senha de uma das contas de e-mail (conferida no servidor), (4) liberação pelo gestor.
 *
 * Importante: é uma trava de tela — protege contra quem usa o computador na sua ausência;
 * não criptografa os arquivos do disco.
 */

export interface SecretHash {
  hash: string;
  salt: string;
  iterations: number;
}

export interface AppLockConfig {
  enabled: boolean;
  pin?: SecretHash;
  /** Minutos parado até bloquear (0 = só ao abrir o app e no "Bloquear agora"). */
  idleMinutes: number;
  recovery?: SecretHash;
  /** Segredo TOTP (base32) do celular vinculado. */
  totpSecret?: string;
  managerEmail?: string;
  managerCode?: SecretHash & { expiresAt: number };
  /** Horários dos últimos pedidos ao gestor (limite por hora). */
  managerRequests?: number[];
}

export const DEFAULT_APP_LOCK: AppLockConfig = { enabled: false, idleMinutes: 15 };
const STORAGE_KEY = 'anectta_app_lock_v1';
export const APP_LOCK_EVENT = 'anectta:app-lock-changed';
const ITERATIONS = 150_000;
export const MANAGER_CODE_MINUTES = 15;
export const MANAGER_MAX_PER_HOUR = 3;

// ---------------------------------------------------------------- armazenamento

export function loadAppLock(): AppLockConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APP_LOCK };
    const v = JSON.parse(raw);
    return { ...DEFAULT_APP_LOCK, ...v, enabled: Boolean(v?.enabled && v?.pin?.hash) };
  } catch {
    return { ...DEFAULT_APP_LOCK };
  }
}

export function saveAppLock(cfg: AppLockConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // sem armazenamento disponível
  }
  try {
    window.dispatchEvent(new Event(APP_LOCK_EVENT));
  } catch {
    // fora do navegador (testes)
  }
}

// ---------------------------------------------------------------- utilitários

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string): Uint8Array<ArrayBuffer> => new Uint8Array((h.match(/.{2}/g) || []).map((x) => parseInt(x, 16)));

/** Comparação em tempo constante (não revela onde o valor diverge). */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await subtle().importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

export async function hashSecret(secret: string, iterations = ITERATIONS): Promise<SecretHash> {
  const salt = randomBytes(16);
  return { hash: await pbkdf2(secret, salt, iterations), salt: toHex(salt), iterations };
}

export async function verifySecret(secret: string, rec: SecretHash | undefined): Promise<boolean> {
  if (!rec?.hash || !rec.salt) return false;
  const h = await pbkdf2(secret, fromHex(rec.salt), rec.iterations || ITERATIONS);
  return sameString(h, rec.hash);
}

/** PIN: 4 a 8 dígitos, ou senha de 6+ caracteres. */
export function validatePin(pin: string): string | null {
  if (/^\d+$/.test(pin)) return pin.length >= 4 && pin.length <= 8 ? null : 'O PIN deve ter de 4 a 8 dígitos.';
  return pin.length >= 6 ? null : 'A senha deve ter pelo menos 6 caracteres (ou use um PIN de 4 a 8 dígitos).';
}

// ---------------------------------------------------------------- código de recuperação

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I

export function generateRecoveryCode(): string {
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** Aceita o código com ou sem traços/espaços, maiúsculo ou minúsculo. */
export function normalizeRecoveryCode(input: string): string {
  const c = (input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 12 ? `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}` : c;
}

// ---------------------------------------------------------------- TOTP (celular)

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const clean = (input || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Código TOTP de 6 dígitos para o instante (em segundos) informado. */
export async function totpAt(secretBase32: string, unixSeconds: number, period = 30): Promise<string> {
  const counter = Math.floor(unixSeconds / period);
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i -= 1) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const key = await subtle().importKey('raw', base32Decode(secretBase32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await subtle().sign('HMAC', key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/** Aceita o código atual e o vizinho (±30 s), para tolerar relógios levemente diferentes. */
export async function verifyTotp(secretBase32: string, code: string, nowMs = Date.now()): Promise<boolean> {
  const clean = (code || '').replace(/\D/g, '');
  if (clean.length !== 6 || !secretBase32) return false;
  const now = Math.floor(nowMs / 1000);
  for (const delta of [0, -30, 30]) {
    if (sameString(await totpAt(secretBase32, now + delta), clean)) return true;
  }
  return false;
}

export function otpauthUri(secretBase32: string, accountLabel: string): string {
  const issuer = 'Anectta MAIL';
  const label = encodeURIComponent(`${issuer}:${accountLabel || 'bloqueio'}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ---------------------------------------------------------------- código do gestor

export function generateManagerCode(): string {
  const b = randomBytes(4);
  const n = ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3];
  return String(n % 100_000_000).padStart(8, '0');
}

/** Pode pedir mais um código ao gestor agora? (máximo por hora). */
export function canRequestManager(cfg: AppLockConfig, nowMs = Date.now()): { ok: boolean; waitMinutes: number } {
  const recent = (cfg.managerRequests || []).filter((t) => nowMs - t < 3_600_000).sort((a, b) => a - b);
  if (recent.length < MANAGER_MAX_PER_HOUR) return { ok: true, waitMinutes: 0 };
  return { ok: false, waitMinutes: Math.ceil((recent[0] + 3_600_000 - nowMs) / 60_000) };
}

// ---------------------------------------------------------------- tentativas erradas

const ATTEMPTS_KEY = 'anectta_app_lock_attempts_v1';

export interface AttemptState {
  fails: number;
  lockedUntil: number;
}

export function loadAttempts(): AttemptState {
  try {
    const v = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '{}');
    return { fails: Number(v.fails) || 0, lockedUntil: Number(v.lockedUntil) || 0 };
  } catch {
    return { fails: 0, lockedUntil: 0 };
  }
}

export function saveAttempts(a: AttemptState): void {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a));
  } catch {
    // ignore
  }
}

/** Depois de 5 erros, espera 30 s; a cada nova série de 5 erros, a espera dobra (máx. 15 min). */
export function registerFailure(a: AttemptState, nowMs = Date.now()): AttemptState {
  const fails = a.fails + 1;
  if (fails % 5 !== 0) return { fails, lockedUntil: a.lockedUntil };
  const round = fails / 5;
  const wait = Math.min(15 * 60_000, 30_000 * 2 ** (round - 1));
  return { fails, lockedUntil: nowMs + wait };
}
