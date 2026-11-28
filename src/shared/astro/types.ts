/**
 * Astro Respostas Inteligentes — tipos compartilhados (desktop e, no futuro, Android).
 */

/** Conteúdo de um par histórico (gravado cifrado no banco local). */
export interface PairContent {
  /** Pergunta pura (texto do e-mail recebido, sem citação/assinatura). */
  question: string;
  /** Resposta pura (seu texto, sem saudação/despedida/assinatura/citação). */
  answer: string;
  /** Assunto normalizado. */
  subject: string;
  /** Endereço de quem perguntou (usado só para o anti-vazamento). */
  counterpart: string;
}

/** Par histórico já decifrado. */
export interface StoredPair extends PairContent {
  id: number;
  inboundId: string;
  outboundId: string;
  threadKey: string;
  category: string | null;
  inDateMs: number;
  outDateMs: number;
  uses: number;
}
