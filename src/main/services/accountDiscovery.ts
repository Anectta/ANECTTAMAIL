import dns from 'dns';
import net from 'net';
import tls from 'tls';

/**
 * Descoberta automática dos servidores de e-mail a partir do endereço.
 *
 * Ordem (para em quem responder primeiro):
 *  1. Lista interna de provedores conhecidos (instantâneo, sem rede).
 *  2. Base pública de configurações de provedores (consulta só o DOMÍNIO — nunca o e-mail).
 *  3. Configuração publicada pelo próprio domínio (autoconfig).
 *  4. Registro MX do domínio (ex.: domínio próprio hospedado no Google, Microsoft, Locaweb...).
 *  5. Teste dos endereços e portas mais comuns (imap./mail./smtp. + 993/143/465/587).
 *
 * Implementação própria do Anectta.
 */

export type Security = 'ssl' | 'starttls' | 'none';

export interface ServerSpec {
  protocol: 'imap' | 'pop3' | 'smtp';
  host: string;
  port: number;
  security: Security;
}

export interface DiscoveryResult {
  found: boolean;
  /** Como foi encontrado (para mostrar ao usuário). */
  source?: 'provedor-conhecido' | 'base-publica' | 'dominio' | 'registro-mx' | 'teste-de-portas';
  /** Provedor reconhecido (mesmos ids do assistente), quando houver. */
  providerId?: string;
  providerName?: string;
  incoming?: ServerSpec;
  outgoing?: ServerSpec;
  /** Login pelo navegador disponível (Google/Microsoft). */
  oauth?: 'google' | 'microsoft';
  /** O provedor exige senha de aplicativo quando não se usa login pelo navegador. */
  appPassword?: boolean;
  /** Linhas de diagnóstico (o que foi tentado). */
  trail: string[];
}

interface ProviderPreset {
  providerId: string;
  providerName: string;
  incoming: ServerSpec;
  outgoing: ServerSpec;
  oauth?: 'google' | 'microsoft';
  appPassword?: boolean;
}

const imap = (host: string, port = 993, security: Security = 'ssl'): ServerSpec => ({ protocol: 'imap', host, port, security });
const smtp = (host: string, port = 465, security: Security = 'ssl'): ServerSpec => ({ protocol: 'smtp', host, port, security });

const GMAIL: ProviderPreset = {
  providerId: 'gmail',
  providerName: 'Google (Gmail / Google Workspace)',
  incoming: imap('imap.gmail.com'),
  outgoing: smtp('smtp.gmail.com'),
  oauth: 'google',
  appPassword: true,
};
const MICROSOFT_PERSONAL: ProviderPreset = {
  providerId: 'outlook',
  providerName: 'Microsoft (Outlook.com / Hotmail)',
  incoming: imap('outlook.office365.com'),
  outgoing: smtp('smtp.office365.com', 587, 'starttls'),
  oauth: 'microsoft',
};
const MICROSOFT_365: ProviderPreset = {
  ...MICROSOFT_PERSONAL,
  providerId: 'm365',
  providerName: 'Microsoft 365',
};
const YAHOO: ProviderPreset = {
  providerId: 'yahoo',
  providerName: 'Yahoo',
  incoming: imap('imap.mail.yahoo.com'),
  outgoing: smtp('smtp.mail.yahoo.com'),
  appPassword: true,
};
const ICLOUD: ProviderPreset = {
  providerId: 'icloud',
  providerName: 'iCloud',
  incoming: imap('imap.mail.me.com'),
  outgoing: smtp('smtp.mail.me.com', 587, 'starttls'),
  appPassword: true,
};
const AOL: ProviderPreset = {
  providerId: 'aol',
  providerName: 'AOL',
  incoming: imap('imap.aol.com'),
  outgoing: smtp('smtp.aol.com'),
  appPassword: true,
};
const LOCAWEB: ProviderPreset = {
  providerId: 'locaweb',
  providerName: 'Locaweb',
  incoming: imap('email-ssl.com.br'),
  outgoing: smtp('email-ssl.com.br'),
};
const ZOHO: ProviderPreset = {
  providerId: 'zoho',
  providerName: 'Zoho Mail',
  incoming: imap('imap.zoho.com'),
  outgoing: smtp('smtp.zoho.com'),
};

