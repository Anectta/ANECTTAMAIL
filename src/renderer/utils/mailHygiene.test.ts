import { describe, expect, it } from 'vitest';
import type { EmailItem } from '../types/email';
import { expiredForPurge, isQuietNow, normalizeSenderEntry, senderInList, updatePurgeClock } from './mailHygiene';

const at = (iso: string) => new Date(iso);

describe('horário silencioso', () => {
  const cfg = { enabled: true, start: '20:00', end: '08:00', weekends: false };
  it('atravessa a meia-noite', () => {
    expect(isQuietNow(cfg, at('2026-11-25T21:30:00'))).toBe(true); // quarta 21h30
    expect(isQuietNow(cfg, at('2026-11-25T07:59:00'))).toBe(true);
    expect(isQuietNow(cfg, at('2026-11-25T08:00:00'))).toBe(false);
    expect(isQuietNow(cfg, at('2026-11-25T14:00:00'))).toBe(false);
  });
  it('faixa no mesmo dia e fim de semana', () => {
    const almoco = { enabled: true, start: '12:00', end: '13:30', weekends: true };
    expect(isQuietNow(almoco, at('2026-11-25T12:45:00'))).toBe(true);
    expect(isQuietNow(almoco, at('2026-11-25T13:30:00'))).toBe(false);
    expect(isQuietNow(almoco, at('2026-11-28T10:00:00'))).toBe(true); // sábado
  });
  it('desligado nunca silencia', () => {
    expect(isQuietNow({ ...cfg, enabled: false }, at('2026-11-25T23:00:00'))).toBe(false);
    expect(isQuietNow(undefined)).toBe(false);
  });
});

describe('remetentes confiáveis', () => {
  it('endereço exato e domínio (com subdomínio)', () => {
    const list = ['Ana <ana@cliente.com.br>', '@empresa.com', 'banco.com.br'];
    expect(senderInList('ANA@cliente.com.br', list)).toBe(true);
    expect(senderInList('joao@empresa.com', list)).toBe(true);
    expect(senderInList('avisos@mail.banco.com.br', list)).toBe(true);
    expect(senderInList('joao@outra.com', list)).toBe(false);
    expect(senderInList('x@naoempresa.com', list)).toBe(false);
  });
  it('normaliza entradas', () => {
    expect(normalizeSenderEntry(' Dominio.com.br ')).toBe('@dominio.com.br');
    expect(normalizeSenderEntry('"X" <x@y.com>')).toBe('x@y.com');
  });
});

describe('limpeza automática', () => {
  const mail = (id: string, folder: string) => ({ id, folder } as unknown as EmailItem);
  const DAY = 86_400_000;
  it('conta o tempo dentro da Lixeira, não a data do e-mail', () => {
    const t0 = 1_000_000_000_000;
    let clock = updatePurgeClock({}, [mail('a', 'trash'), mail('b', 'junk'), mail('c', 'inbox')], t0);
    expect(Object.keys(clock).sort()).toEqual(['a', 'b']);
    // 10 dias depois entra outro
    clock = updatePurgeClock(clock, [mail('a', 'trash'), mail('b', 'junk'), mail('d', 'trash')], t0 + 10 * DAY);
    const emails = [mail('a', 'trash'), mail('b', 'junk'), mail('d', 'trash')];
    expect(expiredForPurge(clock, emails, 30, t0 + 31 * DAY).sort()).toEqual(['a', 'b']);
    expect(expiredForPurge(clock, emails, 30, t0 + 29 * DAY)).toEqual([]);
  });
  it('quem saiu da Lixeira é esquecido; sem mudança devolve o mesmo objeto', () => {
    const clock = updatePurgeClock({}, [mail('a', 'trash')], 1);
    expect(updatePurgeClock(clock, [mail('a', 'trash')], 2)).toBe(clock);
    expect(updatePurgeClock(clock, [mail('a', 'inbox')], 3)).toEqual({});
  });
});
