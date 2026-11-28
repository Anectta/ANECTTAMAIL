/**
 * Astro Respostas Inteligentes — configuração por conta.
 * A opção é desligada por padrão e vale só nas contas em que o usuário ativar.
 */

/** Nível de autonomia escolhido pelo usuário. */
export type AstroAutonomy = 'desligado' | 'classificar' | 'rascunho' | 'automatico';

/** Motor que redige as sugestões. Primeira entrega: só o motor local (sem IA). */
export type AstroEngine = 'local';

export interface AstroReplyConfig {
  autonomy: AstroAutonomy;
  engine: AstroEngine;
  /** Data/hora em que o usuário ativou a opção nesta conta (epoch ms). Nada antes disso é respondido. */
  activatedAtMs: number;
  /** Confiança mínima (0 a 1) para permitir envio automático. Padrão: 0,70. */
  minConfidence: number;
  /** Máximo de envios automáticos por conta por dia. Padrão: 30. */
  maxAutoPerDay: number;
  /** Idade máxima (horas) de um e-mail para receber resposta automática. Padrão: 48. */
  maxAgeHours: number;
  /** Envios automáticos pausados manualmente ("Pausar envios automáticos"). */
  paused: boolean;
}

export const DEFAULT_ASTRO_REPLY_CONFIG: Omit<AstroReplyConfig, 'activatedAtMs'> = {
  autonomy: 'desligado',
  engine: 'local',
  minConfidence: 0.7,
  maxAutoPerDay: 30,
  maxAgeHours: 48,
  paused: false,
};

/** Máximo de respostas automáticas por conversa (anti-loop). Fixo — não é configurável. */
export const MAX_AUTO_REPLIES_PER_THREAD = 1;

/** Normaliza uma configuração vinda do disco (valores fora da faixa voltam ao padrão). */
export function normalizeAstroReplyConfig(raw: Partial<AstroReplyConfig> | null | undefined, nowMs: number): AstroReplyConfig {
  const d = DEFAULT_ASTRO_REPLY_CONFIG;
  const autonomies: AstroAutonomy[] = ['desligado', 'classificar', 'rascunho', 'automatico'];
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
  return {
    autonomy: autonomies.includes(raw?.autonomy as AstroAutonomy) ? (raw!.autonomy as AstroAutonomy) : d.autonomy,
    engine: 'local',
    activatedAtMs: num(raw?.activatedAtMs, 1, Number.MAX_SAFE_INTEGER, nowMs),
    minConfidence: num(raw?.minConfidence, 0.5, 1, d.minConfidence),
    maxAutoPerDay: Math.floor(num(raw?.maxAutoPerDay, 0, 500, d.maxAutoPerDay)),
    maxAgeHours: num(raw?.maxAgeHours, 1, 24 * 7, d.maxAgeHours),
    paused: raw?.paused === true,
  };
}
