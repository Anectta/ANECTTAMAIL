/**
 * Escudo Anectta — detecção de golpes (phishing), feita no computador, sem IA externa.
 *
 * Procura sinais conhecidos de golpe por e-mail:
 *  - nome de banco/empresa conhecida vindo de um domínio que não é o oficial;
 *  - domínio que imita uma marca ("itau-seguranca.com");
 *  - link cujo texto mostra um site e leva a outro;
 *  - links para endereço numérico (IP), encurtadores ou domínios disfarçados (xn--);
 *  - pressão para agir ("sua conta será bloqueada", "confirme sua senha") junto com link;
 *  - anexo executável.
 *
 * Para evitar alarme falso, sinais fracos sozinhos não bastam: é preciso um sinal forte ou
 * a combinação de sinais.
 */
import { splitLinks } from './linkify';

export type PhishingLevel = 'none' | 'suspicious' | 'danger';

export interface PhishingReport {
  level: PhishingLevel;
  reasons: string[];
}

export interface PhishingSource {
  sender?: string;
  senderEmail?: string;
  subject?: string;
  body?: string;
  bodyHtml?: string;
  attachments?: Array<{ name: string }>;
  authResults?: { spf?: string; dkim?: string; dmarc?: string };
}

interface Brand {
  label: string;
  /** Como a marca aparece no nome do remetente/assunto (sem acentos, minúsculo). */
  name: RegExp;
  /** Pedaço que denuncia imitação quando aparece num domínio que não é oficial. */
  token?: string;
  /** Domínios oficiais (vale também qualquer subdomínio). */
  domains: string[];
}

const BRANDS: Brand[] = [
  { label: 'Banco do Brasil', name: /\bbanco do brasil\b/, domains: ['bb.com.br'] },
  { label: 'Itaú', name: /\bitau\b/, token: 'itau', domains: ['itau.com.br', 'itau.com', 'itauunibanco.com.br', 'itau-unibanco.com.br'] },
  { label: 'Bradesco', name: /\bbradesco\b/, token: 'bradesco', domains: ['bradesco.com.br', 'bradescoseguros.com.br', 'bradescard.com.br'] },
  { label: 'Santander', name: /\bsantander\b/, token: 'santander', domains: ['santander.com.br', 'santander.com'] },
  { label: 'Caixa', name: /\bcaixa (economica|federal)\b/, domains: ['caixa.gov.br'] },
  { label: 'Nubank', name: /\bnubank\b/, token: 'nubank', domains: ['nubank.com.br', 'nu.com.br'] },
  { label: 'Banco Inter', name: /\bbanco inter\b/, domains: ['bancointer.com.br', 'inter.co'] },
  { label: 'PicPay', name: /\bpicpay\b/, token: 'picpay', domains: ['picpay.com'] },
  { label: 'Mercado Pago', name: /\bmercado ?pago\b/, token: 'mercadopago', domains: ['mercadopago.com', 'mercadopago.com.br', 'mercadolivre.com', 'mercadolivre.com.br', 'mercadolibre.com'] },
  { label: 'Mercado Livre', name: /\bmercado ?livre\b/, token: 'mercadolivre', domains: ['mercadolivre.com', 'mercadolivre.com.br', 'mercadolibre.com', 'mercadopago.com', 'mercadopago.com.br'] },
  { label: 'PayPal', name: /\bpaypal\b/, token: 'paypal', domains: ['paypal.com', 'paypal.com.br'] },
  { label: 'Receita Federal', name: /\breceita federal\b/, domains: ['gov.br'] },
  { label: 'gov.br', name: /\bgov\.br\b/, domains: ['gov.br'] },
  { label: 'Detran', name: /\bdetran\b/, domains: ['gov.br'] },
  { label: 'Correios', name: /\bcorreios\b/, token: 'correios', domains: ['correios.com.br'] },
  { label: 'Serasa', name: /\bserasa\b/, token: 'serasa', domains: ['serasa.com.br', 'serasaexperian.com.br'] },
  { label: 'Netflix', name: /\bnetflix\b/, token: 'netflix', domains: ['netflix.com'] },
  { label: 'Microsoft', name: /\b(microsoft|office ?365)\b/, token: 'microsoft', domains: ['microsoft.com', 'microsoftonline.com', 'office.com', 'office365.com', 'microsoft365.com', 'outlook.com', 'live.com'] },
  { label: 'Google', name: /\bgoogle\b/, domains: ['google.com', 'google.com.br', 'gmail.com', 'googlemail.com', 'youtube.com'] },
  { label: 'Apple', name: /\b(apple|icloud)\b/, domains: ['apple.com', 'icloud.com', 'me.com'] },
  { label: 'Amazon', name: /\bamazon\b/, token: 'amazon', domains: ['amazon.com', 'amazon.com.br', 'amazon.de', 'amazonaws.com'] },
  { label: 'Magalu', name: /\b(magalu|magazine luiza)\b/, token: 'magalu', domains: ['magazineluiza.com.br', 'magalu.com', 'magalu.com.br'] },
];

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 'cutt.ly', 'is.gd', 'ow.ly', 'rb.gy', 'shorturl.at', 'encurtador.com.br',
  't.ly', 'tiny.cc', 'rebrand.ly', 'bl.ink', 'short.io', 'v.gd', 'qrco.de', 's.id',
]);

