import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Garante que src/shared continua reaproveitável no app Android (Capacitor):
 * nenhum arquivo (fora os testes) pode importar Electron, Node, React ou código de main/renderer.
 */
const sharedDir = path.dirname(fileURLToPath(import.meta.url));

const listTs = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listTs(full);
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [full] : [];
  });

const FORBIDDEN = [
  /from\s+['"]electron['"]/,
  /from\s+['"]node:/,
  /from\s+['"](fs|path|os|crypto|child_process|worker_threads|url)['"]/,
  /from\s+['"]react(-dom)?['"]/,
  /from\s+['"][./]*\/(main|renderer)\//,
  /from\s+['"]@\//,
  /\brequire\s*\(/,
  /\b(process|Buffer|setImmediate|window|document)\./,
];

describe('src/shared é TypeScript puro', () => {
  const files = listTs(sharedDir);

  it('encontra os módulos compartilhados', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(files.map((f) => [path.relative(sharedDir, f), f]))('%s não depende de plataforma', (_rel, file) => {
    const src = fs.readFileSync(file, 'utf8');
    for (const re of FORBIDDEN) expect(src, `padrão proibido: ${re}`).not.toMatch(re);
  });
});
