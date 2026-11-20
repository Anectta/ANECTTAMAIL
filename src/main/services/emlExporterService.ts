import fs from 'fs';
import path from 'path';
import { app, dialog } from 'electron';

export interface EmailExportData {
  id: string;
  messageIdHeader?: string;
  inReplyToHeader?: string;
  referencesHeader?: string[];
  sender: string;
  senderEmail: string;
  recipient: string;
  cc?: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  dateStr?: string;
  timestamp?: string;
  folder?: string;
  attachments?: Array<{
    name: string;
    path?: string;
    size?: number;
    contentType?: string;
  }>;
}

export class EmlExporterService {
  /**
   * Converte um objeto de e-mail na especificação padrão RFC 5322 / RFC 2045 (.EML)
   */
  public static buildEmlString(email: EmailExportData): string {
    const fromAddr = (email.senderEmail || 'desconhecido@anectta.com.br').trim();
    const fromName = email.sender ? `"${email.sender.replace(/"/g, '')}"` : `"${fromAddr}"`;
    const toAddr = (email.recipient || '').trim();
    const subject = email.subject || '(Sem Assunto)';
    const date = email.dateStr ? new Date(email.dateStr) : new Date();
    const rfcDate = date.toUTCString();
    const messageId = `<${email.id.replace(/[^a-zA-Z0-9_-]/g, '') || Date.now()}@anecttamail.local>`;

    const boundaryMixed = `----=_Part_Mixed_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const boundaryAlt = `----=_Part_Alt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const textPart = email.body || '';
    const htmlPart =
      email.bodyHtml ||
      `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">${textPart.replace(/\n/g, '<br/>')}</body></html>`;

    const headers: string[] = [
      `MIME-Version: 1.0`,
      `Date: ${rfcDate}`,
      `Message-ID: ${email.messageIdHeader?.trim() || messageId}`,
      ...(email.inReplyToHeader?.trim() ? [`In-Reply-To: ${email.inReplyToHeader.trim()}`] : []),
      ...(Array.isArray(email.referencesHeader) && email.referencesHeader.length > 0
        ? [`References: ${email.referencesHeader.join(' ')}`]
        : []),
      `From: ${fromName} <${fromAddr}>`,
      `To: ${toAddr}`,
      ...(email.cc && email.cc.trim() ? [`Cc: ${email.cc.trim()}`] : []),
      `Subject: ${subject}`,
      `X-Mailer: Anectta MAIL Enterprise v1.0.2`,
      `X-Folder: ${email.folder || 'inbox'}`,
    ];

    const attachments = (email.attachments || []).filter((a) => a.path && fs.existsSync(a.path));

    if (attachments.length === 0) {
      headers.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);
      headers.push('');

      const bodyParts = [
        `--${boundaryAlt}`,
        `Content-Type: text/plain; charset=UTF-8`,
        `Content-Transfer-Encoding: 8bit`,
        '',
        textPart,
        '',
        `--${boundaryAlt}`,
        `Content-Type: text/html; charset=UTF-8`,
        `Content-Transfer-Encoding: 8bit`,
        '',
        htmlPart,
        '',
        `--${boundaryAlt}--`,
      ];

      return `${headers.join('\r\n')}\r\n${bodyParts.join('\r\n')}`;
    }

    // Com anexos físicos: multipart/mixed contendo multipart/alternative
    headers.push(`Content-Type: multipart/mixed; boundary="${boundaryMixed}"`);
    headers.push('');

    const lines: string[] = [
      ...headers,
      `--${boundaryMixed}`,
      `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
      '',
      `--${boundaryAlt}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      '',
      textPart,
      '',
      `--${boundaryAlt}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      '',
      htmlPart,
      '',
      `--${boundaryAlt}--`,
    ];

    // Adiciona cada anexo codificado em Base64
    for (const att of attachments) {
      try {
        if (!att.path || !fs.existsSync(att.path)) continue;
        const fileBuffer = fs.readFileSync(att.path);
        const base64Content = fileBuffer.toString('base64');
        const formattedBase64 = base64Content.match(/.{1,76}/g)?.join('\r\n') || base64Content;
        const filename = att.name || path.basename(att.path);
        const contentType = att.contentType || 'application/octet-stream';

        lines.push('');
        lines.push(`--${boundaryMixed}`);
        lines.push(`Content-Type: ${contentType}; name="${filename}"`);
        lines.push(`Content-Disposition: attachment; filename="${filename}"`);
        lines.push(`Content-Transfer-Encoding: base64`);
        lines.push('');
        lines.push(formattedBase64);
      } catch (err) {
        console.warn(`[EML] Falha ao anexar arquivo ${att.name}:`, err);
      }
    }

    lines.push('');
    lines.push(`--${boundaryMixed}--`);

    return lines.join('\r\n');
  }

  /**
   * Salva um e-mail individual em arquivo .eml via caixa de diálogo do Windows
   */
  public static async exportSingleEmailDialog(
    email: EmailExportData
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const sanitizedSubject = (email.subject || 'mensagem')
        .replace(/[\\/:*?"<>|]/g, '_')
        .slice(0, 50)
        .trim();
      const defaultFilename = `${sanitizedSubject || 'email'}.eml`;

      const result = await dialog.showSaveDialog({
        title: 'Exportar E-mail no Formato Aberto Padrão (.EML)',
        defaultPath: path.join(app.getPath('documents'), defaultFilename),
        filters: [{ name: 'E-mail RFC 822 Standard (*.eml)', extensions: ['eml'] }],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Exportação cancelada pelo usuário.' };
      }

      const emlContent = this.buildEmlString(email);
      await fs.promises.writeFile(result.filePath, emlContent, 'utf-8');

      return { success: true, filePath: result.filePath };
    } catch (err: any) {
      console.error('[EML] Erro na exportação dialog:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Exporta lote de mensagens para uma pasta selecionada em arquivos .eml
   */
  public static async exportBatchEmails(
    emails: EmailExportData[],
    targetDirectory?: string
  ): Promise<{ success: boolean; count: number; directory?: string; error?: string }> {
    try {
      let destDir = targetDirectory;
      if (!destDir) {
        const dialogRes = await dialog.showOpenDialog({
          title: 'Selecione a Pasta de Destino para Exportar E-mails (.EML)',
          properties: ['openDirectory', 'createDirectory'],
        });
        if (dialogRes.canceled || !dialogRes.filePaths[0]) {
          return { success: false, count: 0, error: 'Exportação cancelada.' };
        }
        destDir = dialogRes.filePaths[0];
      }

      if (!fs.existsSync(destDir)) {
        await fs.promises.mkdir(destDir, { recursive: true });
      }

      let count = 0;
      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        const safeSubject = (email.subject || 'mensagem')
          .replace(/[\\/:*?"<>|]/g, '_')
          .slice(0, 45)
          .trim();
        const dateTag = email.dateStr ? new Date(email.dateStr).toISOString().slice(0, 10) : 'msg';
        const fileName = `${dateTag}_${i + 1}_${safeSubject || 'email'}.eml`;
        const filePath = path.join(destDir, fileName);

        const eml = this.buildEmlString(email);
        await fs.promises.writeFile(filePath, eml, 'utf-8');
        count++;
      }

      return { success: true, count, directory: destDir };
    } catch (err: any) {
      return { success: false, count: 0, error: err.message };
    }
  }
}
