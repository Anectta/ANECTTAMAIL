import { describe, it, expect } from 'vitest';
import { EXTRA_MAIL_PROVIDERS, findExtraProvider, searchExtraProviders, domainOf } from './extraMailProviders';

describe('Mais provedores', () => {
  it('tem os 8 provedores combinados', () => {
    expect(EXTRA_MAIL_PROVIDERS.map((p) => p.id)).toEqual([
      'bol', 'zoho', 'titan', 'hostinger', 'godaddy', 'kinghost', 'hostgator', 'gmx',
    ]);
  });

  it('busca por nome, sem acento e sem maiúsculas', () => {
    expect(searchExtraProviders('host').map((p) => p.id)).toEqual(['hostinger', 'kinghost', 'hostgator']);
    expect(searchExtraProviders('HOSPEDAGEM').length).toBe(5);
    expect(searchExtraProviders('').length).toBe(8);
    expect(searchExtraProviders('xyz')).toEqual([]);
  });

  it('servidores pelo domínio do cliente (hospedagens)', () => {
    const hg = findExtraProvider('hostgator')!;
    expect(hg.incoming('suaempresa.com.br')).toEqual({ host: 'mail.suaempresa.com.br', port: 993, security: 'ssl' });
    expect(hg.outgoing('suaempresa.com.br').port).toBe(465);
    const kh = findExtraProvider('kinghost')!;
    expect(kh.outgoing('x.com.br')).toEqual({ host: 'smtp.x.com.br', port: 587, security: 'starttls' });
  });

  it('GMX: .com usa gmx.com; .de/.net usam gmx.net', () => {
    const g = findExtraProvider('gmx')!;
    expect(g.incoming('gmx.com').host).toBe('imap.gmx.com');
    expect(g.incoming('gmx.de').host).toBe('imap.gmx.net');
  });

  it('domínio do e-mail', () => {
    expect(domainOf('Voce@SuaEmpresa.com.br')).toBe('suaempresa.com.br');
    expect(domainOf('incompleto@')).toBe('');
  });
});
