/**
 * Astro Respostas Inteligentes — "DNA de escrita" do usuário.
 *
 * A partir dos textos limpos dos e-mails enviados, extrai: saudações e despedidas preferidas,
 * assinatura recorrente, nível de formalidade, tamanho médio, parágrafos e frases recorrentes.
 * As frases guardadas não podem ter números, e-mails, links nem nomes próprios (anti-vazamento).
 */
import { GREETING_RE, isClosingLine, normalizeLineKey, splitGreetingAndClosing } from './textClean';

export interface StyleCount {
  text: string;
  count: number;
}

export interface StyleProfile {
  version: 1;
  sampleCount: number;
  greetings: StyleCount[];
  closings: StyleCount[];
  /** Linhas de assinatura que se repetem no fim dos e-mails (nome, cargo, telefone da empresa). */
  signatureLines: string[];
  /** 0 = informal, 1 = formal. */
  formality: number;
  formalityLabel: 'informal' | 'neutro' | 'formal';
  avgWords: number;
  medianWords: number;
  avgParagraphs: number;
  avgSentenceWords: number;
  /** Fração de e-mails com emoji. */
  emojiRate: number;
  frequentPhrases: StyleCount[];
  updatedMs: number;
}

const TITLES = new Set(['sr', 'sr.', 'sra', 'sra.', 'dr', 'dr.', 'dra', 'dra.', 'srs', 'srs.', 'sras', 'sras.']);

/** "Olá Ana," → "Olá {nome},"; "Prezado Sr. Carlos Lima," → "Prezado Sr. {nome},". */
export function templateGreeting(line: string): string {
  const words = line.trim().split(/\s+/);
  const out: string[] = [];
  let inName = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const bare = w.replace(/[,.!:;]+$/, '');
    const punct = w.slice(bare.length);
    const isTitle = TITLES.has(bare.toLowerCase());
    const isName = i > 0 && !isTitle && /^[A-ZÀ-Ý][a-zà-ÿ'-]+$/.test(bare) && !GREETING_RE.test(bare);
    if (isName) {
      if (!inName) out.push(`{nome}${punct}`);
      else if (punct) out[out.length - 1] = `{nome}${punct}`;
      inName = !punct;
      continue;
    }
    inName = false;
    out.push(w);
  }
  return out.join(' ');
}

const FORMAL_MARKERS = /\b(prezad[oa]s?|atenciosamente|cordialmente|sr\.?|sra\.?|v\.?\s?sa\.?|vossa senhoria|solicito|informamos|encaminho|segue em anexo|permane[çc]o [àa] disposi[çc][ãa]o|grato|grata)\b/gi;
const INFORMAL_MARKERS = /\b(oi|oie|abra[çc]o|abs|bjs|beijos?|valeu|blz|beleza|tudo bem|tudo bom|vc|vcs|pra|tô|tá|kkk+|rs+|haha+)\b/gi;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

const words = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));

const median = (arr: number[]) => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

const top = (map: Map<string, { text: string; count: number }>, n: number, min = 1): StyleCount[] =>
  Array.from(map.values())
    .filter((v) => v.count >= min)
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, n);

const bump = (map: Map<string, { text: string; count: number }>, key: string, text: string) => {
  const cur = map.get(key);
  if (cur) cur.count++;
  else map.set(key, { text, count: 1 });
};

/** Frase segura para guardar no perfil: sem números, e-mails, links nem nomes próprios. */
export function isSafePhrase(sentence: string): boolean {
  const s = sentence.trim();
  const w = s.split(/\s+/);
  if (w.length < 3 || w.length > 14) return false;
  if (/\d|@|https?:|www\.|R\$/i.test(s)) return false;
  // Nome próprio: palavra com inicial maiúscula que não está no começo da frase
  for (let i = 1; i < w.length; i++) {
    if (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(w[i]) && !/[.!?:]$/.test(w[i - 1])) return false;
  }
  return true;
}

/** Linha com cara de frase (conteúdo), e não de assinatura (nome, cargo, telefone, site). */
const looksLikeSentence = (l: string) => /[.!?]$/.test(l) && l.split(/\s+/).length >= 4 && !/[|@]|www\.|\d{4}/.test(l);

/**
 * Detecta as linhas de assinatura: o que vem depois da despedida ("Abraço," → nome, cargo...)
 * e se repete em pelo menos metade dos e-mails (mínimo 3). Sem despedida, considera só as
 * últimas linhas curtas que não são frases.
 */
