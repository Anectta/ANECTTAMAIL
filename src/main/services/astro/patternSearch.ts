/**
 * Astro Respostas Inteligentes — buscador de casos parecidos (RAG local).
 *
 * Dado um e-mail novo, encontra os pares históricos (pergunta → sua resposta) mais semelhantes.
 * 1) O minisearch seleciona candidatos (rápido, tolera erros de digitação).
 * 2) Uma similaridade de cosseno (0 a 1) entre as palavras do e-mail novo e da pergunta antiga
 *    ordena e filtra — é esse número que entra na confiança do Astro.
 * O índice fica SÓ em memória: gravado em disco, exporia palavras dos e-mails sem cifra.
 */
import MiniSearch from 'minisearch';
import type { StoredPair } from './astroStore';

/** Palavras muito comuns (pt/en/es) que não ajudam a comparar assuntos. */
const STOPWORDS = new Set(
  (
    'a o e é de da do das dos em no na nos nas um uma uns umas para pra por com sem que se ao aos à às ' +
    'como mais mas ou ja já nao não sim sua seu suas seus meu minha meus minhas nosso nossa voce você vocês voces ' +
    'ele ela eles elas isso isto esse essa este esta aqui ai aí la lá foi ser ter tem tenho temos está esta estou ' +
    'pelo pela pelos pelas ate até entre sobre quando onde qual quais quem muito muita bem obrigado obrigada ' +
    'ola olá oi bom boa dia tarde noite prezado prezada caro cara att abraço abraco atenciosamente favor ' +
    'the and of to in for on with is are be it this that you your we our i me my from at by an as or not ' +
    'el la los las del y en un una por para con que se su lo'
  ).split(/\s+/)
);

/** Normaliza e quebra o texto em palavras úteis (sem acento, sem palavras comuns, sem números). */
export function tokenize(text: string): string[] {
  const norm = (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const out: string[] = [];
  for (const raw of norm.split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOPWORDS.has(raw) || /^\d+$/.test(raw)) continue;
    // Plural simples: "pedidos" → "pedido", "valores" → "valore" (comparação, não exibição)
    out.push(raw.length > 4 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw);
  }
  return out;
}

const termFreq = (tokens: string[]) => {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1);
  return m;
};

/** Similaridade de cosseno entre dois conjuntos de palavras (0 = nada em comum, 1 = iguais). */
export function cosineSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const fa = termFreq(a);
  const fb = termFreq(b);
  let dot = 0;
  for (const [t, n] of fa) dot += n * (fb.get(t) || 0);
  const norm = (f: Map<string, number>) => Math.sqrt(Array.from(f.values()).reduce((s, n) => s + n * n, 0));
  const d = norm(fa) * norm(fb);
  return d ? Math.round((dot / d) * 1000) / 1000 : 0;
}

/** Texto usado na comparação: o assunto conta em dobro. */
const docTokens = (subject: string, text: string) => {
  const s = tokenize(subject);
  return [...s, ...s, ...tokenize(text).slice(0, 400)];
};

export interface SimilarPair {
  pair: StoredPair;
  /** Similaridade de 0 a 1 (cosseno). */
  similarity: number;
}

export interface FindOptions {
  /** Quantos pares devolver (3 a 5). Padrão: 5. */
  k?: number;
  /** Similaridade mínima para um par servir de exemplo. Padrão: 0,2. */
  minSimilarity?: number;
  /** Não usar o próprio e-mail como exemplo (ao reavaliar um e-mail antigo). */
  excludeInboundId?: string;
}

export const DEFAULT_TOP_K = 5;
export const DEFAULT_MIN_SIMILARITY = 0.2;

interface IndexedPair {
  id: number;
  subject: string;
  question: string;
}

export class PairIndex {
  private readonly mini: MiniSearch<IndexedPair>;
  private readonly byId = new Map<number, { pair: StoredPair; tokens: string[] }>();

  constructor(pairs: StoredPair[]) {
    this.mini = new MiniSearch<IndexedPair>({
      fields: ['subject', 'question'],
      idField: 'id',
      tokenize: (text) => tokenize(text),
      processTerm: (term) => term,
      searchOptions: { prefix: true, fuzzy: 0.2, boost: { subject: 2 }, combineWith: 'OR' },
    });
    const docs: IndexedPair[] = [];
    for (const p of pairs) {
      if (!p || this.byId.has(p.id)) continue;
      this.byId.set(p.id, { pair: p, tokens: docTokens(p.subject, p.question) });
      docs.push({ id: p.id, subject: p.subject, question: p.question.slice(0, 4000) });
    }
    this.mini.addAll(docs);
  }

  get size(): number {
    return this.byId.size;
  }

  /** Os pares mais parecidos com o e-mail novo (já limpo), do mais ao menos semelhante. */
  findSimilar(subject: string, text: string, opts: FindOptions = {}): SimilarPair[] {
    const k = Math.max(1, Math.min(opts.k ?? DEFAULT_TOP_K, 10));
    const min = opts.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
    const queryTokens = docTokens(subject, text);
    if (queryTokens.length === 0 || this.byId.size === 0) return [];
    const queryText = Array.from(new Set(queryTokens)).slice(0, 60).join(' ');
    const candidates = this.mini.search(queryText).slice(0, 40);
    const scored: SimilarPair[] = [];
    for (const c of candidates) {
      const entry = this.byId.get(Number(c.id));
      if (!entry) continue;
      if (opts.excludeInboundId && entry.pair.inboundId === opts.excludeInboundId) continue;
      const similarity = cosineSimilarity(queryTokens, entry.tokens);
      if (similarity >= min) scored.push({ pair: entry.pair, similarity });
    }
    return scored.sort((a, b) => b.similarity - a.similarity || b.pair.outDateMs - a.pair.outDateMs).slice(0, k);
  }
}

/**
 * Guarda um índice por conta, em memória. É refeito quando a quantidade de pares muda
 * (novo aprendizado ou "Apagar o que o Astro aprendeu").
 */
export class PairIndexCache {
  private readonly cache = new Map<string, { index: PairIndex; pairCount: number }>();

  get(accountEmail: string, pairCount: number, loadPairs: () => StoredPair[]): PairIndex {
    const key = accountEmail.trim().toLowerCase();
    const cur = this.cache.get(key);
    if (cur && cur.pairCount === pairCount) return cur.index;
    const index = new PairIndex(loadPairs());
    this.cache.set(key, { index, pairCount });
    return index;
  }

  invalidate(accountEmail?: string): void {
    if (accountEmail) this.cache.delete(accountEmail.trim().toLowerCase());
    else this.cache.clear();
  }
}
