/**
 * Cabeçalhos de segurança de um e-mail recebido.
 *
 * - Authentication-Results (RFC 8601): resultado de SPF, DKIM e DMARC gravado pelo SEU servidor
 *   de entrada. Só o cabeçalho do topo é confiável (os de baixo podem ter sido forjados por quem
 *   enviou), por isso só ele é lido.
 * - Reply-To: para onde a resposta vai de verdade (pode ser diferente do remetente).
 */

export interface AuthResults {
  spf?: string;
  dkim?: string;
  dmarc?: string;
}

const RESULT_RE = (name: string) => new RegExp(`(?:^|[\\s;])${name}\\s*=\\s*([a-z]+)`, 'gi');

/** Lê SPF/DKIM/DMARC do valor do cabeçalho Authentication-Results. */
export function parseAuthenticationResults(value: string | undefined): AuthResults | undefined {
  if (!value) return undefined;
  const v = value.replace(/^\s*authentication-results\s*:/i, '');
  const first = (name: string) => {
    const m = RESULT_RE(name).exec(v);
    return m ? m[1].toLowerCase() : undefined;
  };
  // Pode haver várias assinaturas DKIM: basta uma válida
  const dkimAll = [...v.matchAll(RESULT_RE('dkim'))].map((m) => m[1].toLowerCase());
  const dkim = dkimAll.includes('pass') ? 'pass' : dkimAll[0];
  const out: AuthResults = { spf: first('spf'), dkim, dmarc: first('dmarc') };
  return out.spf || out.dkim || out.dmarc ? out : undefined;
}

/** Extrai os cabeçalhos de segurança de uma mensagem já interpretada pelo mailparser. */
export function extractSecurityHeaders(parsed: any): { authResults?: AuthResults; replyTo?: string } {
  let authResults: AuthResults | undefined;
  try {
    const lines: Array<{ key?: string; line?: string }> = Array.isArray(parsed?.headerLines) ? parsed.headerLines : [];
    // headerLines vem na ordem da mensagem: o primeiro é o do topo (gravado pelo servidor de entrada)
    const top = lines.find((l) => String(l?.key || '').toLowerCase() === 'authentication-results');
    authResults = parseAuthenticationResults(top?.line);
  } catch {
    authResults = undefined;
  }
  let replyTo: string | undefined;
  try {
    const addr = parsed?.replyTo?.value?.[0]?.address;
    if (typeof addr === 'string' && addr.includes('@')) replyTo = addr.trim().toLowerCase();
  } catch {
    replyTo = undefined;
  }
  return { authResults, replyTo };
}