/** Domínios de e-mail gratuitos/conhecidos. */
const KNOWN_DOMAINS: Record<string, ProviderPreset> = {
  'gmail.com': GMAIL,
  'googlemail.com': GMAIL,
  'outlook.com': MICROSOFT_PERSONAL,
  'outlook.com.br': MICROSOFT_PERSONAL,
  'hotmail.com': MICROSOFT_PERSONAL,
  'hotmail.com.br': MICROSOFT_PERSONAL,
  'live.com': MICROSOFT_PERSONAL,
  'msn.com': MICROSOFT_PERSONAL,
  'yahoo.com': YAHOO,
  'yahoo.com.br': YAHOO,
  'ymail.com': YAHOO,
  'rocketmail.com': YAHOO,
  'icloud.com': ICLOUD,
  'me.com': ICLOUD,
  'mac.com': ICLOUD,
  'aol.com': AOL,
  'zoho.com': ZOHO,
  'uol.com.br': {
    providerId: 'uol',
    providerName: 'UOL',
    incoming: imap('imap.uol.com.br'),
    outgoing: smtp('smtps.uol.com.br', 587, 'starttls'),
  },
  'bol.com.br': {
    providerId: 'bol',
    providerName: 'BOL',
    incoming: imap('imap.bol.com.br'),
    outgoing: smtp('smtps.bol.com.br', 587, 'starttls'),
  },
  'terra.com.br': {
    providerId: 'terra',
    providerName: 'Terra',
    incoming: imap('imap.terra.com.br'),
    outgoing: smtp('smtp.terra.com.br', 587, 'starttls'),
  },
};

/** Servidores de MX conhecidos → configuração do provedor que hospeda o domínio. */
const MX_RULES: Array<{ test: RegExp; preset: (domain: string) => ProviderPreset }> = [
  { test: /(^|\.)google\.com$|(^|\.)googlemail\.com$/i, preset: () => GMAIL },
  { test: /\.mail\.protection\.outlook\.com$|(^|\.)outlook\.com$/i, preset: () => MICROSOFT_365 },
  { test: /(^|\.)locaweb\.com\.br$/i, preset: () => LOCAWEB },
  { test: /(^|\.)zoho\.(com|eu|in)$/i, preset: () => ZOHO },
  { test: /(^|\.)yahoodns\.net$/i, preset: () => YAHOO },
  {
    test: /(^|\.)titan\.email$/i,
    preset: () => ({
      providerId: 'titan',
      providerName: 'Titan Mail',
      incoming: imap('imap.titan.email'),
      outgoing: smtp('smtp.titan.email'),
    }),
  },
  {
    test: /(^|\.)hostinger\.(com|com\.br)$/i,
    preset: () => ({
      providerId: 'hostinger',
      providerName: 'Hostinger',
      incoming: imap('imap.hostinger.com'),
      outgoing: smtp('smtp.hostinger.com'),
    }),
  },
  {
    test: /(^|\.)secureserver\.net$/i,
    preset: () => ({
      providerId: 'godaddy',
      providerName: 'GoDaddy',
      incoming: imap('imap.secureserver.net'),
      outgoing: smtp('smtpout.secureserver.net'),
    }),
  },
];

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      }
    );
  });

