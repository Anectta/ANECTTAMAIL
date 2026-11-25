import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  canRequestManager,
  generateManagerCode,
  generateRecoveryCode,
  hashSecret,
  normalizeRecoveryCode,
  registerFailure,
  totpAt,
  validatePin,
  verifySecret,
  verifyTotp,
} from './appLock';

describe('PIN e códigos guardados só como hash', () => {
  it('confere o certo e recusa o errado', async () => {
    const rec = await hashSecret('2468', 1000);
    expect(rec.hash).not.toContain('2468');
    expect(await verifySecret('2468', rec)).toBe(true);
    expect(await verifySecret('2469', rec)).toBe(false);
  });
  it('valida o formato do PIN', () => {
    expect(validatePin('123')).toMatch(/4 a 8/);
    expect(validatePin('1234')).toBeNull();
    expect(validatePin('senha')).toMatch(/6 caracteres/);
    expect(validatePin('minhasenha')).toBeNull();
  });
});

describe('código de recuperação', () => {
  it('formato XXXX-XXXX-XXXX e entrada flexível', () => {
    const c = generateRecoveryCode();
    expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normalizeRecoveryCode(c.toLowerCase().replace(/-/g, ' '))).toBe(c);
  });
});

describe('TOTP (celular)', () => {
  it('base32 (vetor da RFC 4648)', () => {
    expect(base32Encode(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI');
    expect(new TextDecoder().decode(base32Decode('MZXW6YTBOI'))).toBe('foobar');
  });
  it('vetor de teste da RFC 6238 (SHA-1, T=59s → 287082)', async () => {
    const secret = base32Encode(new TextEncoder().encode('12345678901234567890'));
    expect(await totpAt(secret, 59)).toBe('287082');
    expect(await totpAt(secret, 1111111109)).toBe('081804');
  });
  it('aceita o código atual e ±30 s', async () => {
    const secret = base32Encode(new TextEncoder().encode('12345678901234567890'));
    const now = 1_111_111_109_000;
    expect(await verifyTotp(secret, '081804', now)).toBe(true);
    expect(await verifyTotp(secret, '081 804', now + 30_000)).toBe(true);
    expect(await verifyTotp(secret, '000000', now)).toBe(false);
  });
});

describe('gestor e tentativas', () => {
  it('código do gestor com 8 dígitos e limite de 3 por hora', () => {
    expect(generateManagerCode()).toMatch(/^\d{8}$/);
    const now = 10_000_000;
    expect(canRequestManager({ enabled: true, idleMinutes: 5, managerRequests: [now - 1000, now - 2000] }, now).ok).toBe(true);
    const full = canRequestManager({ enabled: true, idleMinutes: 5, managerRequests: [now - 50 * 60_000, now - 1000, now - 2000] }, now);
    expect(full.ok).toBe(false);
    expect(full.waitMinutes).toBe(10);
  });
  it('espera cresce a cada 5 erros', () => {
    let a = { fails: 0, lockedUntil: 0 };
    for (let i = 0; i < 4; i += 1) a = registerFailure(a, 0);
    expect(a.lockedUntil).toBe(0);
    a = registerFailure(a, 0);
    expect(a.lockedUntil).toBe(30_000);
    for (let i = 0; i < 5; i += 1) a = registerFailure(a, 0);
    expect(a.lockedUntil).toBe(60_000);
  });
});
