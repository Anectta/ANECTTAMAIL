export interface AttachmentLike {
  id?: string;
  name?: string;
  filename?: string;
  size?: number;
  contentType?: string;
  path?: string;
  isSignature?: boolean;
  isInline?: boolean;
  contentDisposition?: string;
  cid?: string;
}

/**
 * Identifica se um anexo é na verdade uma imagem de assinatura digital,
 * logotipo corporativo ou elemento visual inline inserido no corpo do e-mail.
 */
export function isSignatureOrInlineAttachment(
  att: AttachmentLike,
  bodyHtml?: string
): boolean {
  const filename = (att.name || att.filename || '').trim();
  const contentType = (att.contentType || '').toLowerCase();
  const isImage =
    contentType.startsWith('image/') ||
    /\.(png|jpe?g|gif|bmp|webp|ico)$/i.test(filename);

  // Somente imagens podem ser consideradas assinaturas / logos
  if (!isImage) {
    return false;
  }

  // 1. Marcação explícita de anexo inline ou assinatura
  if (att.isSignature || att.isInline || att.contentDisposition === 'inline') {
    return true;
  }

  // 2. Imagem referenciada no corpo HTML via Content-ID (cid:...)
  if (att.cid && bodyHtml && bodyHtml.includes(att.cid)) {
    return true;
  }

  // 3. Nome do arquivo presente no HTML do corpo (ex: <img src="...image001.png">)
  if (
    filename &&
    bodyHtml &&
    (bodyHtml.includes(filename) || bodyHtml.includes(encodeURIComponent(filename)))
  ) {
    return true;
  }

  // 4. Padrão típico do Microsoft Outlook/Word para assinaturas e imagens coladas
  // Ex: image001.jpg, image002.png, etc. (geralmente menores que 350 KB)
  const size = att.size || 0;
  const isSmallImage = size < 350 * 1024;
  const outlookAutoImagePattern = /^image\d{3,4}\.(png|jpe?g|gif|bmp|webp)$/i;
  if (outlookAutoImagePattern.test(filename) && isSmallImage) {
    return true;
  }

  // 5. Nomes convencionais de assinaturas, logotipos de rodapé e ícones sociais
  const signatureNamePattern =
    /^(signature|assinatura|logo|logotipo|banner|footer|rodape|header|cabecalho|stamp|selo|social|icon_?|icone_?|whatsapp|facebook|linkedin|instagram|twitter|yt|youtube|badge)\w*\.(png|jpe?g|gif|webp|svg)$/i;
  if (signatureNamePattern.test(filename) && isSmallImage) {
    return true;
  }

  return false;
}

/**
 * Filtra a lista de anexos removendo imagens de assinaturas e elementos inline,
 * mantendo apenas arquivos e documentos autênticos.
 */
export function filterRealAttachments<T extends AttachmentLike>(
  attachments: T[] | undefined | null,
  bodyHtml?: string
): T[] {
  if (!attachments || !Array.isArray(attachments)) return [];
  return attachments.filter((att) => !isSignatureOrInlineAttachment(att, bodyHtml));
}
