import { describe, expect, it } from 'vitest';
import { extractSecurityHeaders, parseAuthenticationResults } from './messageSecurity';
import { detectExecutableSignature, isDisguisedExecutable } from './attachmentSafety';

describe('Authentication-Results', () => {
  it('lê SPF, DKIM e DMARC (Gmail)', () => {
    const v =
      'Authentication-Results: mx.google.com;\r\n dkim=pass header.i=@itau.com.br header.s=s1;\r\n spf=pass (google.com: domain of x@itau.com.br) smtp.mailfrom=x@itau.com.br;\r\n dmarc=pass (p=REJECT) header.from=itau.com.br';
    expect(parseAuthenticationResults(v)).toEqual({ spf: 'pass', dkim: 'pass', dmarc: 'pass' });
  });

  it('falhas e várias assinaturas DKIM (uma válida basta)', () => {
    expect(parseAuthenticationResults('mx.x; spf=softfail; dkim=fail; dkim=pass; dmarc=fail')).toEqual({
      spf: 'softfail',
      dkim: 'pass',
      dmarc: 'fail',
    });
    expect(parseAuthenticationResults('mx.x; none')).toBeUndefined();
    expect(parseAuthenticationResults(undefined)).toBeUndefined();
  });

  it('usa só o cabeçalho do topo (os de baixo podem ser forjados) e lê o Reply-To', () => {
    const parsed = {
      headerLines: [
        { key: 'received', line: 'Received: from ...' },
        { key: 'authentication-results', line: 'Authentication-Results: mx.meuprovedor.com; spf=fail; dkim=none; dmarc=fail' },
        { key: 'authentication-results', line: 'Authentication-Results: forjado; spf=pass; dkim=pass; dmarc=pass' },
      ],
      replyTo: { value: [{ address: 'Golpista@Gmail.com', name: 'Itaú' }] },
    };
    expect(extractSecurityHeaders(parsed)).toEqual({
      authResults: { spf: 'fail', dkim: 'none', dmarc: 'fail' },
      replyTo: 'golpista@gmail.com',
    });
  });
});

describe('anexos disfarçados', () => {
  const MZ = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
  const ELF = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]);
  it('reconhece programas pelos primeiros bytes', () => {
    expect(detectExecutableSignature(MZ)).toBe('windows');
    expect(detectExecutableSignature(ELF)).toBe('linux');
    expect(detectExecutableSignature(PDF)).toBeNull();
  });
  it('"fatura.pdf" que é programa é disfarce; .exe de verdade não é', () => {
    expect(isDisguisedExecutable('fatura.pdf', MZ)).toBe('windows');
    expect(isDisguisedExecutable('foto.jpg', ELF)).toBe('linux');
    expect(isDisguisedExecutable('setup.exe', MZ)).toBeNull();
    expect(isDisguisedExecutable('fatura.pdf', PDF)).toBeNull();
  });
});
