/**
 * Astro Respostas Inteligentes — aprendizado com as suas edições.
 *
 * Compara o rascunho sugerido pelo Astro com o texto que você realmente enviou.
 * Um rascunho "aprovado" (enviado com poucas mudanças) conta para liberar o envio automático.
 */
import { tokenize, cosineSimilarity } from './patternSearch';

/** A partir desta semelhança, o rascunho conta como aprovado (você manteve o essencial). */
export const APPROVED_DRAFT_SIMILARITY = 0.7;

export interface DraftComparison {
  /** Semelhança de 0 a 1 entre sugerido e enviado. */
  similarity: number;
  /** Enviado praticamente como sugerido (≥ 0,95). */
  unchanged: boolean;
  /** Conta como rascunho aprovado (≥ 0,70). */
  approved: boolean;
  /** Palavras que você acrescentou / tirou (para recalibrar o estilo). */
  added: string[];
  removed: string[];
  /** Tamanho (palavras) sugerido x enviado. */
  suggestedWords: number;
  sentWords: number;
}

const words = (t: string) => (t || '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));

export function compareDraft(suggested: string, sent: string): DraftComparison {
  const a = tokenize(suggested);
  const b = tokenize(sent);
  const similarity = a.length === 0 && b.length === 0 ? 1 : cosineSimilarity(a, b);
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    similarity,
    unchanged: similarity >= 0.95,
    approved: similarity >= APPROVED_DRAFT_SIMILARITY,
    added: Array.from(setB).filter((w) => !setA.has(w)).slice(0, 30),
    removed: Array.from(setA).filter((w) => !setB.has(w)).slice(0, 30),
    suggestedWords: words(suggested).length,
    sentWords: words(sent).length,
  };
}
