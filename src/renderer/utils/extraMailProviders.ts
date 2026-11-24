/**
 * Provedores do botão "Mais provedores" no assistente de conta.
 *
 * Os servidores de algumas hospedagens dependem do domínio do cliente (ex.: mail.suaempresa.com.br);
 * nesses casos o formulário mostra os servidores preenchidos e editáveis, e o teste da conta confirma.
 * Ícones: selos com iniciais e cores próprias do Anectta (sem logotipos de marcas).
 */
import type { MailSecurity } from './mailServerDefaults';

export interface ServerPreset {
  host: string;
  port: number;
  security: MailSecurity;
}

export interface ExtraMailProvider {
  id: 'bol' | 'zoho' | 'titan' | 'hostinger' | 'godaddy' | 'kinghost' | 'hostgator' | 'gmx';
  name: string;
  /** Texto do selo (2–3 letras). */
  badge: string;
  color: string;
  /** Hospedagem de domínio próprio (e-mail do tipo voce@suaempresa.com.br). */
  hosting: boolean;
  placeholder: string;
  /** Palavras para a busca. */
  keywords: string;
  incoming: (domain: string) => ServerPreset;
  outgoing: (domain: string) => ServerPreset;
}

const fixed = (host: string, port: number, security: MailSecurity) => () => ({ host, port, security });

export const EXTRA_MAIL_PROVIDERS: ExtraMailProvider[] = [
  {
    id: 'bol',
    name: 'BOL',
    badge: 'BOL',
    color: '#e8590c',
    hosting: false,
    placeholder: 'seuemail@bol.com.br',
    keywords: 'bol brasil online',
    incoming: fixed('imap.bol.com.br', 993, 'ssl'),
    outgoing: fixed('smtps.bol.com.br', 587, 'starttls'),
  },
  {
    id: 'zoho',
    name: 'Zoho Mail',
    badge: 'Z',
    color: '#c92a2a',
    hosting: false,
    placeholder: 'voce@zohomail.com ou voce@suaempresa.com.br',
    keywords: 'zoho mail',
    incoming: fixed('imap.zoho.com', 993, 'ssl'),
    outgoing: fixed('smtp.zoho.com', 465, 'ssl'),
  },
  {
    id: 'titan',
    name: 'Titan Mail',
    badge: 'TI',
    color: '#1864ab',
    hosting: true,
    placeholder: 'voce@suaempresa.com.br',
    keywords: 'titan email hospedagem',
    incoming: fixed('imap.titan.email', 993, 'ssl'),
    outgoing: fixed('smtp.titan.email', 465, 'ssl'),
  },
  {
    id: 'hostinger',
    name: 'Hostinger',
    badge: 'HO',
    color: '#5f3dc4',
    hosting: true,
    placeholder: 'voce@suaempresa.com.br',
    keywords: 'hostinger hospedagem',
    incoming: fixed('imap.hostinger.com', 993, 'ssl'),
    outgoing: fixed('smtp.hostinger.com', 465, 'ssl'),
  },
  {
    id: 'godaddy',
    name: 'GoDaddy',
    badge: 'GD',
    color: '#087f5b',
    hosting: true,
    placeholder: 'voce@suaempresa.com.br',
    keywords: 'godaddy secureserver hospedagem',
    incoming: fixed('imap.secureserver.net', 993, 'ssl'),
    outgoing: fixed('smtpout.secureserver.net', 465, 'ssl'),
  },
  {
    id: 'kinghost',
    name: 'KingHost',
    badge: 'KH',
    color: '#1971c2',
    hosting: true,
    placeholder: 'voce@suaempresa.com.br',
    keywords: 'kinghost king host hospedagem',
    incoming: (d) => ({ host: `imap.${d}`, port: 993, security: 'ssl' }),
    outgoing: (d) => ({ host: `smtp.${d}`, port: 587, security: 'starttls' }),
  },
  {
    id: 'hostgator',
    name: 'HostGator',
    badge: 'HG',
    color: '#0b7285',
    hosting: true,
    placeholder: 'voce@suaempresa.com.br',
    keywords: 'hostgator host gator hospedagem cpanel',
    incoming: (d) => ({ host: `mail.${d}`, port: 993, security: 'ssl' }),
    outgoing: (d) => ({ host: `mail.${d}`, port: 465, security: 'ssl' }),
  },
  {
    id: 'gmx',
    name: 'GMX',
    badge: 'GMX',
    color: '#364fc7',
    hosting: false,
    placeholder: 'seuemail@gmx.com',
    keywords: 'gmx',
    // gmx.com usa *.gmx.com; gmx.de/.net/.at usam *.gmx.net
    incoming: (d) => ({ host: /gmx\.com$/i.test(d) || !d ? 'imap.gmx.com' : 'imap.gmx.net', port: 993, security: 'ssl' }),
    outgoing: (d) => ({ host: /gmx\.com$/i.test(d) || !d ? 'mail.gmx.com' : 'mail.gmx.net', port: 465, security: 'ssl' }),
  },
];

export const findExtraProvider = (id?: string | null) => EXTRA_MAIL_PROVIDERS.find((p) => p.id === id);

/** Busca por nome/palavras, ignorando acentos e maiúsculas. */
export function searchExtraProviders(query: string): ExtraMailProvider[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(query.trim());
  if (!q) return EXTRA_MAIL_PROVIDERS;
  return EXTRA_MAIL_PROVIDERS.filter((p) => norm(`${p.name} ${p.keywords}`).includes(q));
}

/** Domínio do e-mail (ou "seudominio.com.br" enquanto o usuário não digitou). */
export const domainOf = (email: string) => {
  const d = (email.split('@')[1] || '').trim().toLowerCase();
  return d.includes('.') ? d : '';
};
