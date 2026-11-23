import { MOTIVATIONAL_QUOTES } from '../data/motivationalQuotes';

/**
 * Mensagens motivacionais do cabeçalho: lista editável pelo usuário + preferências de exibição.
 * Fica no localStorage (por computador). Enquanto o usuário não editar nada, usa a lista padrão.
 */

const QUOTES_KEY = 'anectta_motivational_quotes_v1';
const PREFS_KEY = 'anectta_motivational_prefs_v1';
/** Chave antiga do "ocultar" (botão X no cabeçalho) — mantida para compatibilidade. */
const HIDDEN_KEY = 'anectta_hide_motivational_quotes';
const CHANGE_EVENT = 'anectta:motivational-changed';

export const MAX_QUOTE_LENGTH = 200;

export type QuoteFontSize = 'small' | 'medium' | 'large';

export interface MotivationalPrefs {
  /** Exibir no cabeçalho. */
  enabled: boolean;
  /** Velocidade de troca: uma nova mensagem a cada N segundos. */
  intervalSec: number;
  /** true = ordem aleatória; false = sequencial. */
  random: boolean;
  /** Tamanho da letra da frase no cabeçalho. */
  fontSize: QuoteFontSize;
}

/** Opções de velocidade de troca (segundos). */
export const INTERVAL_OPTIONS = [60, 300, 900, 1800, 3600, 7200];

export const FONT_SIZE_OPTIONS: Array<{ value: QuoteFontSize; label: string }> = [
  { value: 'small', label: 'Pequeno' },
  { value: 'medium', label: 'Médio' },
  { value: 'large', label: 'Grande' },
];

const DEFAULT_PREFS: MotivationalPrefs = { enabled: true, intervalSec: 1800, random: false, fontSize: 'medium' };

export const formatInterval = (sec: number): string =>
  sec < 60
    ? `${sec} segundos`
    : sec < 3600
    ? `${sec / 60} ${sec === 60 ? 'minuto' : 'minutos'}`
    : `${sec / 3600} ${sec === 3600 ? 'hora' : 'horas'}`;

const notify = () => {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {}
};

export const getDefaultQuotes = (): string[] => [...MOTIVATIONAL_QUOTES];

export const getQuotes = (): string[] => {
  try {
    const raw = localStorage.getItem(QUOTES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((q): q is string => typeof q === 'string');
    }
  } catch {}
  return getDefaultQuotes();
};

export const saveQuotes = (quotes: string[]): void => {
  const clean = quotes.map((q) => q.trim()).filter(Boolean);
  try {
    localStorage.setItem(QUOTES_KEY, JSON.stringify(clean));
  } catch {}
  notify();
};

/** Volta para a lista padrão (descarta inclusões, edições e exclusões). */
export const resetQuotes = (): void => {
  try {
    localStorage.removeItem(QUOTES_KEY);
  } catch {}
  notify();
};

export const isCustomized = (): boolean => {
  try {
    return localStorage.getItem(QUOTES_KEY) !== null;
  } catch {
    return false;
  }
};

export const getPrefs = (): MotivationalPrefs => {
  let prefs = { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (typeof saved?.enabled === 'boolean') prefs.enabled = saved.enabled;
      if (typeof saved?.intervalSec === 'number') prefs.intervalSec = saved.intervalSec;
      if (typeof saved?.random === 'boolean') prefs.random = saved.random;
      if (saved?.fontSize === 'small' || saved?.fontSize === 'medium' || saved?.fontSize === 'large') {
        prefs.fontSize = saved.fontSize;
      }
    } else if (localStorage.getItem(HIDDEN_KEY) === 'true') {
      // Usuário que já tinha ocultado pelo X antes desta versão
      prefs.enabled = false;
    }
  } catch {}
  if (!INTERVAL_OPTIONS.includes(prefs.intervalSec)) prefs.intervalSec = DEFAULT_PREFS.intervalSec;
  return prefs;
};

export const savePrefs = (next: MotivationalPrefs): void => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    localStorage.setItem(HIDDEN_KEY, next.enabled ? 'false' : 'true');
  } catch {}
  notify();
};

/** Avisa quando a lista ou as preferências mudam (inclusive em outra janela do app). */
export const subscribe = (cb: () => void): (() => void) => {
  const onStorage = (e: StorageEvent) => {
    if (e.key === QUOTES_KEY || e.key === PREFS_KEY || e.key === HIDDEN_KEY) cb();
  };
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
};

/** Índice da frase do período atual (estável dentro do mesmo período). */
export const pickQuoteIndex = (count: number, prefs: MotivationalPrefs, offset = 0): number => {
  if (count <= 0) return -1;
  const slot = Math.floor(Date.now() / (prefs.intervalSec * 1000)) + offset;
  if (!prefs.random) return ((slot % count) + count) % count;
  // Pseudoaleatório determinístico por período (não troca a frase a cada nova renderização)
  let x = (slot * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return x % count;
};
