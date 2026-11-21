import { describe, it, expect } from 'vitest';
import {
  applyTemplateVariables,
  classifyEmailTriage,
  composeAssistLocal,
  parseUnsubscribeInfo,
} from '../src/renderer/utils/triageAndTemplates';
import { EmailItem } from '../src/renderer/types/email';

function makeEmail(partial: Partial<EmailItem>): EmailItem {
  return {
    id: 'm1',
    sender: 'Remetente',
    senderEmail: 'pessoa@empresa.com',
    recipient: 'eu@anectta.com',
    subject: 'Assunto comum',
    snippet: 'Trecho',
    body: 'Corpo do e-mail',
    timestamp: '10:00',
    period: 'today',
    folder: 'inbox',
    priority: 'medium',
    isRead: false,
    ...partial,
  };
}

describe('triageAndTemplates (Triagem, Unsubscribe, Templates & IA Local)', () => {
  it('classifica corretamente prioritários, newsletters, notificações e adiados', () => {
    expect(classifyEmailTriage(makeEmail({ senderEmail: 'joao@parceiro.com.br' }))).toBe('priority');
    expect(
      classifyEmailTriage(
        makeEmail({
          senderEmail: 'news@techdigest.com',
          listUnsubscribe: '<https://techdigest.com/unsub>',
        })
      )
    ).toBe('newsletters');
    expect(
      classifyEmailTriage(
        makeEmail({
          senderEmail: 'no-reply@banco.com.br',
          subject: 'Seu código de verificação 2FA',
        })
      )
    ).toBe('notifications');
    expect(
      classifyEmailTriage(
        makeEmail({
          snoozedUntil: Date.now() + 60_000,
        })
      )
    ).toBe('snoozed');
  });

  it('extrai List-Unsubscribe RFC 8058 One-Click POST, mailto e fallback HTML', () => {
    const info = parseUnsubscribeInfo(
      makeEmail({
        listUnsubscribe: '<https://lista.com/unsub?id=9>, <mailto:unsub@lista.com?subject=Bye>',
        listUnsubscribePost: 'List-Unsubscribe=One-Click',
      })
    );
    expect(info).not.toBeNull();
    expect(info?.httpUrl).toBe('https://lista.com/unsub?id=9');
    expect(info?.mailto).toBe('unsub@lista.com');
    expect(info?.mailtoSubject).toBe('Bye');
    expect(info?.supportsOneClickPost).toBe(true);

    const htmlFallback = parseUnsubscribeInfo(
      makeEmail({
        bodyHtml: '<p>Não quer mais receber? <a href="https://site.com/descadastrar?u=1">Cancelar inscrição</a></p>',
      })
    );
    expect(htmlFallback?.httpUrl).toBe('https://site.com/descadastrar?u=1');
    expect(htmlFallback?.supportsOneClickPost).toBe(false);
  });

  it('aplica variáveis de template e gera/reescreve rascunhos com IA local', () => {
    const rendered = applyTemplateVariables('Olá {{nome}} da {{empresa}} em {{data}}', {
      nome: 'Marina',
      empresa: 'Anectta',
      data: '20/11/2026',
    });
    expect(rendered).toBe('Olá Marina da Anectta em 20/11/2026');

    const generated = composeAssistLocal({
      action: 'generate',
      currentText: '',
      recipient: 'carlos@cliente.com',
      prompt: 'renovação do contrato anual',
    });
    expect(generated.text).toContain('Carlos');
    expect(generated.text).toContain('renovação do contrato anual');

    const formal = composeAssistLocal({
      action: 'formal',
      currentText: 'oi, blz? valeu pelo envio',
    });
    expect(formal.text).toContain('Prezado(a)');
    expect(formal.text).toContain('Atenciosamente');
  });
});
