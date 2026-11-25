import { describe, expect, it } from 'vitest';
import { parseQuickEvent } from './quickEvent';

// Quarta-feira, 25/11/2026, 10h
const NOW = new Date(2026, 10, 25, 10, 0, 0);
const p = (t: string) => parseQuickEvent(t, NOW);

describe('criar compromisso escrevendo', () => {
  it('Reunião com Ana sexta 15h', () => {
    expect(p('Reunião com Ana sexta 15h')).toMatchObject({
      title: 'Reunião com Ana',
      date: '2026-11-27',
      startTime: '15:00',
      endTime: '16:00',
      allDay: false,
    });
  });

  it('data dd/mm com minutos e duração', () => {
    expect(p('Dentista 28/11 às 9h30 por 30 min')).toMatchObject({
      title: 'Dentista',
      date: '2026-11-28',
      startTime: '09:30',
      endTime: '10:00',
    });
  });

  it('amanhã, por extenso e dia inteiro', () => {
    expect(p('Ligar para o contador amanhã 14:00')).toMatchObject({ title: 'Ligar para o contador', date: '2026-11-26', startTime: '14:00' });
    expect(p('Aniversário da Júlia 5 de dezembro')).toMatchObject({ title: 'Aniversário da Júlia', date: '2026-12-05', allDay: true });
  });

  it('só horário: hoje se ainda não passou, senão amanhã', () => {
    expect(p('Call com fornecedor 16h')).toMatchObject({ date: '2026-11-25', startTime: '16:00' });
    expect(p('Café 8h')).toMatchObject({ date: '2026-11-26', startTime: '08:00' });
  });

  it('sem data nem hora não cria', () => {
    expect(p('Reunião com Ana')).toBeNull();
    expect(p('')).toBeNull();
  });
});