/** Lê o XML de autoconfiguração (formato público usado por vários programas de e-mail). */
export function parseAutoconfigXml(xml: string, domain: string): { incoming?: ServerSpec; outgoing?: ServerSpec } {
  const fill = (s: string) => s.replace(/%EMAILDOMAIN%/gi, domain).trim();
  const block = (tag: string, type: string) => {
    const re = new RegExp(`<${tag}[^>]*type=["']${type}["'][^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
    const out: ServerSpec[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const body = m[1];
      const get = (name: string) => (body.match(new RegExp(`<${name}>([^<]*)</${name}>`, 'i')) || [])[1] || '';
      const host = fill(get('hostname'));
      const port = Number(get('port'));
      const socket = get('socketType').toUpperCase();
      if (!host || !port) continue;
      const security: Security = socket === 'SSL' ? 'ssl' : socket === 'STARTTLS' ? 'starttls' : 'none';
      out.push({ protocol: type === 'smtp' ? 'smtp' : (type as 'imap' | 'pop3'), host, port, security });
    }
    // Prefere criptografado: SSL, depois STARTTLS
    return out.sort((a, b) => (a.security === 'ssl' ? 0 : a.security === 'starttls' ? 1 : 2) - (b.security === 'ssl' ? 0 : b.security === 'starttls' ? 1 : 2));
  };
  const imaps = block('incomingServer', 'imap');
  const pops = block('incomingServer', 'pop3');
  const smtps = block('outgoingServer', 'smtp');
  return {
    incoming: imaps[0] || pops[0],
    outgoing: smtps[0],
  };
}

async function fetchText(url: string, ms = 5000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    clearTimeout(t);
    if (!res.ok) return null;
    const text = await res.text();
    return text.includes('clientConfig') ? text : null;
  } catch {
    return null;
  }
}

/**
 * Registros MX do domínio. Primeiro pelo DNS do sistema; se a rede bloquear consultas DNS diretas
 * (comum em redes corporativas), usa DNS sobre HTTPS (só o nome do domínio é enviado).
 */
async function lookupMx(domain: string): Promise<Array<{ exchange: string; priority: number }>> {
  const direct = await withTimeout(
    dns.promises.resolveMx(domain).then((r) => r.map((x) => ({ exchange: x.exchange, priority: x.priority }))),
    5000,
    null as Array<{ exchange: string; priority: number }> | null
  );
  if (direct && direct.length > 0) return direct;
  for (const url of [
    `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
  ]) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/dns-json' } });
      clearTimeout(t);
      if (!res.ok) continue;
      const data: any = await res.json();
      const answers = Array.isArray(data?.Answer) ? data.Answer.filter((a: any) => a?.type === 15) : [];
      if (answers.length === 0) return [];
      return answers
        .map((a: any) => {
          const [prio, host] = String(a.data || '').trim().split(/\s+/);
          return { priority: Number(prio) || 0, exchange: String(host || '').replace(/\.$/, '') };
        })
        .filter((x: any) => x.exchange);
    } catch {
      // tenta o próximo
    }
  }
  return direct || [];
}

/** Domínio "registrável" de um host do MX (ex.: aspmx.l.google.com → google.com). */
function baseDomainOf(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const twoLevelTlds = ['com.br', 'net.br', 'org.br', 'co.uk', 'com.au'];
  const lastTwo = parts.slice(-2).join('.');
  return twoLevelTlds.includes(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

/** Abre a porta e espera a saudação do servidor (sem fazer login). */
export function probe(spec: ServerSpec, ms = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean, sock?: net.Socket) => {
      if (done) return;
      done = true;
      try {
        sock?.destroy();
      } catch {}
      resolve(ok);
    };
    const expect = spec.protocol === 'smtp' ? /^220/ : spec.protocol === 'pop3' ? /^\+OK/ : /^\* (OK|PREAUTH)/;
    const onData = (sock: net.Socket) => (buf: Buffer) => finish(expect.test(buf.toString('utf8')), sock);
    try {
      const sock =
        spec.security === 'ssl'
          ? tls.connect({ host: spec.host, port: spec.port, servername: spec.host, rejectUnauthorized: false })
          : net.connect({ host: spec.host, port: spec.port });
      sock.setTimeout(ms, () => finish(false, sock));
      sock.once('data', onData(sock));
      sock.once('error', () => finish(false, sock));
      sock.once('close', () => finish(false, sock));
    } catch {
      finish(false);
    }
  });
}

/** Testa candidatos em paralelo e devolve o primeiro (na ordem de preferência) que respondeu. */
async function firstReachable(candidates: ServerSpec[]): Promise<ServerSpec | undefined> {
  const results = await Promise.all(candidates.map((c) => probe(c)));
  return candidates.find((_, i) => results[i]);
}