const DANGEROUS_EXT = /\.(exe|scr|bat|cmd|com|pif|vbs|vbe|js|jse|wsf|wsh|msi|hta|lnk|jar|ps1|iso|img|apk)$/i;

const URGENCY_RE =
  /(sua conta (sera|foi|esta) (bloquead|suspens|desativad|encerrad)|(acesso|cartao|conta|cpf) (bloquead|suspens)|confirm(e|ar) (sua |seus )?(senha|dados|identidade|cadastro)|atualiz(e|ar) (seus |os )?(dados|cadastro)|regulariz(e|ar)|ultimo aviso|evite (o )?bloqueio|pendencia (urgente|financeira)|token (expirad|vencid)|chave pix|clique (aqui )?(imediatamente|agora|urgente)|em ate 24 ?h|verify your account|account (suspended|locked)|confirm your password)/;

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: string) => stripAccents(s || '').toLowerCase();

/** Domínio "registrável" aproximado: exemplo.com.br, exemplo.com, exemplo.co.uk. */
export function baseDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const sld = parts[parts.length - 2];
  const tld = parts[parts.length - 1];
  const compound = tld.length === 2 && /^(com|net|org|gov|edu|co|art|blog|eco|app|dev|ind|inf|log|med|nom|tec|adv|eng|arq|jus|mil|ong)$/.test(sld);
  return parts.slice(compound ? -3 : -2).join('.');
}

function hostOf(url: string): string {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase();
  } catch {
    return '';
  }
}

const isOfficial = (host: string, domains: string[]) =>
  domains.some((d) => host === d || host.endsWith(`.${d}`));

const isIpHost = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');

interface LinkInfo {
  href: string;
  host: string;
  /** Domínio mostrado no texto do link, quando o texto parece um endereço. */
  shownHost?: string;
}

/** Links do e-mail (HTML: href + texto visível; texto simples: endereços escritos). */
export function extractLinks(src: Pick<PhishingSource, 'body' | 'bodyHtml'>): LinkInfo[] {
  const out: LinkInfo[] = [];
  if (src.bodyHtml && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(src.bodyHtml, 'text/html');
    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = (a.getAttribute('href') || '').trim();
      if (!/^https?:/i.test(href)) return;
      const text = (a.textContent || '').trim();
      const looksLikeUrl = /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(text);
      out.push({ href, host: hostOf(href), shownHost: looksLikeUrl ? hostOf(text) : undefined });
    });
  } else if (src.body) {
    for (const p of splitLinks(src.body)) {
      if (p.type === 'link' && /^https?:/i.test(p.href)) out.push({ href: p.href, host: hostOf(p.href) });
    }
  }
  return out;
}

/** Avalia um único link (usado também no aviso ao clicar). */
export function linkWarnings(href: string, shownText?: string): string[] {
  const host = hostOf(href);
  const reasons: string[] = [];
  if (!host) return reasons;
  if (isIpHost(host)) reasons.push(`O link leva a um endereço numérico (${host}), comum em golpes.`);
  if (SHORTENERS.has(host) || SHORTENERS.has(baseDomain(host))) {
    reasons.push(`O link usa um encurtador (${host}), que esconde o site de destino.`);
  }
  if (host.split('.').some((l) => l.startsWith('xn--'))) {
    reasons.push(`O endereço usa caracteres disfarçados (${host}), que podem imitar outro site.`);
  }
  if (shownText) {
    const looksLikeUrl = /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(shownText.trim());
    const shown = looksLikeUrl ? hostOf(shownText.trim()) : '';
    if (shown && baseDomain(shown) !== baseDomain(host)) {
      reasons.push(`O texto do link mostra "${shown}", mas ele leva a "${host}".`);
    }
  }
  for (const b of BRANDS) {
    if (b.token && host.includes(b.token) && !isOfficial(host, b.domains)) {
      reasons.push(`O endereço "${host}" imita ${b.label}, mas não é um site oficial.`);
      break;
    }
  }
  return reasons;
}

