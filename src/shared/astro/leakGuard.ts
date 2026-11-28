/**
 * Astro Respostas Inteligentes — anti-vazamento de contexto.
 *
 * Uma resposta antiga (de outro cliente) não pode levar para a resposta nova dados que só
 * existiam naquela conversa: nomes, e-mails, links, telefones, valores, datas, CPF/CNPJ,
 * números de pedido/protocolo. Cada dado sensível da resposta antiga que NÃO aparece no
 * e-mail novo (nem na assinatura do próprio usuário) faz a frase inteira ser removida.
 * Se sobrar pouco do texto, a resposta é marcada como vazamento (revisão humana).
 */

export type SensitiveKind = 'email' | 'url' | 'telefone' | 'valor' | 'data' | 'documento' | 'numero' | 'nome';

export interface SensitiveItem {
  kind: SensitiveKind;
  value: string;
}

const PATTERNS: Array<{ kind: SensitiveKind; re: RegExp }> = [
  { kind: 'email', re: /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: 'url', re: /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi },
  { kind: 'documento', re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g },
  { kind: 'valor', re: /(?:R\$|US\$|\$|€)\s?\d[\d.,]*|\b\d[\d.]*,\d{2}\b/g },
  { kind: 'telefone', re: /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4}[-\s]?\d{4}\b/g },
  { kind: 'data', re: /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b/g },
  { kind: 'numero', re: /\b\d{4,}\b/g },
];

/** Palavras com inicial maiúscula que não são nomes de pessoas/empresas. */
const COMMON_CAPITALIZED = new Set(
  (
    'Olá Oi Bom Boa Prezado Prezada Caro Cara Att Abraço Abraços Obrigado Obrigada Atenciosamente Cordialmente ' +
    'Segue Seguem Sim Não Ok Por Para Pode Podemos Fico Fica Estou Estamos Vou Vamos Qualquer Assim Também Já ' +
    'Segunda Terça Quarta Quinta Sexta Sábado Domingo Janeiro Fevereiro Março Abril Maio Junho Julho Agosto ' +
    'Setembro Outubro Novembro Dezembro Hoje Amanhã Ontem PDF Pix PIX Brasil Sr Sra Dr Dra Equipe Time ' +
    'Atendimento Suporte Financeiro Comercial Vendas Empresa Cliente Clientes Você Vocês Eu Nós Favor Agradeço ' +
    'Desde Conforme Quanto Sobre Caso Quando Assim Infelizmente Felizmente Certo Claro Perfeito Combinado ' +
    'WhatsApp Teams Zoom Google Outlook Gmail Excel Word'
  ).split(/\s+/)
);

/** Nomes próprios: palavra com inicial maiúscula que não está no começo de frase nem é palavra comum. */
function extractNames(text: string): string[] {
  const out = new Set<string>();
  const re = /(^|[\s(,;:"'])([A-ZÀ-Ý][a-zà-ÿ]{2,}(?:\s+(?:de|da|do|dos|das|e)?\s*[A-ZÀ-Ý][a-zà-ÿ]{2,})*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index + m[1].length;
    const before = text.slice(Math.max(0, start - 3), start);
    const sentenceStart = start === 0 || /[.!?\n]\s*$/.test(before) || /^\s*$/.test(text.slice(0, start));
    let candidate = m[2];
    // No começo da frase, a 1ª palavra é maiúscula só pela posição — exceto "Ana, segue..."
    const followedByComma = text.charAt(start + candidate.length) === ',';
    if (sentenceStart && !followedByComma) {
      candidate = candidate.replace(/^\S+\s*/, '').replace(/^(de|da|do|dos|das|e)\s+/i, '');
    }
    const words = candidate.split(/\s+/).filter((w) => w && !/^(de|da|do|dos|das|e)$/i.test(w));
    if (words.length === 0 || words.every((w) => COMMON_CAPITALIZED.has(w))) continue;
    if (COMMON_CAPITALIZED.has(words[0]) && words.length === 1) continue;
    out.add(candidate);
  }
  return Array.from(out);
}

export function extractSensitive(text: string): SensitiveItem[] {
  const t = text || '';
  const out: SensitiveItem[] = [];
  const seen = new Set<string>();
  const add = (kind: SensitiveKind, value: string) => {
    const v = value.trim().replace(/[.,;:]+$/, '');
    const key = `${kind}:${v.toLowerCase()}`;
    if (v && !seen.has(key)) {
      seen.add(key);
      out.push({ kind, value: v });
    }
  };
  let rest = t;
  for (const { kind, re } of PATTERNS) {
    for (const m of rest.match(re) || []) {
      // "9h", "18h" e números de 1 a 3 dígitos não são sensíveis; o padrão "numero" pega 4+ dígitos
      add(kind, m);
    }
    rest = rest.replace(re, ' ');
  }
  for (const n of extractNames(rest)) add('nome', n);
  return out;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@./]/g, '');

export interface SanitizeResult {
  text: string;
  /** Dados removidos (para mostrar ao usuário o que o Astro tirou). */
  removed: SensitiveItem[];
  /** Sobrou pouco do texto: a resposta não deve ser usada sem revisão humana. */
  leak: boolean;
}

/**
 * Remove da resposta antiga as frases com dados que não existem no contexto novo.
 * @param answer resposta antiga (de outro cliente)
 * @param allowedContext texto do e-mail novo (assunto + corpo) e dados do próprio usuário (assinatura)
 */
export function sanitizeAnswer(answer: string, allowedContext: string): SanitizeResult {
  const allowed = norm(allowedContext || '');
  const sentences = (answer || '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const kept: string[] = [];
  const removed: SensitiveItem[] = [];
  for (const s of sentences) {
    const foreign = extractSensitive(s).filter((item) => {
      const v = norm(item.value);
      return v.length > 0 && !allowed.includes(v);
    });
    if (foreign.length === 0) kept.push(s);
    else removed.push(...foreign);
  }
  const text = kept.join(' ').replace(/\s+([.,!?])/g, '$1').trim();
  const keptWords = text.split(/\s+/).filter(Boolean).length;
  // Vazamento = sobrou menos da metade das frases (ou quase nada de texto)
  const leak = removed.length > 0 && (kept.length === 0 || kept.length < sentences.length * 0.5 || keptWords < 3);
  return { text, removed, leak };
}