export async function discoverMailSettings(emailAddress: string): Promise<DiscoveryResult> {
  const trail: string[] = [];
  const email = String(emailAddress || '').trim().toLowerCase();
  const domain = email.includes('@') ? email.split('@').pop()! : '';
  if (!domain || !domain.includes('.')) {
    return { found: false, trail: ['endereço de e-mail inválido'] };
  }

  const fromPreset = (p: ProviderPreset, source: DiscoveryResult['source']): DiscoveryResult => ({
    found: true,
    source,
    providerId: p.providerId,
    providerName: p.providerName,
    incoming: p.incoming,
    outgoing: p.outgoing,
    oauth: p.oauth,
    appPassword: p.appPassword,
    trail,
  });

  // 1. Provedor conhecido
  const known = KNOWN_DOMAINS[domain];
  if (known) {
    trail.push(`provedor conhecido: ${known.providerName}`);
    return fromPreset(known, 'provedor-conhecido');
  }

  // 2/3. Base pública e configuração do próprio domínio (em paralelo; só o domínio é enviado)
  const [ispdb, domainCfg, domainWellKnown, mx] = await Promise.all([
    fetchText(`https://autoconfig.thunderbird.net/v1.1/${encodeURIComponent(domain)}`),
    fetchText(`https://autoconfig.${domain}/mail/config-v1.1.xml`),
    fetchText(`https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml`),
    lookupMx(domain),
  ]);

  for (const [xml, source, label] of [
    [ispdb, 'base-publica', 'base pública'],
    [domainCfg, 'dominio', 'configuração do domínio'],
    [domainWellKnown, 'dominio', 'configuração do domínio'],
  ] as const) {
    if (!xml) continue;
    const cfg = parseAutoconfigXml(xml, domain);
    if (cfg.incoming && cfg.outgoing) {
      trail.push(`encontrado na ${label}`);
      return { found: true, source, providerName: domain, incoming: cfg.incoming, outgoing: cfg.outgoing, trail };
    }
  }
  trail.push('sem configuração publicada para o domínio');

  // 4. Registro MX
  const mxHosts = (mx || []).sort((a, b) => a.priority - b.priority).map((r) => r.exchange.toLowerCase());
  if (mxHosts.length > 0) {
    trail.push(`MX do domínio: ${mxHosts[0]}`);
    for (const host of mxHosts) {
      const rule = MX_RULES.find((r) => r.test.test(host.replace(/\.$/, '')));
      if (rule) {
        const preset = rule.preset(domain);
        trail.push(`domínio hospedado em ${preset.providerName}`);
        return fromPreset(preset, 'registro-mx');
      }
    }
    // Base pública pelo domínio do provedor do MX (ex.: hospedagens que atendem vários domínios)
    const mxBase = baseDomainOf(mxHosts[0]);
    if (mxBase && mxBase !== domain) {
      const xml = await fetchText(`https://autoconfig.thunderbird.net/v1.1/${encodeURIComponent(mxBase)}`);
      if (xml) {
        const cfg = parseAutoconfigXml(xml, domain);
        if (cfg.incoming && cfg.outgoing) {
          trail.push(`encontrado pela hospedagem do domínio (${mxBase})`);
          return { found: true, source: 'registro-mx', providerName: mxBase, incoming: cfg.incoming, outgoing: cfg.outgoing, trail };
        }
      }
    }
  } else {
    trail.push('domínio sem registro MX');
  }

  // 5. Teste dos endereços e portas mais comuns
  const incomingCandidates: ServerSpec[] = [
    imap(`imap.${domain}`, 993, 'ssl'),
    imap(`mail.${domain}`, 993, 'ssl'),
    imap(domain, 993, 'ssl'),
    imap(`imap.${domain}`, 143, 'starttls'),
    imap(`mail.${domain}`, 143, 'starttls'),
    { protocol: 'pop3', host: `pop.${domain}`, port: 995, security: 'ssl' },
    { protocol: 'pop3', host: `mail.${domain}`, port: 995, security: 'ssl' },
  ];
  const outgoingCandidates: ServerSpec[] = [
    smtp(`smtp.${domain}`, 465, 'ssl'),
    smtp(`mail.${domain}`, 465, 'ssl'),
    smtp(`smtp.${domain}`, 587, 'starttls'),
    smtp(`mail.${domain}`, 587, 'starttls'),
    smtp(domain, 465, 'ssl'),
    smtp(domain, 587, 'starttls'),
  ];
  const [incoming, outgoing] = await Promise.all([firstReachable(incomingCandidates), firstReachable(outgoingCandidates)]);
  if (incoming && outgoing) {
    trail.push(`servidores responderam: ${incoming.host}:${incoming.port} e ${outgoing.host}:${outgoing.port}`);
    return { found: true, source: 'teste-de-portas', providerName: domain, incoming, outgoing, trail };
  }
  trail.push('nenhum servidor comum respondeu');
  return {
    found: false,
    incoming,
    outgoing,
    trail,
  };
}
