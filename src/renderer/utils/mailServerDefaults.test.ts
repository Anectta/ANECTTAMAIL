import { describe, it, expect } from 'vitest';
import {
  defaultPort,
  portAfterSecurityChange,
  portAfterProtocolChange,
  securityPortWarning,
} from './mailServerDefaults';

describe('portas padrão', () => {
  it('IMAP, POP3 e SMTP conforme a segurança', () => {
    expect(defaultPort('imap', 'ssl')).toBe(993);
    expect(defaultPort('imap', 'starttls')).toBe(143);
    expect(defaultPort('pop3', 'ssl')).toBe(995);
    expect(defaultPort('pop3', 'starttls')).toBe(110);
    expect(defaultPort('smtp', 'ssl')).toBe(465);
    expect(defaultPort('smtp', 'starttls')).toBe(587);
    expect(defaultPort('smtp', 'none')).toBe(25);
  });

  it('trocar a segurança ajusta portas padrão, mas mantém porta personalizada', () => {
    expect(portAfterSecurityChange('smtp', 'starttls', 465)).toBe(587);
    expect(portAfterSecurityChange('imap', 'starttls', 993)).toBe(143);
    expect(portAfterSecurityChange('imap', 'ssl', '')).toBe(993);
    expect(portAfterSecurityChange('smtp', 'starttls', 2525)).toBe(2525);
  });

  it('trocar IMAP ↔ POP3 converte a porta equivalente', () => {
    expect(portAfterProtocolChange('pop3', 'ssl', 993)).toBe(995);
    expect(portAfterProtocolChange('imap', 'starttls', 110)).toBe(143);
    expect(portAfterProtocolChange('pop3', 'ssl', 7993)).toBe(7993);
  });
});

describe('avisos de porta × segurança', () => {
  it('combinações erradas', () => {
    expect(securityPortWarning('smtp', 'starttls', 465)).toMatch(/SSL\/TLS direto/);
    expect(securityPortWarning('smtp', 'ssl', 587)).toMatch(/STARTTLS/);
    expect(securityPortWarning('imap', 'starttls', 993)).toMatch(/SSL\/TLS direto/);
    expect(securityPortWarning('imap', 'ssl', 143)).toMatch(/STARTTLS/);
  });

  it('combinações certas: sem aviso', () => {
    expect(securityPortWarning('imap', 'ssl', 993)).toBeNull();
    expect(securityPortWarning('smtp', 'starttls', 587)).toBeNull();
    expect(securityPortWarning('pop3', 'ssl', 995)).toBeNull();
    expect(securityPortWarning('smtp', 'ssl', 2525)).toBeNull();
  });

  it('sem segurança: alerta', () => {
    expect(securityPortWarning('imap', 'none', 143)).toMatch(/sem proteção/);
  });
});
