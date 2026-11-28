import { describe, expect, it, vi } from 'vitest';
import { cosineSimilarity, PairIndex, PairIndexCache, tokenize } from './patternSearch';
import type { StoredPair } from './types';

let nextId = 1;
const pair = (subject: string, question: string, answer = 'Resposta', over: Partial<StoredPair> = {}): StoredPair => {
  const id = nextId++;
  return {
    id,
    inboundId: `in${id}`,
    outboundId: `out${id}`,
    threadKey: `mid:t${id}`,
    category: null,
    inDateMs: id,
    outDateMs: id,
    uses: 0,
    subject,
    question,
    answer,
    counterpart: 'cliente@cliente.com',
    ...over,
  };
};

describe('palavras e similaridade', () => {
  it('ignora acentos, palavras comuns, números e plural simples', () => {
    expect(tokenize('Olá, qual é o HORÁRIO de atendimento dos pedidos? Pedido 12345')).toEqual([
      'horario',
      'atendimento',
      'pedido',
      'pedido',
    ]);
  });
  it('cosseno: iguais = 1, nada em comum = 0', () => {
    expect(cosineSimilarity(['a1', 'b1'], ['a1', 'b1'])).toBe(1);
    expect(cosineSimilarity(['a1'], ['b1'])).toBe(0);
    expect(cosineSimilarity([], ['b1'])).toBe(0);
  });
});

describe('busca de casos parecidos', () => {
  const pairs = [
    pair('horário de atendimento', 'Bom dia, qual o horário de atendimento da loja?', 'Atendemos de segunda a sexta, das 9h às 18h.'),
    pair('segunda via do boleto', 'Preciso da segunda via do boleto deste mês.', 'Segue a segunda via em anexo.'),
    pair('horário de funcionamento sábado', 'Vocês abrem no sábado? Qual o horário de funcionamento?', 'Aos sábados abrimos das 9h às 13h.'),
    pair('proposta comercial', 'Gostaria de receber uma proposta para 50 licenças.', 'Envio a proposta até amanhã.'),
  ];
  const index = new PairIndex(pairs);

  it('acha os casos mais parecidos primeiro, com similaridade entre 0 e 1', () => {
    const r = index.findSimilar('Horário', 'Olá! Até que horas vocês ficam abertos? Qual o horário de atendimento?');
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].pair.subject).toBe('horário de atendimento');
    expect(r.every((x) => x.similarity > 0 && x.similarity <= 1)).toBe(true);
    expect(r.map((x) => x.pair.subject)).not.toContain('proposta comercial');
  });

  it('tolera erro de digitação e falta de acento', () => {
    const r = index.findSimilar('', 'preciso da segunda via do bolet');
    expect(r[0]?.pair.subject).toBe('segunda via do boleto');
  });

  it('assunto sem relação não traz exemplos', () => {
    expect(index.findSimilar('Convite de casamento', 'Você está convidado para a festa de casamento.')).toEqual([]);
  });

  it('respeita o limite de exemplos e a similaridade mínima', () => {
    expect(index.findSimilar('horário', 'horário horário atendimento funcionamento', { k: 1 })).toHaveLength(1);
    expect(index.findSimilar('horário', 'horário de atendimento', { minSimilarity: 0.99 })).toEqual([]);
  });

  it('não usa o próprio e-mail como exemplo', () => {
    const own = pairs[1];
    const r = index.findSimilar(own.subject, own.question, { excludeInboundId: own.inboundId });
    expect(r.map((x) => x.pair.id)).not.toContain(own.id);
  });

  it('índice vazio ou e-mail sem palavras úteis não quebra', () => {
    expect(new PairIndex([]).findSimilar('x', 'qualquer coisa')).toEqual([]);
    expect(index.findSimilar('', 'Olá, bom dia!')).toEqual([]);
  });
});

describe('cache do índice por conta', () => {
  it('reaproveita o índice e refaz quando a quantidade de pares muda', () => {
    const cache = new PairIndexCache();
    const load = vi.fn(() => [pair('a', 'pergunta sobre entrega')]);
    const a = cache.get('Eu@x.com', 1, load);
    const b = cache.get('eu@x.com', 1, load);
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
    cache.get('eu@x.com', 2, load);
    expect(load).toHaveBeenCalledTimes(2);
    cache.invalidate('eu@x.com');
    cache.get('eu@x.com', 2, load);
    expect(load).toHaveBeenCalledTimes(3);
  });
});