export function analyzePhishing(src: PhishingSource, trustedSenders?: Set<string>): PhishingReport {
  const senderEmail = (src.senderEmail || '').trim().toLowerCase();
  if (!senderEmail || trustedSenders?.has(senderEmail)) return { level: 'none', reasons: [] };
  const senderHost = senderEmail.split('@')[1] || '';
  const danger: string[] = [];
  const weak: string[] = [];

  // 1. Nome de marca conhecida vindo de domínio que não é o oficial
  const displayName = norm(src.sender || '');
  for (const b of BRANDS) {
    if (b.name.test(displayName) && !isOfficial(senderHost, b.domains)) {
      danger.push(`O remetente diz ser ${b.label}, mas o e-mail vem de "${senderHost}", que não é um endereço oficial.`);
      break;
    }
  }
  // 2. Domínio do remetente que imita uma marca
  for (const b of BRANDS) {
    if (b.token && senderHost.includes(b.token) && !isOfficial(senderHost, b.domains)) {
      danger.push(`O endereço do remetente (${senderHost}) imita ${b.label}.`);
      break;
    }
  }

  // 2b. Domínio do remetente disfarçado (Punycode ou letras de outro alfabeto)
  if (senderHost.split('.').some((l) => l.startsWith('xn--')) || /[^\x00-\x7f]/.test(senderHost)) {
    danger.push(`O endereço do remetente (${senderHost}) usa caracteres disfarçados, que podem imitar outro domínio.`);
  }

  // 3. Links
  const links = extractLinks(src);
  const seen = new Set<string>();
  for (const l of links) {
    if (l.shownHost && baseDomain(l.shownHost) !== baseDomain(l.host)) {
      const msg = `Um link mostra "${l.shownHost}", mas leva a "${l.host}".`;
      if (!seen.has(msg)) danger.push(msg);
      seen.add(msg);
    }
  }
  const weakLinkReasons = new Set<string>();
  for (const l of links) {
    if (!l.host) continue;
    if (isIpHost(l.host)) weakLinkReasons.add(`Há link para endereço numérico (${l.host}).`);
    else if (SHORTENERS.has(l.host) || SHORTENERS.has(baseDomain(l.host))) weakLinkReasons.add(`Há link encurtado (${l.host}), que esconde o destino.`);
    if (l.host.split('.').some((p) => p.startsWith('xn--'))) danger.push(`Um link usa endereço disfarçado (${l.host}).`);
    for (const b of BRANDS) {
      if (b.token && l.host.includes(b.token) && !isOfficial(l.host, b.domains)) {
        danger.push(`Um link leva a "${l.host}", que imita ${b.label}.`);
        break;
      }
    }
  }
  weak.push(...weakLinkReasons);

  // 4. Pressão para agir (só conta se houver link)
  const text = norm(`${src.subject || ''}\n${src.body || ''}\n${src.bodyHtml ? src.bodyHtml.replace(/<[^>]+>/g, ' ') : ''}`);
  const urgent = URGENCY_RE.test(text);
  if (urgent && links.length > 0) weak.push('O e-mail pressiona você a agir com urgência (bloqueio, senha, dados).');

  // 4b. O servidor não confirmou o remetente (SPF/DKIM/DMARC)
  if (authLevel(src.authResults) === 'fail') {
    weak.push('O servidor de e-mail não conseguiu confirmar que a mensagem veio mesmo desse remetente (SPF/DKIM/DMARC).');
  }

  // 5. Anexo executável
  for (const a of src.attachments || []) {
    if (DANGEROUS_EXT.test(a.name || '')) {
      danger.push(`O anexo "${a.name}" é um programa executável, que pode instalar vírus.`);
      break;
    }
  }

  const reasons = [...new Set([...danger, ...weak])];
  if (danger.length > 0) return { level: 'danger', reasons };
  if (weak.length >= 2) return { level: 'suspicious', reasons };
  return { level: 'none', reasons: [] };
}

