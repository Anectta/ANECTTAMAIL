import React, { useState, useEffect, useRef } from 'react';
import {
  Archive,
  Trash2,
  Reply,
  ReplyAll,
  Forward,
  Maximize2,
  Clock,
  CheckCircle,
  Send,
  Loader2,
  MailQuestion,
  Sparkles,
  FileDown,
  Paperclip,
  Download,
  ExternalLink,
  Folder,
  Image as ImageIcon,
  FileText,
  File,
  AlertCircle,
  AlertOctagon,
  SlidersHorizontal,
  UserPlus,
  UserCheck,
  ArrowLeft,
  CheckSquare,
  BookOpen,
  Tag,
  CheckCheck,
  Shield,
  ShieldCheck,
  EyeOff,
  UserX,
  ImageOff,
  Printer,
  MoreHorizontal,
} from 'lucide-react';
import { CustomFolder, EmailItem, MailFolder } from '@/types/email';
import { SenderAvatar } from './SenderAvatar';
import { soundService } from '../services/soundService';
import { filterRealAttachments } from '../utils/attachmentUtils';
import { QuickRepliesService } from '../services/quickRepliesService';
import { CustomizeQuickRepliesModal } from './CustomizeQuickRepliesModal';
import DOMPurify from 'dompurify';
import { formatReceivedLabel } from '../utils/dateSortUtils';

/**
 * Sanitiza marcação HTML de e-mails para prevenir injeções de script ou eventos maliciosos
 */
