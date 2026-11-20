import { EmailItem, EmailTemplateItem, TriageCategory } from '@/types/email';

export interface ParsedUnsubscribeInfo {
  httpUrl?: string;
  mailto?: string;
  mailtoSubject?: string;
  supportsOneClickPost: boolean;
}

/**
 * Extracts List-Unsubscribe targets (https/http and mailto) from header or body fallback.
 */
export function parseUnsubscribeInfo(email: EmailItem): ParsedUnsubscribeInfo | null {
  const raw = email.listUnsubscribe || '';
  let httpUrl: string | undefined;
  let mailto: string | undefined;
  let mailtoSubject: string | undefined;

  if (raw) {
    const matches = raw.match(/<([^>]+)>/g) || raw.split(',').map((s) => s.trim());
    for (const entry of matches) {
      const cleaned = entry.replace(/^<|>$/g, '').trim();
      if (/^https?:\/\//i.test(cleaned) && !httpUrl) {
        httpUrl = cleaned;
      } else if (/^mailto:/i.test(cleaned) && !mailto) {
        const withoutScheme = cleaned.slice(7);
        const [addr, query] = withoutScheme.split('?');
        mailto = addr.trim();
        if (query) {
          const params = new URLSearchParams(query);
          mailtoSubject = params.get('subject') || undefined;
        }
      }
    }
  }

  // Fallback: detect unsubscribe link inside HTML body when header is absent
  if (!httpUrl && !mailto && email.bodyHtml) {
    const linkRegex = /<a\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(email.bodyHtml)) !== null) {
      const url = m[1];
      const text = m[2].replace(/<[^>]+>/g, '').trim().toLowerCase();
      if (
        /unsubscribe|descadastrar|cancelar\s+inscri|remover\s+da\s+lista|opt[\s-]?out|gerenciar\s+prefer/i.test(
          text
        ) ||
        /unsubscribe|optout|descadastr/i.test(url)
      ) {
        httpUrl = url.replace(/&amp;/g, '&');
        break;
      }
    }
  }

  if (!httpUrl && !mailto) return null;

  const supportsOneClickPost = Boolean(
    httpUrl &&
      email.listUnsubscribePost &&
      /list-unsubscribe=one-click/i.test(email.listUnsubscribePost)
  );

  return {
    httpUrl,
    mailto,
    mailtoSubject,
    supportsOneClickPost,
  };
}

const NOTIFICATION_SENDER_PATTERNS = [
  /^no-?reply@/i,
  /^nao-?responda@/i,
  /^notific(acao|ation|ations)@/i,
  /^alerts?@/i,
  /^system@/i,
  /^automated@/i,
  /^support@/i,
  /^security@/i,
  /^billing@/i,
  /^financeiro@/i,
  /@notifications\./i,
  /@github\.com$/i,
  /@gitlab\.com$/i,
  /@jira\./i,
  /@trello\.com$/i,
  /@slack\.com$/i,
];

const NOTIFICATION_SUBJECT_PATTERNS = [
  /\bc[oó]digo de verifica[cç][aã]o\b/i,
  /\bverification code\b/i,
  /\blogin\b|\bsenha\b|\bpassword\b|\b2fa\b|\botp\b/i,
  /\bnota fiscal\b|\bnf-?e\b|\bboleto\b|\bfatura\b|\brecibo\b|\binvoice\b|\bpayment\b/i,
  /\bpedido\b|\bentrega\b|\brastreio\b|\border\b|\bshipping\b/i,
  /\balerta\b|\bnotifica[cç][aã]o\b|\bconfirma[cç][aã]o\b/i,
];

const NEWSLETTER_PATTERNS = [
  /newsletter/i,
  /digest/i,
  /boletim/i,
  /novidades/i,
  /promo[cç][aã]o/i,
  /oferta/i,
  /desconto/i,
  /webinar/i,
  /marketing@/i,
  /news@/i,
  /mkt@/i,
];

/**
 * Classifies an email into a Smart Triage category:
 * - 'snoozed' if currently snoozed
 * - 'newsletters' if bulk/list-unsubscribe/newsletter signals are present
 * - 'notifications' if automated/no-reply/transactional alerts
 * - 'priority' otherwise (human / direct / important / starred / calendar invite)
 */