export function detectSignatureLines(texts: string[]): string[] {
  if (texts.length < 3) return [];
  const counts = new Map<string, { text: string; count: number }>();
  for (const t of texts) {
    const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
    let closingIdx = -1;
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 8); i--) {
      if (isClosingLine(lines[i])) {
        closingIdx = i;
        break;
      }
    }
    const tail = (closingIdx >= 0 ? lines.slice(closingIdx + 1) : lines.slice(-3)).filter((l) => !looksLikeSentence(l)).slice(0, 6);
    const seen = new Set<string>();
    for (const l of tail) {
      if (l.length > 80 || isClosingLine(l)) continue;
      const key = normalizeLineKey(l);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      bump(counts, key, l);
    }
  }
  const min = Math.max(3, Math.ceil(texts.length * 0.5));
  return top(counts, 8, min).map((c) => c.text);
}

/** Extrai o perfil de escrita a partir dos textos limpos (sem citação) dos e-mails enviados. */
export function extractStyleProfile(sentTexts: string[], nowMs: number): StyleProfile {
  const texts = sentTexts.map((t) => (t || '').trim()).filter((t) => t.length > 0);
  const signatureLines = detectSignatureLines(texts);
  const sigKeys = new Set(signatureLines.map(normalizeLineKey));

  const greetings = new Map<string, { text: string; count: number }>();
  const closings = new Map<string, { text: string; count: number }>();
  const phrases = new Map<string, { text: string; count: number; docs: Set<number> }>();
  const wordCounts: number[] = [];
  const paragraphCounts: number[] = [];
  const sentenceLens: number[] = [];
  let formal = 0;
  let informal = 0;
  let withEmoji = 0;

  texts.forEach((full, docIdx) => {
    const withoutSig = full
      .split('\n')
      .filter((l) => !sigKeys.has(normalizeLineKey(l)))
      .join('\n');
    const parts = splitGreetingAndClosing(withoutSig);
    if (parts.greeting) {
      const g = templateGreeting(parts.greeting);
      bump(greetings, normalizeLineKey(g), g);
    }
    if (parts.closing) {
      const c = parts.closing.replace(/,\s*[A-ZÀ-Ý][\s\S]*$/, ',').trim();
      bump(closings, normalizeLineKey(c), c);
    }
    const body = parts.body;
    wordCounts.push(words(body).length);
    paragraphCounts.push(body.split(/\n\s*\n/).filter((p) => p.trim()).length || (body.trim() ? 1 : 0));
    formal += (full.match(FORMAL_MARKERS) || []).length;
    informal += (full.match(INFORMAL_MARKERS) || []).length;
    if (EMOJI_RE.test(full)) withEmoji++;

    for (const raw of body.split(/(?<=[.!?])\s+|\n+/)) {
      const s = raw.trim();
      if (!s) continue;
      sentenceLens.push(words(s).length);
      if (!isSafePhrase(s)) continue;
      const key = normalizeLineKey(s);
      const cur = phrases.get(key);
      if (cur) {
        if (!cur.docs.has(docIdx)) {
          cur.docs.add(docIdx);
          cur.count++;
        }
      } else phrases.set(key, { text: s, count: 1, docs: new Set([docIdx]) });
    }
  });

  const n = texts.length;
  const formality = formal + informal === 0 ? 0.5 : Math.round((formal / (formal + informal)) * 100) / 100;
  const avg = (arr: number[]) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0);
  const phraseList = Array.from(phrases.values())
    .filter((p) => p.count >= 3)
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, 12)
    .map((p) => ({ text: p.text, count: p.count }));

  return {
    version: 1,
    sampleCount: n,
    greetings: top(greetings, 5),
    closings: top(closings, 5),
    signatureLines,
    formality,
    formalityLabel: formality >= 0.65 ? 'formal' : formality <= 0.35 ? 'informal' : 'neutro',
    avgWords: avg(wordCounts),
    medianWords: median(wordCounts),
    avgParagraphs: avg(paragraphCounts),
    avgSentenceWords: avg(sentenceLens),
    emojiRate: n ? Math.round((withEmoji / n) * 100) / 100 : 0,
    frequentPhrases: phraseList,
    updatedMs: nowMs,
  };
}
