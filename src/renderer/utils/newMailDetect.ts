import type { EmailItem } from '@/types/email';

/**
 * Quais e-mails de uma sincronização merecem aviso de "novo e-mail".
 *
 * Só avisa quando:
 *  - é um e-mail que o app ainda não tinha;
 *  - chegou na Caixa de Entrada e não está lido (lido em outro aparelho não avisa);
 *  - não foi enviado pela própria conta;
 *  - é recente (até 3 dias) — e-mails antigos recuperados pela sincronização não avisam;
 *  - a conta já tinha e-mails no app (na configuração inicial, o download de tudo não avisa).
 */
export const NEW_MAIL_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

const emailTimeMs = (e: EmailItem): number => {
  for (const v of [e.receivedDateStr, e.dateStr]) {
    if (!v) continue;
    const t = new Date(v).getTime();
    if (!isNaN(t)) return t;
  }
  return NaN;
};

export function pickNewArrivals(
  incoming: EmailItem[],
  existingIds: Set<string>,
  opts: { accountHadMail: boolean; accountEmail?: string; now?: number }
): EmailItem[] {
  if (!opts.accountHadMail) return [];
  const now = opts.now ?? Date.now();
  const own = (opts.accountEmail || '').trim().toLowerCase();
  return incoming.filter((m) => {
    if (existingIds.has(m.id)) return false;
    if (m.folder !== 'inbox' || m.isRead) return false;
    if (own && (m.senderEmail || '').trim().toLowerCase() === own) return false;
    const t = emailTimeMs(m);
    if (!isNaN(t) && now - t > NEW_MAIL_MAX_AGE_MS) return false;
    return true;
  });
}

/** Dados do aviso: um e-mail, ou um resumo de vários. */
export function buildNewMailNotice(list: EmailItem[]): {
  id: string;
  sender: string;
  senderEmail?: string;
  avatar?: string;
  subject: string;
  snippet?: string;
  count: number;
} | null {
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => (emailTimeMs(b) || 0) - (emailTimeMs(a) || 0));
  const latest = sorted[0];
  if (sorted.length === 1) {
    return {
      id: latest.id,
      sender: latest.sender || latest.senderEmail || 'Novo remetente',
      senderEmail: latest.senderEmail,
      avatar: latest.avatar,
      subject: latest.subject || '(Sem assunto)',
      snippet: latest.snippet,
      count: 1,
    };
  }
  const senders = Array.from(new Set(sorted.map((e) => e.sender || e.senderEmail).filter(Boolean)));
  const others = senders.length - 1;
  return {
    id: latest.id,
    sender: others > 0 ? `${senders[0]} e mais ${others} ${others === 1 ? 'remetente' : 'remetentes'}` : String(senders[0] || ''),
    senderEmail: latest.senderEmail,
    avatar: latest.avatar,
    subject: `Último: ${latest.subject || '(Sem assunto)'}`,
    snippet: `${sorted.length} novos e-mails na Caixa de Entrada`,
    count: sorted.length,
  };
}