export function classifyEmailTriage(email: EmailItem): Exclude<TriageCategory, 'all'> {
  if (email.snoozedUntil && email.snoozedUntil > Date.now()) {
    return 'snoozed';
  }
  if (email.isImportant || email.isStarred || email.priority === 'high' || email.calendarInvite) {
    return 'priority';
  }

  const senderEmail = (email.senderEmail || '').toLowerCase();
  const subject = (email.subject || '').toLowerCase();
  const precedence = (email.precedence || '').toLowerCase();

  const isNotification =
    NOTIFICATION_SENDER_PATTERNS.some((re) => re.test(senderEmail)) ||
    NOTIFICATION_SUBJECT_PATTERNS.some((re) => re.test(subject));

  const hasListHeader = Boolean(email.listUnsubscribe || email.listId || precedence === 'bulk' || precedence === 'list');
  const looksLikeNewsletter =
    NEWSLETTER_PATTERNS.some((re) => re.test(senderEmail) || re.test(subject));

  if (hasListHeader && !isNotification) {
    return 'newsletters';
  }
  if (looksLikeNewsletter) {
    return 'newsletters';
  }
  if (isNotification) {
    return 'notifications';
  }

  return 'priority';
}

export const TEMPLATES_STORAGE_KEY = 'anectta_email_templates_v1';

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplateItem[] = [
  {
    id: 'tpl-followup',
    name: 'Follow-up comercial',
    category: 'Comercial',
    subject: 'Retorno sobre nossa proposta — {{empresa}}',
    body: 'Olá {{nome}},\n\nPassando para confirmar se você teve a oportunidade de avaliar nossa proposta para a {{empresa}}.\n\nCaso precise de algum ajuste ou queira agendar uma conversa rápida, estou à disposição.\n\nAbraços,',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tpl-reuniao',
    name: 'Convite para reunião',
    category: 'Agenda',
    subject: 'Agendamento de alinhamento — {{data}}',
    body: 'Olá {{nome}},\n\nGostaria de agendar uma breve reunião de alinhamento com você.\n\nVocê teria disponibilidade no dia {{data}}? Se preferir outro horário, pode me sugerir o que ficar melhor.\n\nAtenciosamente,',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tpl-recebimento',
    name: 'Confirmação de recebimento',
    category: 'Atendimento',
    subject: 'Recebemos sua solicitação',
    body: 'Olá {{nome}},\n\nConfirmamos o recebimento da sua mensagem em {{data}}. Nossa equipe já está analisando e retornará em breve com os próximos passos.\n\nObrigado pelo contato!',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tpl-cobranca',
    name: 'Envio de fatura / documento',
    category: 'Financeiro',
    subject: 'Envio de documento — {{empresa}}',
    body: 'Prezado(a) {{nome}},\n\nSegue em anexo o documento referente à {{empresa}}.\n\nPor gentileza, confirme o recebimento. Em caso de dúvidas, fico à disposição.\n\nAtenciosamente,',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export function loadEmailTemplates(): EmailTemplateItem[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fallback
  }
  return DEFAULT_EMAIL_TEMPLATES;
}

export function saveEmailTemplates(templates: EmailTemplateItem[]): void {
  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // ignore
  }
}

export function applyTemplateVariables(
  text: string,
  vars: { nome?: string; empresa?: string; data?: string; email?: string }
): string {
  const todayStr = new Date().toLocaleDateString('pt-BR');
  return text
    .replace(/\{\{\s*nome\s*\}\}/gi, vars.nome?.trim() || 'Prezado(a)')
    .replace(/\{\{\s*empresa\s*\}\}/gi, vars.empresa?.trim() || 'sua empresa')
    .replace(/\{\{\s*data\s*\}\}/gi, vars.data?.trim() || todayStr)
    .replace(/\{\{\s*email\s*\}\}/gi, vars.email?.trim() || '');
}

export type AiComposeAction = 'generate' | 'formal' | 'friendly' | 'shorter' | 'polish';

/**
 * Local smart writing assistant for the email composer (works 100% offline with zero external dependencies).
 */
