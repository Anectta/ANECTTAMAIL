/**
 * Astro Respostas Inteligentes — categoria do e-mail (regras fixas, sem IA).
 */
export type AstroCategory =
  | 'pedido_informacao'
  | 'agendamento'
  | 'cobranca_pagamento'
  | 'confirmacao'
  | 'agradecimento'
  | 'suporte'
  | 'comercial'
  | 'automatico'
  | 'outro';

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const RULES: Array<{ cat: AstroCategory; re: RegExp }> = [
  { cat: 'cobranca_pagamento', re: /\b(boleto|fatura|cobranca|pagamento|pagar|nota fiscal|nf-?e|pix|vencimento|segunda via|2a via|reembolso|comprovante)\b/ },
  { cat: 'comercial', re: /\b(proposta|orcamento|cotacao|preco|precos|valores|desconto|contratar|contratacao|plano|licencas?)\b/ },
  { cat: 'agendamento', re: /\b(reuniao|agendar|agenda|marcar|remarcar|horario disponivel|disponibilidade|call|videoconferencia|visita)\b/ },
  { cat: 'suporte', re: /\b(erro|problema|nao funciona|nao consigo|travou|falha|bug|suporte|ajuda|acesso negado|senha)\b/ },
  { cat: 'confirmacao', re: /\b(confirmar|confirmacao|confirma|de acordo|esta confirmado|ok\?)\b/ },
  { cat: 'agradecimento', re: /^(muito )?(obrigad[oa]|agradeco|valeu|grat[oa])\b/ },
];

/** Classifica pelo assunto e pelo texto limpo do e-mail. */
export function categorizeEmail(subject: string, text: string): AstroCategory {
  const s = plain(`${subject || ''}\n${text || ''}`);
  const body = plain(text || '').trim();
  // Agradecimento curto ("Obrigado pelo retorno!") — só quando o e-mail é breve
  if (body.split(/\s+/).length <= 25 && RULES[RULES.length - 1].re.test(body)) return 'agradecimento';
  for (const r of RULES.slice(0, -1)) if (r.re.test(s)) return r.cat;
  if (/\?|\b(qual|quais|quando|como|onde|quanto|gostaria de saber|poderia informar|duvida)\b/.test(s)) return 'pedido_informacao';
  return 'outro';
}
