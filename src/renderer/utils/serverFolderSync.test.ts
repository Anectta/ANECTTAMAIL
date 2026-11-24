import { describe, it, expect } from 'vitest';
import type { CustomFolder } from '@/types/email';
import { findFoldersDeletedOnServer } from './serverFolderSync';

const f = (id: string, imapPath?: string, extra: Partial<CustomFolder> = {}): CustomFolder =>
  ({ id, name: id, accountId: 'acc', imapPath, createdAt: '', ...extra }) as CustomFolder;

describe('findFoldersDeletedOnServer', () => {
  const folders = [
    f('diversos', 'Diversos'),
    f('sub', 'Diversos/2024', { parentFolder: 'diversos' }),
    f('contratos', 'Contratos'),
    f('local', undefined), // pasta só do app
    f('outra-conta', 'Diversos', { accountId: 'outra' }),
  ];

  it('pasta apagada no servidor sai, com as subpastas', () => {
    const r = findFoldersDeletedOnServer(folders, 'acc', ['INBOX', 'Sent', 'Contratos']);
    expect([...r.ids].sort()).toEqual(['diversos', 'sub']);
    expect(r.blocked).toBe(false);
  });

  it('não mexe em pastas só do app nem de outra conta', () => {
    const r = findFoldersDeletedOnServer(folders, 'acc', ['INBOX', 'Diversos', 'Diversos/2024', 'Contratos']);
    expect(r.ids.size).toBe(0);
  });

  it('sincronização rápida (sem lista de pastas): nada é removido', () => {
    expect(findFoldersDeletedOnServer(folders, 'acc', undefined).ids.size).toBe(0);
    expect(findFoldersDeletedOnServer(folders, 'acc', []).ids.size).toBe(0);
  });

  it('lista sem Caixa de Entrada não é confiável', () => {
    const r = findFoldersDeletedOnServer(folders, 'acc', ['Sent']);
    expect(r.ids.size).toBe(0);
    expect(r.blocked).toBe(true);
  });

  it('muitas pastas sumindo de uma vez: trava de segurança', () => {
    const many = Array.from({ length: 12 }, (_, i) => f(`p${i}`, `Pasta${i}`));
    const r = findFoldersDeletedOnServer(many, 'acc', ['INBOX']);
    expect(r.ids.size).toBe(0);
    expect(r.blocked).toBe(true);
  });
});
