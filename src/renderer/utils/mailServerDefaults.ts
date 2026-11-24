/**
 * Portas padrão e coerência entre porta e tipo de segurança (IMAP, POP3, SMTP).
 */
export type MailSecurity = 'ssl' | 'starttls' | 'none';
export type MailKind = 'imap' | 'pop3' | 'smtp';

export const SECURITY_LABELS: Record<MailSecurity, string> = {
  ssl: 'SSL/TLS',
  starttls: 'STARTTLS',
  none: 'Nenhuma (não recomendado)',
};

/** Porta padrão para o tipo de servidor e segurança escolhidos. */
export function defaultPort(kind: MailKind, security: MailSecurity): number {
  if (kind === 'imap') return security === 'ssl' ? 993 : 143;
  if (kind === 'pop3') return security === 'ssl' ? 995 : 110;
  return security === 'ssl' ? 465 : security === 'starttls' ? 587 : 25;
}

/** Portas "conhecidas" de cada tipo (trocar a segurança só ajusta a porta se ela for uma destas ou vazia). */
const STANDARD_PORTS: Record<MailKind, number[]> = {
  imap: [993, 143],
  pop3: [995, 110],
  smtp: [465, 587, 25],
};

/** Ao trocar a segurança: nova porta (ajusta só se a atual estiver vazia ou for uma porta padrão). */
export function portAfterSecurityChange(kind: MailKind, security: MailSecurity, currentPort: number | string): number | string {
  const p = Number(currentPort);
  if (!currentPort || !Number.isFinite(p) || STANDARD_PORTS[kind].includes(p)) return defaultPort(kind, security);
  return currentPort;
}

/** Ao trocar IMAP ↔ POP3: converte a porta padrão equivalente. */
export function portAfterProtocolChange(newKind: 'imap' | 'pop3', security: MailSecurity, currentPort: number | string): number | string {
  const p = Number(currentPort);
  const allStandard = [...STANDARD_PORTS.imap, ...STANDARD_PORTS.pop3];
  if (!currentPort || !Number.isFinite(p) || allStandard.includes(p)) return defaultPort(newKind, security);
  return currentPort;
}

/** Aviso quando porta e segurança não combinam (null = tudo certo). */
export function securityPortWarning(kind: MailKind, security: MailSecurity, port: number | string): string | null {
  const p = Number(port);
  if (!port || !Number.isFinite(p)) return null;
  const sslPorts = kind === 'imap' ? [993] : kind === 'pop3' ? [995] : [465];
  const plainPorts = kind === 'imap' ? [143] : kind === 'pop3' ? [110] : [587, 25];
  if (security === 'ssl' && plainPorts.includes(p)) {
    return `A porta ${p} normalmente usa ${kind === 'smtp' && p === 25 ? 'nenhuma segurança/STARTTLS' : 'STARTTLS'}, não SSL/TLS. Use a porta ${defaultPort(kind, 'ssl')} ou troque a segurança.`;
  }
  if (security !== 'ssl' && sslPorts.includes(p)) {
    return `A porta ${p} usa SSL/TLS direto. Troque a segurança para SSL/TLS ou use a porta ${defaultPort(kind, security)}.`;
  }
  if (security === 'none') {
    return 'Sem segurança, a senha e os e-mails trafegam sem proteção. Use apenas se o seu provedor exigir.';
  }
  return null;
}
