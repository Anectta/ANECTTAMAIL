/**
 * Astro Respostas Inteligentes — núcleo compartilhado.
 *
 * REGRA: tudo nesta pasta é TypeScript puro — sem Electron, sem Node (fs, path, node:*),
 * sem React. Assim a mesma inteligência (travas, pareamento, estilo, busca, decisão) pode ser
 * usada no desktop e no app Android (Capacitor). Um teste garante essa regra.
 * O que depende de plataforma (banco node:sqlite, rotina em lotes) fica em src/main/services/astro.
 */
export * from './types';
export * from './replyConfig';
export * from './replyGuard';
export * from './textClean';
export * from './pairing';
export * from './styleProfile';
export * from './patternSearch';
export * from './leakGuard';
export * from './categorize';
export * from './feedback';
export * from './replyEngine';
