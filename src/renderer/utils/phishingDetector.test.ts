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

describe('autenticidade (SPF/DKIM/DMARC)', () => {
  it('selo verificado, falha e desconhecido', async () => {
    const { authLevel } = await import('./phishingDetector');
    expect(authLevel({ spf: 'pass', dkim: 'pass', dmarc: 'pass' })).toBe('verified');
    expect(authLevel({ dmarc: 'pass' })).toBe('verified');
    expect(authLevel({ spf: 'fail', dkim: 'none', dmarc: 'fail' })).toBe('fail');
    expect(authLevel({ spf: 'softfail', dkim: 'pass' })).toBe('unknown');
    expect(authLevel(undefined)).toBe('unknown');
  });
  it('falha sozinha não vira alarme; com outro sinal fica suspeito', () => {
    const fail = { spf: 'fail', dkim: 'fail', dmarc: 'fail' };
    expect(analyzePhishing({ sender: 'Ana', senderEmail: 'ana@empresa.com', body: 'oi', authResults: fail }).level).toBe('none');
    expect(
      analyzePhishing({ sender: 'Suporte', senderEmail: 's@site.com', body: 'Último aviso: confirme seus dados em https://bit.ly/x', authResults: fail }).level
    ).toBe('suspicious');
  });
});

describe('remetente disfarçado e Responder para', () => {
  it('Punycode ou outro alfabeto no remetente é golpe', () => {
    expect(analyzePhishing({ sender: 'Banco', senderEmail: 'avisos@xn--itu-6ma.com', body: '' }).level).toBe('danger');
    expect(analyzePhishing({ sender: 'Banco', senderEmail: 'avisos@itаu.com', body: '' }).level).toBe('danger'); // "а" cirílico
  });
  it('Reply-To: suspeito, comum e igual', async () => {
    const { replyToRisk } = await import('./phishingDetector');
    expect(replyToRisk({ sender: 'Itaú Atendimento', senderEmail: 'alerta@itau.com.br', replyTo: 'suporte@outro.com' }).level).toBe('warn');
    expect(replyToRisk({ sender: 'Financeiro', senderEmail: 'nf@empresa.com.br', replyTo: 'financeiro.empresa@gmail.com' }).level).toBe('warn');
    expect(replyToRisk({ sender: 'Loja', senderEmail: 'news@loja.com.br', replyTo: 'atendimento@zendesk.com' }).level).toBe('info');
    expect(replyToRisk({ sender: 'Ana', senderEmail: 'ana@empresa.com', replyTo: 'ana@mail.empresa.com' }).level).toBe('none');
    expect(replyToRisk({ sender: 'Ana', senderEmail: 'ana@empresa.com' }).level).toBe('none');
  });
});
