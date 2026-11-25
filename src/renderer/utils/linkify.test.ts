import { describe, expect, it } from 'vitest';
import { splitLinks } from './linkify';

const links = (text: string) => splitLinks(text).filter((p) => p.type === 'link').map((p) => (p as any).href);

describe('splitLinks', () => {
  it('reconhece os links do e-mail do Registro.br', () => {
    const text =
      'https://registro.br/r/01ECA20E0F178912598\n\nA confirmação bancária costuma ocorrer em até 2 dias úteis.\n\nEm caso de dúvidas, leia nossa documentação:\nhttps://registro.br/dominio';
    expect(links(text)).toEqual(['https://registro.br/r/01ECA20E0F178912598', 'https://registro.br/dominio']);
    expect(splitLinks(text).map((p) => p.value).join('')).toBe(text);
  });

  it('tira pontuação final e trata www e e-mails', () => {
    expect(links('Veja https://exemplo.com.br/a. Depois www.anectta.com.br, ok?')).toEqual([
      'https://exemplo.com.br/a',
      'https://www.anectta.com.br',
    ]);
    expect(links('Fale com suporte@anectta.com.br.')).toEqual(['mailto:suporte@anectta.com.br']);
    expect(links('(acesse https://x.com.br/p?id=1)')).toEqual(['https://x.com.br/p?id=1']);
    expect(links('wiki https://pt.wikipedia.org/wiki/Teste_(desambiguação) fim')).toEqual([
      'https://pt.wikipedia.org/wiki/Teste_(desambiguação)',
    ]);
  });

  it('texto sem links fica intacto', () => {
    expect(splitLinks('Olá, tudo bem? Valor R$ 10,00.')).toEqual([{ type: 'text', value: 'Olá, tudo bem? Valor R$ 10,00.' }]);
  });
});