function sanitizeEmailHtml(
  rawHtml: string,
  options?: { blockTrackingPixels?: boolean; blockExternalImages?: boolean }
): { html: string; blockedImagesCount: number; blockedPixelsCount: number } {
  if (!rawHtml) return { html: '', blockedImagesCount: 0, blockedPixelsCount: 0 };
  // Sanitização robusta via DOMPurify (parser real de HTML, não regex).
  // Remove scripts, handlers on*, javascript:, iframes, formulários e <style> global
  // (que poderia vazar CSS para a interface do aplicativo).
  let html = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'style', 'link', 'meta', 'base', 'svg', 'math'],
    FORBID_ATTR: ['srcdoc', 'formaction'],
    ALLOW_DATA_ATTR: false,
  });

  // Converte URLs relativas de protocolo (src="//...") para https:// para evitar resolução incorreta como file:// no Electron
  html = html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*['"])\/\/([^'"]+['"])/gi,
    '$1https://$2'
  );

  let blockedPixelsCount = 0;
  if (options?.blockTrackingPixels) {
    html = html.replace(
      /<img\b[^>]*(?:width\s*=\s*["']?[01](?:px)?["']?[^>]*height\s*=\s*["']?[01](?:px)?["']?|height\s*=\s*["']?[01](?:px)?["']?[^>]*width\s*=\s*["']?[01](?:px)?["']?|display\s*:\s*none|\/pixel|\/track\/open|spacer\.gif|1x1\.gif|transparent\.gif|beacon\.png|open\.gif|\/beacon)[^>]*>/gi,
      () => {
        blockedPixelsCount += 1;
        return '';
      }
    );
  }

  let blockedImagesCount = 0;
  if (options?.blockExternalImages) {
    html = html.replace(
      /<img\b([^>]*?)\bsrc\s*=\s*(['"])(https?:\/\/[^'"]+)\2([^>]*)>/gi,
      (_match, before, _quote, _url, after) => {
        blockedImagesCount += 1;
        return `<span data-blocked-img="true" ${before} ${after} style="display:inline-block;padding:2px 6px;border:1px dashed #475569;border-radius:4px;font-size:11px;color:#94a3b8;">[Imagem externa bloqueada]</span>`;
      }
    );
  }

  return { html, blockedImagesCount, blockedPixelsCount };
}

interface EmailViewProps {
  email: EmailItem | null;
  onArchive: (id: string) => void;
  onSnooze: (id: string) => void;
  onDelete: (id: string) => void;
  onReply: (email: EmailItem) => void;
  onReplyAll?: (email: EmailItem) => void;
  onForward?: (email: EmailItem) => void;
  onExpandModal?: () => void;
  isModalMode?: boolean;
  customFolders?: CustomFolder[];
  onMoveToFolder?: (id: string, folder: MailFolder) => void;
  onMarkSpam?: (id: string) => void;
  onUnmarkSpam?: (id: string) => void;
  onAddContact?: (contact: { name: string; email: string }) => void;
  isSenderSaved?: boolean;
  onBackToList?: () => void;
  onToggleTask?: (id: string) => void;
  onToggleReadingList?: (id: string) => void;
  onToggleImportant?: (id: string) => void;
  blockExternalImages?: boolean;
  blockTrackingPixels?: boolean;
  blockBlockedSenders?: boolean;
  onChangePrivacySetting?: (
    key: 'blockExternalImages' | 'blockTrackingPixels' | 'blockBlockedSenders',
    value: boolean
  ) => void;
  onSendReadReceipt?: (email: EmailItem) => Promise<void> | void;
}

export const EmailView: React.FC<EmailViewProps> = ({
  email,
  onArchive,
  onSnooze,
  onDelete,
  onReply,
  onReplyAll,
  onForward,
  onExpandModal,
  isModalMode = false,
  customFolders = [],
  onMoveToFolder,
  onMarkSpam,
  onUnmarkSpam,
  onAddContact,
  isSenderSaved = false,
  onBackToList,
  onToggleTask,
  onToggleReadingList,
  onToggleImportant,
  blockExternalImages = false,
  blockTrackingPixels = true,
  blockBlockedSenders = true,
  onChangePrivacySetting,
  onSendReadReceipt,
}) => {
  const [inlineReplyText, setInlineReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replySentSuccess, setReplySentSuccess] = useState(false);
  const [revealedImagesEmailIds, setRevealedImagesEmailIds] = useState<Record<string, boolean>>({});
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isPrivacyPopoverOpen, setIsPrivacyPopoverOpen] = useState(false);
  const [privacyPopoverPos, setPrivacyPopoverPos] = useState<{ top: number; left: number }>({
    top: 64,
    left: 16,
  });
  const privacyBtnRef = useRef<HTMLButtonElement | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  const [isSendingReceipt, setIsSendingReceipt] = useState(false);
  const [dismissedReceiptIds, setDismissedReceiptIds] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('anectta_dismissed_read_receipts_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleDismissReceipt = (emailId: string) => {
    setDismissedReceiptIds((prev) => {
      const next = { ...prev, [emailId]: true };
      try {
        localStorage.setItem('anectta_dismissed_read_receipts_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    setIsTrackingOpen(false);
    setIsMoreMenuOpen(false);
    setIsPrivacyPopoverOpen(false);
  }, [email?.id]);

  // AI Assistant State
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [isExportingEml, setIsExportingEml] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [emlToast, setEmlToast] = useState<string | null>(null);
  const [isCustomizingReplies, setIsCustomizingReplies] = useState(false);

  const handlePrintEmail = async () => {
    if (!email || isPrinting) return;
    setIsPrinting(true);
    soundService.play('click');
    try {
      const sanitized = email.bodyHtml
        ? sanitizeEmailHtml(email.bodyHtml, {
            blockTrackingPixels,
            blockExternalImages: blockExternalImages && !revealedImagesEmailIds[email.id],
          }).html
        : undefined;
      const attachments = filterRealAttachments(email.attachments).map((a) => a.name);

      if (window.electronAPI?.printEmail) {
        const res = await window.electronAPI.printEmail({
          subject: email.subject,
          sender: email.sender,
          senderEmail: email.senderEmail,
          recipient: email.recipient,
          dateLabel: formatReceivedLabel(email),
          bodyHtml: sanitized,
          body: email.body,
          attachments,
        });
        if (!res.success && !res.canceled && res.error) {
          alert(`Falha ao imprimir e-mail: ${res.error}`);
        }
      } else {
        window.print();
      }
    } catch (err: any) {
      alert(`Falha ao imprimir e-mail: ${err?.message || err}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleExportEml = async () => {
    if (!email || !window.electronAPI?.exportEmailToEml) return;
    setIsExportingEml(true);
    soundService.play('click');
    try {
      const res = await window.electronAPI.exportEmailToEml(email);
      if (res.success && res.filePath) {
        soundService.play('pop');
        setEmlToast(`E-mail exportado com sucesso (.EML): ${res.filePath.split(/[\\/]/).pop()}`);
        setTimeout(() => setEmlToast(null), 4000);
      }
    } catch (err: any) {
      alert(`Falha ao exportar .EML: ${err.message}`);
    } finally {
      setIsExportingEml(false);
    }
  };

  // Estado e Ações para Anexos Recebidos
  const [openingAttId, setOpeningAttId] = useState<string | null>(null);
  const [attachmentToast, setAttachmentToast] = useState<{ text: string; error?: boolean } | null>(null);

  const showAttachmentFeedback = (text: string, error = false) => {
    setAttachmentToast({ text, error });
    setTimeout(() => setAttachmentToast(null), 4500);
  };

  const handleOpenAttachment = async (att: { id?: string; name: string; path?: string }) => {
    if (!att.path) {
      soundService.play('error');
      showAttachmentFeedback(`O anexo "${att.name}" não está salvo no disco local.`, true);
      return;
    }
    soundService.play('click');
    setOpeningAttId(att.id || att.name);
    try {
      if (window.electronAPI?.openAttachment) {
        const res = await window.electronAPI.openAttachment(att.path);
        if (res.success) {
          soundService.play('pop');
          showAttachmentFeedback(`Abrindo: ${att.name}`);
        } else {
          soundService.play('error');
          showAttachmentFeedback(res.error || `Erro ao abrir anexo.`, true);
        }
      }
    } catch (err: any) {
      showAttachmentFeedback(err.message || 'Falha ao abrir o anexo.', true);
    } finally {
      setOpeningAttId(null);
    }
  };

  const handleSaveAttachment = async (att: { name: string; path?: string }, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!att.path) {
      soundService.play('error');
      showAttachmentFeedback(`Arquivo do anexo "${att.name}" não encontrado.`, true);
      return;
    }
    soundService.play('click');
    try {
      if (window.electronAPI?.saveAttachmentAs) {
        const res = await window.electronAPI.saveAttachmentAs({
          sourcePath: att.path,
          defaultName: att.name,
        });
        if (res.success && res.savedPath) {
          soundService.play('pop');
          showAttachmentFeedback(`Salvo com sucesso em: ${res.savedPath.split(/[\\/]/).pop()}`);
        } else if (res.error) {
          soundService.play('error');
          showAttachmentFeedback(res.error, true);
        }
      }
    } catch (err: any) {
      showAttachmentFeedback(err.message || 'Falha ao salvar anexo.', true);
    }
  };

  const handleShowInFolder = async (att: { path?: string }, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!att.path) return;
    soundService.play('pop');
    if (window.electronAPI?.showAttachmentInFolder) {
      await window.electronAPI.showAttachmentInFolder(att.path);
    }
  };

  const getAttachmentIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext || '')) {
      return <ImageIcon className="w-4 h-4 text-cyan-400 shrink-0" />;
    }
    if (['pdf'].includes(ext || '')) {
      return <FileText className="w-4 h-4 text-rose-400 shrink-0" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return <Archive className="w-4 h-4 text-amber-400 shrink-0" />;
    }
    return <File className="w-4 h-4 text-brand-400 shrink-0" />;
  };

  useEffect(() => {
    setInlineReplyText('');
    setReplySentSuccess(false);

    // Carrega sugestões de respostas rápidas contextuais ou personalizadas
    if (QuickRepliesService.isCustomized()) {
      setQuickReplies(QuickRepliesService.getReplies());
    } else if (email?.body && window.electronAPI?.suggestRepliesWithAI) {
      window.electronAPI
        .suggestRepliesWithAI(email.body)
        .then((replies) => {
          if (replies && replies.length > 0) {
            setQuickReplies(replies);
          } else {
            setQuickReplies(QuickRepliesService.getReplies());
          }
        })
        .catch(() => setQuickReplies(QuickRepliesService.getReplies()));
    } else {
      setQuickReplies(QuickRepliesService.getReplies());
    }
  }, [email?.id]);

  useEffect(() => {
    const handleQuickRepliesUpdated = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setQuickReplies(e.detail);
      } else {
        setQuickReplies(QuickRepliesService.getReplies());
      }
    };
    window.addEventListener('anectta:quick-replies-updated', handleQuickRepliesUpdated);
    return () => {
      window.removeEventListener('anectta:quick-replies-updated', handleQuickRepliesUpdated);
    };
  }, []);

  if (!email) {
    return (
      <main className="flex-1 bg-slate-950 flex flex-col items-center justify-center text-slate-500 p-8 select-text">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-slate-600 shadow-xl">
          <MailQuestion className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-semibold text-slate-300 mb-1">
          Nenhum e-mail selecionado
        </h3>
        <p className="text-xs text-slate-500 text-center max-w-sm mb-6">
          Navegue pelas mensagens usando a lista ou atalhos de teclado.
        </p>
        <div className="flex items-center space-x-3 text-[11px] text-slate-400 font-mono">
          <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800">
            J / K Navegar
          </span>
          <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800">
            C Escrever
          </span>
          <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800">
            Ctrl + K Comandos
          </span>
        </div>
      </main>
    );
  }

  const handleSendQuickReply = async () => {
    if (!inlineReplyText.trim()) return;
    setIsSendingReply(true);
    try {
      if (window.electronAPI) {
        await window.electronAPI.sendEmail({
          sender: 'Carlos Amoroso',
          senderEmail: 'carlosamoroso@anectta.com.br',
          recipient: email.senderEmail,
          subject: `Re: ${email.subject}`,
          snippet: inlineReplyText.slice(0, 80),
          body: inlineReplyText,
          period: 'today',
          folder: 'sent',
          priority: 'medium',
          isRead: true,
        });
      }
      setReplySentSuccess(true);
      setInlineReplyText('');
      setTimeout(() => setReplySentSuccess(false), 3000);
    } finally {
      setIsSendingReply(false);
    }
  };

  return (
    <main className="flex-1 bg-slate-950 flex flex-col h-full overflow-hidden select-text">
      {/* Top Action Toolbar (Layout unificado em linha com cores originais preservadas) */}
      <div className="border-b border-slate-800/80 px-5 py-2 flex items-center justify-between gap-3 flex-wrap shrink-0 bg-slate-950/60">
        {/* Grupo Esquerdo: Responder, Responder a Todos, Encaminhar */}
        <div className="flex items-center flex-wrap gap-2">
          {onBackToList && (
            <button
              type="button"
              onClick={onBackToList}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
              title="Voltar para a lista de e-mails"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span>Voltar</span>
            </button>
          )}

          <button
            onClick={() => onReply(email)}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
          >
            <Reply className="w-3.5 h-3.5 shrink-0 text-brand-400" />
            <span>{email.folder === 'drafts' ? 'Continuar editando' : 'Responder'}</span>
          </button>

          {onReplyAll && (
            <button
              onClick={() => onReplyAll(email)}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
            >
              <ReplyAll className="w-3.5 h-3.5 shrink-0 text-sky-400" />
              <span>Responder a Todos</span>
            </button>
          )}

          {onForward && (
            <button
              onClick={() => onForward(email)}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
            >
              <Forward className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
              <span>Encaminhar</span>
            </button>
          )}
        </div>

        {/* Grupo Central: Arquivar, Excluir, Imprimir, Spam, Adiar (Ícone acima + texto abaixo, mantendo as cores) */}
        <div className="flex items-center flex-wrap gap-1.5">
          <button
            onClick={() => onArchive(email.id)}
            className="flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 min-w-[54px] text-[11px] font-medium whitespace-nowrap text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
          >
            <Archive className="w-4 h-4 shrink-0 text-teal-400" />
            <span>Arquivar</span>
          </button>

          <button
            onClick={() => onDelete(email.id)}
            className="flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 min-w-[54px] text-[11px] font-medium whitespace-nowrap text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-colors"
          >
            <Trash2 className="w-4 h-4 shrink-0 text-rose-400" />
            <span>Excluir</span>
          </button>

          <button
            onClick={handlePrintEmail}
            disabled={isPrinting}
            title="Imprimir e-mail ou salvar em PDF"
            className="flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 min-w-[54px] text-[11px] font-medium whitespace-nowrap text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors disabled:opacity-60"
          >
            <Printer className="w-4 h-4 shrink-0 text-cyan-400" />
            <span>{isPrinting ? '...' : 'Imprimir'}</span>
          </button>

          {email.folder !== 'junk' && onMarkSpam && (
            <button
              onClick={() => onMarkSpam(email.id)}
              title="Marcar como Spam e mover futuros e-mails deste remetente para o Lixo Eletrônico"
              className="flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 min-w-[54px] text-[11px] font-medium whitespace-nowrap text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-xl transition-colors"
            >
              <AlertOctagon className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Spam</span>
            </button>
          )}

          {email.folder === 'junk' && onUnmarkSpam && (
            <button
              onClick={() => onUnmarkSpam(email.id)}
              title="Desmarcar como Spam e retornar para Caixa de Entrada"
              className="flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 min-w-[54px] text-[11px] font-medium whitespace-nowrap text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl transition-colors"
            >
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Não é Spam</span>
            </button>
          )}

          <button
            onClick={() => onSnooze(email.id)}
            className="flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 min-w-[54px] text-[11px] font-medium whitespace-nowrap text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
          >
            <Clock className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Adiar</span>
          </button>
        </div>

        {/* Grupo Direito: Botão "... Mais" com menu suspenso em duas colunas */}
        <div className="relative flex items-center gap-1.5">
          <button
            ref={moreBtnRef}
            type="button"
            onClick={() => {
              soundService.play('click');
              setIsPrivacyPopoverOpen(false);
              setIsMoreMenuOpen((prev) => !prev);
            }}
            className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border rounded-xl transition-colors ${
              isMoreMenuOpen
                ? 'text-white bg-slate-800 border-slate-700'
                : 'text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border-slate-800'
            }`}
            title="Mais ações"
          >
            <MoreHorizontal className="w-4 h-4 shrink-0 text-violet-400" />
            <span>Mais</span>
          </button>

          {isMoreMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-[80]"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsMoreMenuOpen(false);
                }}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1.5 z-[85] w-[280px] rounded-xl bg-slate-900 border border-slate-700/90 shadow-2xl p-2.5 animate-in fade-in duration-150"
              >
                <div className="grid grid-cols-2 gap-2">
                  {/* Coluna Esquerda: Tarefa, Ler depois, Importante, Privacidade */}
                  <div className="flex flex-col gap-1.5">
                    {onToggleTask && (
                      <button
                        type="button"
                        onClick={() => {
                          onToggleTask(email.id);
                          setIsMoreMenuOpen(false);
                        }}
                        title={email.isTask ? 'Remover das Tarefas' : 'Marcar como Tarefa'}
                        className={`flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap border rounded-lg transition-colors ${
                          email.isTask
                            ? 'text-emerald-300 bg-emerald-500/20 border-emerald-500/40'
                            : 'text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800 border-slate-800'
                        }`}
                      >
                        <CheckSquare className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                        <span>Tarefa</span>
                      </button>
                    )}

                    {onToggleReadingList && (
                      <button
                        type="button"
                        onClick={() => {
                          onToggleReadingList(email.id);
                          setIsMoreMenuOpen(false);
                        }}
                        title={email.isReadingList ? 'Remover da Lista de leitura' : 'Adicionar à Lista de leitura'}
                        className={`flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap border rounded-lg transition-colors ${
                          email.isReadingList
                            ? 'text-sky-300 bg-sky-500/20 border-sky-500/40'
                            : 'text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800 border-slate-800'
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                        <span>Ler depois</span>
                      </button>
                    )}

                    {onToggleImportant && (
                      <button
                        type="button"
                        onClick={() => {
                          onToggleImportant(email.id);
                          setIsMoreMenuOpen(false);
                        }}
                        title={email.isImportant ? 'Remover marcação Importante' : 'Marcar como Importante'}
                        className={`flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap border rounded-lg transition-colors ${
                          email.isImportant
                            ? 'text-amber-300 bg-amber-500/20 border-amber-500/40'
                            : 'text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800 border-slate-800'
                        }`}
                      >
                        <Tag className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                        <span>Importante</span>
                      </button>
                    )}

                    {onChangePrivacySetting && (
                      <button
                        ref={privacyBtnRef}
                        type="button"
                        onClick={() => {
                          soundService.play('pop');
                          const anchorEl = moreBtnRef.current || privacyBtnRef.current;
                          if (anchorEl) {
                            const rect = anchorEl.getBoundingClientRect();
                            const popoverWidth = 288;
                            const margin = 12;
                            let left = rect.right - popoverWidth;
                            if (left < margin) left = rect.left;
                            if (left + popoverWidth > window.innerWidth - margin) {
                              left = Math.max(margin, window.innerWidth - popoverWidth - margin);
                            }
                            setPrivacyPopoverPos({
                              top: rect.bottom + 8,
                              left,
                            });
                          }
                          setIsMoreMenuOpen(false);
                          setIsPrivacyPopoverOpen(true);
                        }}
                        title="Escudo de Privacidade Anectta (Imagens, Remetentes e Pixels de Rastreamento)"
                        className={`flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap border rounded-lg transition-all ${
                          isPrivacyPopoverOpen || blockTrackingPixels || blockExternalImages
                            ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30'
                            : 'text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800 border-slate-800'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                        <span>Privacidade</span>
                      </button>
                    )}
                  </div>

                  {/* Coluna Direita: Exportar .EML, (espaço / Mover para...), Expandir */}
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        handleExportEml();
                      }}
                      disabled={isExportingEml}
                      className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-brand-400 hover:text-white bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 rounded-lg transition-all"
                      title="Exportar mensagem no formato aberto padrão RFC 822 (.EML)"
                    >
                      <FileDown className="w-3.5 h-3.5 shrink-0 text-brand-400" />
                      <span>{isExportingEml ? 'Exportando...' : 'Exportar .EML'}</span>
                    </button>

                    {onMoveToFolder && customFolders.length > 0 ? (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            onMoveToFolder(email.id, e.target.value as MailFolder);
                            setIsMoreMenuOpen(false);
                          }
                        }}
                        title="Mover e-mail para pasta"
                        className="px-2 py-1.5 text-xs font-medium text-slate-300 bg-slate-950/80 hover:bg-slate-800 border border-slate-800 rounded-lg focus:outline-none focus:border-brand-500 cursor-pointer"
                      >
                        <option value="" disabled>
                          Mover para...
                        </option>
                        <option value="inbox">Caixa de Entrada</option>
                        {customFolders.map((cf) => (
                          <option key={cf.id} value={cf.id}>
                            {cf.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="h-[30px]" aria-hidden="true" />
                    )}

                    {!isModalMode && onExpandModal && (
                      <button
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          onExpandModal();
                        }}
                        className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
                        title="Abrir e-mail inteiro em caixa expandida"
                      >
                        <Maximize2 className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                        <span>Expandir</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {isPrivacyPopoverOpen && onChangePrivacySetting && (
            <>
              <div
                className="fixed inset-0 z-[90]"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsPrivacyPopoverOpen(false);
                }}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ top: privacyPopoverPos.top, left: privacyPopoverPos.left }}
                className="fixed z-[100] w-72 rounded-xl bg-slate-900 border border-slate-700/90 shadow-2xl p-3 space-y-2.5 text-left animate-in fade-in duration-150"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Escudo de Privacidade</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPrivacyPopoverOpen(false)}
                    className="text-slate-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                </div>

                {/* Switch 1: Bloquear Imagens Remotas */}
                <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                  <div className="flex items-center space-x-2 min-w-0">
                    <ImageOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-xs font-medium text-slate-200 truncate">
                      Bloquear imagens
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={blockExternalImages}
                    onClick={() =>
                      onChangePrivacySetting('blockExternalImages', !blockExternalImages)
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ${
                      blockExternalImages ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition duration-200 ${
                        blockExternalImages ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Switch 2: Bloquear Remetentes */}
                <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                  <div className="flex items-center space-x-2 min-w-0">
                    <UserX className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="text-xs font-medium text-slate-200 truncate">
                      Bloquear remetentes
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={blockBlockedSenders}
                    onClick={() =>
                      onChangePrivacySetting('blockBlockedSenders', !blockBlockedSenders)
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ${
                      blockBlockedSenders ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition duration-200 ${
                        blockBlockedSenders ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Switch 3: Bloquear Pixels de Rastreamento */}
                <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                  <div className="flex items-center space-x-2 min-w-0">
                    <EyeOff className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="text-xs font-medium text-slate-200 truncate">
                      Bloquear pixels espiões
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={blockTrackingPixels}
                    onClick={() =>
                      onChangePrivacySetting('blockTrackingPixels', !blockTrackingPixels)
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ${
                      blockTrackingPixels ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition duration-200 ${
                        blockTrackingPixels ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="text-[10px] text-slate-400 leading-snug pt-0.5">
                  Seus e-mails ficam armazenados localmente no seu computador.
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Email Content Area with Clean Scroll */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5 custom-scroll">
        {/* Email Header */}
        <div className="space-y-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-start justify-between">
            <h1 className="text-xl font-bold text-slate-100 tracking-tight leading-snug max-w-2xl">
              {email.subject}
            </h1>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-brand-500/15 text-brand-400 border border-brand-500/30">
                {email.priority === 'high' ? 'Prioridade Alta' : 'Normal'}
              </span>
              {((email.trackingEnabled || email.requestReadReceipt) &&
                (email.folder === 'sent' || (email.recipientTracking && email.recipientTracking.length > 0))) && (
                (() => {
                  const trackingList =
                    email.recipientTracking && email.recipientTracking.length > 0
                      ? email.recipientTracking
                      : String(email.recipient || '')
                          .split(/[;,]/)
                          .map((r) => r.trim())
                          .filter(Boolean)
                          .map((raw) => {
                            const emailMatch = raw.match(/<([^>]+)>/) || raw.match(/([^\s<>]+@[^\s<>]+)/);
                            const addr = (emailMatch ? emailMatch[1] : raw).trim();
                            const cleanName = raw.replace(/<[^>]+>/g, '').replace(/["']/g, '').trim();
                            return {
                              name: cleanName && cleanName !== addr ? cleanName : addr.split('@')[0] || addr,
                              email: addr,
                              status: 'delivered' as const,
                            };
                          });
                  if (trackingList.length === 0) return null;
                  const openedCount = trackingList.filter((t) => t.status === 'opened').length;
                  const isAnyOpened = openedCount > 0;

                  return (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          soundService.play('pop');
                          setIsTrackingOpen((v) => !v);
                        }}
                        title={
                          isAnyOpened
                            ? `Aberto por ${openedCount}/${trackingList.length} destinatário(s)`
                            : 'Ver status de leitura por destinatário'
                        }
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border transition-all ${
                          isTrackingOpen
                            ? 'bg-sky-500/25 text-sky-300 border-sky-500/50 shadow-sm'
                            : isAnyOpened
                            ? 'bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/25'
                            : 'bg-slate-900 text-slate-400 border-slate-700/80 hover:text-slate-200'
                        }`}
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>
                          {isAnyOpened
                            ? `Lido (${openedCount}/${trackingList.length})`
                            : 'Status de Leitura'}
                        </span>
                      </button>

                      {isTrackingOpen && (
                        <div className="absolute right-0 top-full mt-2 z-40 w-72 rounded-xl bg-slate-900 border border-slate-700/90 shadow-2xl overflow-hidden text-left animate-in fade-in duration-150">
                          <div className="px-3.5 py-2.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between text-xs font-bold text-slate-200">
                            <span>Destinatários</span>
                            <span>Abertura</span>
                          </div>
                          <div className="divide-y divide-slate-800/70 max-h-56 overflow-y-auto custom-scroll">
                            {trackingList.map((rec, idx) => (
                              <div
                                key={`${rec.email}-${idx}`}
                                className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-200 truncate">
                                    {rec.name}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono truncate">
                                    {rec.email}
                                  </div>
                                </div>
                                {rec.status === 'opened' ? (
                                  <span className="inline-flex items-center space-x-1 text-xs font-bold font-mono text-emerald-400 shrink-0">
                                    <CheckCheck className="w-3.5 h-3.5" />
                                    <span>{rec.openedAt || 'Lido'}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center space-x-1 text-[11px] font-medium text-slate-400 shrink-0">
                                    <Clock className="w-3 h-3 text-slate-500" />
                                    <span>Aguardando</span>
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
              <span className="text-xs text-slate-500 font-mono">
                {formatReceivedLabel(email)}
              </span>
            </div>
          </div>

          {/* Banner de Solicitação de Confirmação de Leitura (para e-mails recebidos que solicitaram recibo) */}
          {email.folder !== 'sent' &&
            email.readReceiptRequestedBy &&
            (email.readReceiptSent || !dismissedReceiptIds[email.id]) && (
              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center space-x-2 text-xs text-sky-200">
                  <CheckCheck className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>
                    {email.readReceiptSent
                      ? 'Confirmação de leitura enviada.'
                      : 'O remetente solicitou a confirmação de leitura deste email.'}
                  </span>
                </div>
                {!email.readReceiptSent && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isSendingReceipt}
                      onClick={() => handleDismissReceipt(email.id)}
                      className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 border border-slate-700 text-xs font-semibold transition-colors shrink-0"
                    >
                      Cancelar
                    </button>
                    {onSendReadReceipt && (
                      <button
                        type="button"
                        disabled={isSendingReceipt}
                        onClick={async () => {
                          setIsSendingReceipt(true);
                          try {
                            await onSendReadReceipt(email);
                          } finally {
                            setIsSendingReceipt(false);
                          }
                        }}
                        className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors shrink-0"
                      >
                        {isSendingReceipt ? 'Enviando...' : 'Confirmar Leitura'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

          {/* Sender & Recipient Profile */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center space-x-3.5 min-w-0">
              <SenderAvatar
                name={email.sender}
                email={email.senderEmail || email.sender}
                avatar={email.avatar}
                size={46}
              />
              <div className="min-w-0">
                <div className="flex items-center space-x-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-200">
                    {email.sender}
                  </span>
                  <span className="text-xs text-slate-500">
                    &lt;{email.senderEmail}&gt;
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  Para:{' '}
                  <span className="text-slate-300 font-medium">
                    {email.recipient}
                  </span>
                </div>
              </div>
            </div>

            {email.senderEmail && onAddContact && (
              isSenderSaved ? (
                <span
                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0"
                  title="Remetente já cadastrado nos seus Contatos"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Nos Contatos</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    soundService.play('click');
                    onAddContact({
                      name: email.sender || email.senderEmail,
                      email: email.senderEmail,
                    });
                  }}
                  title={`Salvar ${email.senderEmail} nos seus Contatos`}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-brand-500/15 hover:bg-brand-500/25 text-brand-300 border border-brand-500/30 transition-colors cursor-pointer shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Incluir nos Contatos</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Physical Attachments Strip (se o e-mail contiver anexos reais) */}
        {(() => {
          const realAttachments = filterRealAttachments(email.attachments, email.bodyHtml);
          if (realAttachments.length === 0) return null;

          return (
            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 max-w-3xl space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1.5 font-semibold text-slate-300">
                  <Paperclip className="w-3.5 h-3.5 text-brand-400" />
                  <span>Anexos Recebidos ({realAttachments.length})</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  Clique para abrir ou salvar no seu computador
                </span>
              </div>

              {attachmentToast && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-center space-x-2 animate-in fade-in ${
                    attachmentToast.error
                      ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                      : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  }`}
                >
                  {attachmentToast.error ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  <span className="truncate">{attachmentToast.text}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                {realAttachments.map((att, idx) => {
                  const isOpening = openingAttId === (att.id || att.name);
                  return (
                    <div
                      key={att.id || idx}
                      onClick={() => handleOpenAttachment(att)}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-brand-500/70 hover:bg-slate-900/90 transition-all text-xs cursor-pointer group shadow-sm"
                      title={`Clique para abrir "${att.name}"`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:border-brand-500/40 transition-all">
                          {isOpening ? (
                            <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
                          ) : (
                            getAttachmentIcon(att.name)
                          )}
                        </div>
                        <div className="truncate">
                          <p className="font-semibold text-white truncate group-hover:text-brand-300 transition-colors">
                            {att.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {att.size ? `${Math.round(att.size / 1024)} KB` : 'Anexo'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        {att.path ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenAttachment(att);
                              }}
                              className="px-2 py-1 rounded-md bg-brand-600/20 hover:bg-brand-600 text-brand-300 hover:text-white border border-brand-500/30 flex items-center space-x-1 text-[11px] font-medium transition-colors"
                              title="Abrir anexo com aplicativo padrão"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Abrir</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleSaveAttachment(att, e)}
                              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                              title="Salvar como..."
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleShowInFolder(att, e)}
                              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                              title="Mostrar na pasta do Windows"
                            >
                              <Folder className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-500">Indisponível</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* EML Toast Notification */}
        {emlToast && (
          <div className="p-3 bg-brand-500/10 border border-brand-500/30 text-brand-300 rounded-xl text-xs flex items-center space-x-2 animate-in fade-in max-w-3xl">
            <CheckCircle className="w-4 h-4 text-brand-400 shrink-0" />
            <span>{emlToast}</span>
          </div>
        )}

        {/* Email Body (Renderiza HTML sanitizado com CSS inline ou texto plano) */}
        {email.bodyHtml ? (() => {
          const allowImages = Boolean(revealedImagesEmailIds[email.id]);
          const { html: sanitizedHtml, blockedImagesCount, blockedPixelsCount } = sanitizeEmailHtml(email.bodyHtml, {
            blockTrackingPixels,
            blockExternalImages: blockExternalImages && !allowImages,
          });
          return (
            <div className="space-y-2">
              {blockedPixelsCount > 0 && (
                <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-200 ${isModalMode ? 'max-w-none' : 'max-w-3xl'}`}>
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>Escudo Anectta:</strong> {blockedPixelsCount} {blockedPixelsCount === 1 ? 'pixel espião de rastreamento neutralizado' : 'pixels espiões de rastreamento neutralizados'} nesta mensagem.
                    </span>
                  </div>
                </div>
              )}
              {blockedImagesCount > 0 && (
                <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200 ${isModalMode ? 'max-w-none' : 'max-w-3xl'}`}>
                  <div className="flex items-center space-x-2">
                    <ImageIcon className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      {blockedImagesCount} {blockedImagesCount === 1 ? 'imagem externa bloqueada' : 'imagens externas bloqueadas'} para sua privacidade.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setRevealedImagesEmailIds((prev) => ({ ...prev, [email.id]: true }))
                    }
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-100 font-medium shrink-0 transition-colors"
                  >
                    Exibir imagens
                  </button>
                </div>
              )}
              <div
                onClick={(e) => {
                  const target = e.target as HTMLElement | null;
                  const anchor = target?.closest('a');
                  if (!anchor) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const rawHref = (anchor.getAttribute('href') || '').trim();
                  if (!rawHref || rawHref.startsWith('#') || rawHref.toLowerCase().startsWith('javascript:')) {
                    return;
                  }
                  if (/^(https?:|mailto:)/i.test(rawHref)) {
                    if (window.electronAPI?.openExternal) {
                      void window.electronAPI.openExternal(rawHref);
                    } else {
                      window.open(rawHref, '_blank', 'noopener,noreferrer');
                    }
                  }
                }}
                style={{
                  backgroundColor: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-subtle)',
                }}
                className={`compose-message-canvas text-sm leading-relaxed font-sans ${isModalMode ? 'max-w-none' : 'max-w-3xl'} rounded-xl overflow-x-auto border shadow-md p-4`}
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
            </div>
          );
        })() : (
          <div
            style={{
              backgroundColor: 'var(--bg-app)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-subtle)',
            }}
            className={`compose-message-canvas text-sm leading-relaxed whitespace-pre-wrap font-sans ${isModalMode ? 'max-w-none' : 'max-w-3xl'} rounded-xl border p-4`}
          >
            {email.body}
          </div>
        )}

        {/* Quick Inline Reply Box with AI suggestions */}
        <div className="pt-6 border-t border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300">
              Resposta Rápida para {email.sender.split(' ')[0]}
            </span>
            {replySentSuccess && (
              <span className="text-emerald-400 font-medium flex items-center space-x-1">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>E-mail enviado com sucesso!</span>
              </span>
            )}
          </div>

          {/* AI Quick Reply Chips */}
          {quickReplies.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center space-x-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>Sugestões de Resposta Inteligente (1 clique para preencher):</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    soundService.play('pop');
                    setIsCustomizingReplies(true);
                  }}
                  className="flex items-center space-x-1 text-slate-400 hover:text-brand-300 hover:bg-slate-900 px-2 py-0.5 rounded-lg border border-transparent hover:border-slate-800 transition-all font-medium"
                  title="Personalizar minhas respostas rápidas"
                >
                  <SlidersHorizontal className="w-3 h-3 text-brand-400" />
                  <span>Personalizar</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {quickReplies.map((reply, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setInlineReplyText(reply)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-brand-500/40 text-[11px] transition-all text-left shadow-sm"
                  >
                    "{reply}"
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="relative">
            <textarea
              rows={3}
              value={inlineReplyText}
              onChange={(e) => setInlineReplyText(e.target.value)}
              placeholder="Digite sua resposta corporativa ou clique em uma sugestão acima..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-slate-500 font-mono">
                Pressione Responder para editor avançado
              </span>
              <button
                onClick={handleSendQuickReply}
                disabled={isSendingReply || !inlineReplyText.trim()}
                className="flex items-center space-x-2 px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white font-medium text-xs rounded-lg transition-all disabled:opacity-50 disabled:pointer-events-none shadow-sm shadow-brand-600/30"
              >
                {isSendingReply ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Enviar</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Personalização de Respostas Rápidas */}
      <CustomizeQuickRepliesModal
        isOpen={isCustomizingReplies}
        onClose={() => setIsCustomizingReplies(false)}
        onSaved={(updated) => setQuickReplies(updated)}
      />
    </main>
  );
};