export function composeAssistLocal(params: {
  action: AiComposeAction;
  currentText: string;
  subject?: string;
  recipient?: string;
  prompt?: string;
}): { text: string; suggestedSubject?: string } {
  const raw = (params.currentText || '').trim();
  const recipientFirst = (() => {
    const r = (params.recipient || '').split(/[,;]/)[0]?.trim() || '';
    if (!r) return '';
    const nameMatch = r.match(/^([^<@]+)/);
    const cleaned = (nameMatch ? nameMatch[1] : r.split('@')[0]).replace(/["']/g, '').trim();
    const first = cleaned.split(/[\s._-]+/)[0] || '';
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
  })();

  if (params.action === 'generate') {
    const topic = (params.prompt || params.subject || 'alinhamento').trim();
    const greeting = recipientFirst ? `Olá ${recipientFirst},` : 'Olá,';
    return {
      suggestedSubject: params.subject?.trim()
        ? undefined
        : topic.charAt(0).toUpperCase() + topic.slice(1),
      text: `${greeting}\n\nEspero que esteja bem.\n\nEntro em contato para tratar sobre ${topic}. Gostaria de alinhar os próximos passos e confirmar sua disponibilidade para avançarmos.\n\nFico à disposição caso precise de qualquer informação adicional.\n\nAtenciosamente,`,
    };
  }

  if (!raw) {
    return {
      text: recipientFirst
        ? `Olá ${recipientFirst},\n\nSegue mensagem conforme combinado.\n\nAtenciosamente,`
        : 'Olá,\n\nSegue mensagem conforme combinado.\n\nAtenciosamente,',
    };
  }

  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (params.action === 'shorter') {
    const kept = lines.slice(0, Math.min(3, lines.length));
    const core = kept
      .map((l) => (l.length > 160 ? `${l.slice(0, 157).trim()}...` : l))
      .join('\n\n');
    return {
      text: `${recipientFirst ? `Olá ${recipientFirst},\n\n` : ''}${core}\n\nFico no aguardo.`,
    };
  }

  if (params.action === 'formal') {
    const body = raw
      .replace(/\b(oi|olá|e aí|fala)\b/gi, 'Prezado(a)')
      .replace(/\b(valeu|obg|brigad[oa])\b/gi, 'Agradeço antecipadamente')
      .replace(/\b(blz|beleza|ok|show)\b/gi, 'De acordo')
      .replace(/\b(vc|você)\b/gi, 'Vossa Senhoria')
      .replace(/\b(tá|ta)\b/gi, 'está');
    const hasGreeting = /^(prezad|car[oa]|estimad|bom dia|boa tarde|boa noite)/i.test(body);
    const hasClosing = /(atenciosamente|cordialmente|respeitosamente)/i.test(body);
    return {
      text: `${hasGreeting ? '' : `Prezado(a)${recipientFirst ? ` ${recipientFirst}` : ''},\n\n`}${body}${
        hasClosing ? '' : '\n\nAtenciosamente,'
      }`,
    };
  }

  if (params.action === 'friendly') {
    const body = raw
      .replace(/prezado\(a\)|prezado|prezada/gi, 'Olá')
      .replace(/vossa senhoria/gi, 'você')
      .replace(/respeitosamente|cordialmente/gi, 'Um grande abraço');
    const hasGreeting = /^(olá|oi|bom dia|boa tarde|boa noite)/i.test(body);
    const hasClosing = /(abraço|obrigad|até breve)/i.test(body);
    return {
      text: `${hasGreeting ? '' : `Olá${recipientFirst ? ` ${recipientFirst}` : ''}, tudo bem?\n\n`}${body}${
        hasClosing ? '' : '\n\nQualquer dúvida, estou por aqui. Um abraço!'
      }`,
    };
  }

  // 'polish'
  const polishedParagraphs = raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => {
      const t = p.replace(/\s+/g, ' ').trim();
      if (!t) return '';
      const capitalized = t.charAt(0).toUpperCase() + t.slice(1);
      return /[.!?:,]$/.test(capitalized) ? capitalized : `${capitalized}.`;
    })
    .filter(Boolean);
  const hasGreeting = /^(olá|oi|prezad|bom dia|boa tarde|boa noite|car[oa])/i.test(
    polishedParagraphs[0] || ''
  );
  const hasClosing = /(atenciosamente|abraço|cordialmente|obrigad)/i.test(
    polishedParagraphs[polishedParagraphs.length - 1] || ''
  );
  return {
    text: `${hasGreeting ? '' : `Olá${recipientFirst ? ` ${recipientFirst}` : ''},\n\n`}${polishedParagraphs.join('\n\n')}${
      hasClosing ? '' : '\n\nAtenciosamente,'
    }`,
  };
}
