import { isSignatureOrInlineAttachment } from './attachmentUtils';

/**
 * Separa o "resumo" de um e-mail (o que fica na memória do app) do seu conteúdo (texto + HTML,
 * guardado no banco e carregado só quando o e-mail é aberto).
 *
 * Usado pelo app (ao gravar) e pelo processo principal (na conversão do cache antigo) — por isso
 * não importa nada com o atalho "@/" e trabalha com objetos genéricos.
 */

export interface StrippedEmail {
  meta: Record<string, any>;
  body?: string;
  bodyHtml?: string;
  /** true quando o objeto trazia conteúdo (body/bodyHtml) para gravar. */
  hasBody: boolean;
}

/** O e-mail está sem o conteúdo na memória (precisa buscar no banco para exibir). */
export const isBodyStripped = (e: any): boolean =>
  Boolean(e && e.bodyStored && e.body === undefined && e.bodyHtml === undefined);

export function stripEmailBody(email: Record<string, any>): StrippedEmail {
  const { body, bodyHtml, ...rest } = email;
  const hasBody = body !== undefined || bodyHtml !== undefined;
  if (!hasBody) {
    return { meta: { ...rest }, hasBody: false };
  }

  const meta: Record<string, any> = { ...rest, bodyStored: true };

  // Sem o HTML na memória, a lista não teria como saber quais imagens são de assinatura/inline.
  // Marca agora (com o HTML em mãos) para o ícone de anexo continuar correto.
  if (Array.isArray(rest.attachments) && rest.attachments.length > 0 && typeof bodyHtml === 'string') {
    meta.attachments = rest.attachments.map((att: any) =>
      att && !att.isInline && isSignatureOrInlineAttachment(att, bodyHtml) ? { ...att, isInline: true } : att
    );
  }

  // Tamanho para a ordenação por tamanho (quando o servidor não informou)
  if (!(typeof rest.sizeBytes === 'number' && rest.sizeBytes > 0)) {
    const attBytes = Array.isArray(rest.attachments)
      ? rest.attachments.reduce((sum: number, a: any) => sum + (Number(a?.size) || 0), 0)
      : 0;
    const estimate = (typeof body === 'string' ? body.length : 0) + (typeof bodyHtml === 'string' ? bodyHtml.length : 0) + attBytes;
    if (estimate > 0) meta.sizeBytes = estimate;
  }

  return {
    meta,
    body: typeof body === 'string' ? body : undefined,
    bodyHtml: typeof bodyHtml === 'string' ? bodyHtml : undefined,
    hasBody: true,
  };
}