// ---- Remetentes marcados pelo usuário como "não é golpe"
const TRUSTED_KEY = 'anectta_phishing_trusted_v1';

export function loadPhishingTrusted(): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem(TRUSTED_KEY) || '[]');
    return new Set(Array.isArray(list) ? list.map((s) => String(s).toLowerCase()) : []);
  } catch {
    return new Set();
  }
}

export function savePhishingTrusted(set: Set<string>): void {
  try {
    localStorage.setItem(TRUSTED_KEY, JSON.stringify([...set].slice(-1000)));
  } catch {
    // sem armazenamento: só não lembra entre sessões
  }
}

// ---- Sites que o usuário escolheu abrir sem perguntar de novo
const LINK_TRUST_KEY = 'anectta_link_trusted_hosts_v1';

export function loadTrustedHosts(): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem(LINK_TRUST_KEY) || '[]');
    return new Set(Array.isArray(list) ? list.map((s) => String(s).toLowerCase()) : []);
  } catch {
    return new Set();
  }
}

export function saveTrustedHosts(set: Set<string>): void {
  try {
    localStorage.setItem(LINK_TRUST_KEY, JSON.stringify([...set].slice(-2000)));
  } catch {
    // sem armazenamento: só não lembra entre sessões
  }
}

export { hostOf };

// ---------------------------------------------------------------- autenticidade e "Responder para"

export type AuthLevel = 'verified' | 'fail' | 'unknown';

/**
 * Selo de autenticidade: "verified" quando o DMARC passou (ou SPF e DKIM passaram); "fail" quando
 * o DMARC falhou ou SPF e DKIM falharam juntos; "unknown" quando não há o carimbo.
 */
export function authLevel(r?: { spf?: string; dkim?: string; dmarc?: string }): AuthLevel {
  if (!r) return 'unknown';
  const bad = (v?: string) => Boolean(v && /^(fail|softfail|permerror|reject|quarantine)$/.test(v));
  if (r.dmarc === 'pass' || (r.spf === 'pass' && r.dkim === 'pass')) return 'verified';
  if (bad(r.dmarc) || (bad(r.spf) && (bad(r.dkim) || r.dkim === 'none' || !r.dkim))) return 'fail';
  return 'unknown';
}

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br', 'live.com',
  'msn.com', 'yahoo.com', 'yahoo.com.br', 'ymail.com', 'bol.com.br', 'uol.com.br', 'terra.com.br', 'ig.com.br',
  'icloud.com', 'me.com', 'aol.com', 'gmx.com', 'gmx.net', 'mail.com', 'proton.me', 'protonmail.com', 'zoho.com',
  'yandex.com', 'yandex.ru',
]);

export interface ReplyToRisk {
  /** none: igual ao remetente; info: diferente, mas comum (atendimento, newsletter); warn: suspeito */
  level: 'none' | 'info' | 'warn';
  replyTo?: string;
  reason?: string;
}

/** Avalia se o "Responder para" leva a um endereço suspeito, diferente de quem diz enviar. */
export function replyToRisk(src: { sender?: string; senderEmail?: string; replyTo?: string }): ReplyToRisk {
  const from = (src.senderEmail || '').trim().toLowerCase();
  const rt = (src.replyTo || '').trim().toLowerCase();
  if (!rt || !from || rt === from) return { level: 'none' };
  const fromHost = from.split('@')[1] || '';
  const rtHost = rt.split('@')[1] || '';
  if (baseDomain(fromHost) === baseDomain(rtHost)) return { level: 'none' };
  const name = norm(src.sender || '');
  const claimsBrand = BRANDS.some((b) => b.name.test(name));
  const disguised = rtHost.split('.').some((l) => l.startsWith('xn--')) || /[^\x00-\x7f]/.test(rtHost);
  const rtFree = FREE_MAIL.has(rtHost);
  const fromFree = FREE_MAIL.has(fromHost);
  if (disguised) return { level: 'warn', replyTo: rt, reason: 'O endereço de resposta usa caracteres disfarçados.' };
  if (claimsBrand) {
    return { level: 'warn', replyTo: rt, reason: 'O remetente diz ser uma empresa conhecida, mas as respostas vão para outro domínio.' };
  }
  if (rtFree && !fromFree) {
    return { level: 'warn', replyTo: rt, reason: 'O e-mail vem de uma empresa, mas as respostas vão para um e-mail gratuito.' };
  }
  return { level: 'info', replyTo: rt };
}
