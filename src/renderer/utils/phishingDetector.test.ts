import { describe, expect, it } from 'vitest';
import { analyzePhishing, baseDomain, linkWarnings } from './phishingDetector';

describe('golpes típicos', () => {
  it('banco no nome, mas domínio não oficial', () => {
    const r = analyzePhishing({
      sender: 'Itaú Atendimento',
      senderEmail: 'atendimento@seguranca-clientes.com',
      subject: 'Seu acesso foi bloqueado',
      body: 'Regularize em https://seguranca-clientes.com/login',
    });
    expect(r.level).toBe('danger');
    expect(r.reasons[0]).toContain('diz ser Itaú');
  });

  it('domínio que imita a marca', () => {
    const r = analyzePhishing({ sender: 'Atendimento', senderEmail: 'nao-responda@nubank-seguranca.net', body: 'Olá' });
    expect(r.level).toBe('danger');
    expect(r.reasons.join(' ')).toContain('imita Nubank');
  });

  it('anexo executável', () => {
    const r = analyzePhishing({ sender: 'Financeiro', senderEmail: 'nf@empresa.com', body: 'Segue a nota', attachments: [{ name: 'NotaFiscal.pdf.exe' }] });
    expect(r.level).toBe('danger');
  });

  it('urgência + link encurtado = suspeito', () => {
    const r = analyzePhishing({
      sender: 'Suporte',
      senderEmail: 'suporte@algumsite.com',
      subject: 'Último aviso',
      body: 'Sua conta será bloqueada. Confirme seus dados em https://bit.ly/abc123',
    });
    expect(r.level).toBe('suspicious');
    expect(r.reasons).toHaveLength(2);
  });
});

describe('sem alarme falso', () => {
  it('e-mail oficial do banco', () => {
    const r = analyzePhishing({
      sender: 'Itaú',
      senderEmail: 'comunicacao@itau.com.br',
      subject: 'Sua fatura chegou',
      body: 'Acesse https://www.itau.com.br para ver.',
    });
    expect(r.level).toBe('none');
  });

  it('gov.br oficial e subdomínio', () => {
    expect(analyzePhishing({ sender: 'Receita Federal', senderEmail: 'nao-responda@receita.fazenda.gov.br', body: 'x' }).level).toBe('none');
  });

  it('pessoa comum com link encurtado (sem urgência) não é alarme', () => {
    const r = analyzePhishing({ sender: 'Ana', senderEmail: 'ana@empresa.com.br', body: 'Olha as fotos: https://bit.ly/fotos' });
    expect(r.level).toBe('none');
  });

  it('caixa de entrada não confunde com Caixa Econômica', () => {
    expect(analyzePhishing({ sender: 'Caixa de entrada', senderEmail: 'x@y.com', body: 'oi' }).level).toBe('none');
  });

  it('remetente marcado como confiável', () => {
    const r = analyzePhishing({ sender: 'Itaú', senderEmail: 'parceiro@agencia.com', body: '' }, new Set(['parceiro@agencia.com']));
    expect(r.level).toBe('none');
  });
});

describe('aviso de link', () => {
  it('texto mostra um site e leva a outro', () => {
    expect(linkWarnings('https://login-seguro.xyz/itau', 'www.itau.com.br')[0]).toContain('mostra "www.itau.com.br"');
  });
  it('IP, encurtador e domínio disfarçado', () => {
    expect(linkWarnings('http://185.22.10.4/pagar')[0]).toContain('endereço numérico');
    expect(linkWarnings('https://bit.ly/x')[0]).toContain('encurtador');
    expect(linkWarnings('https://xn--itu-6ma.com/')[0]).toContain('disfarçados');
  });
  it('link normal não gera aviso', () => {
    expect(linkWarnings('https://registro.br/dominio', 'https://registro.br/dominio')).toEqual([]);
  });
  it('domínio base', () => {
    expect(baseDomain('www.itau.com.br')).toBe('itau.com.br');
    expect(baseDomain('mail.google.com')).toBe('google.com');
  });
});
