import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Paperclip,
  AlertCircle,
  FileText,
  Download,
  AlertTriangle,
  Plus,
  Rocket,
  Shield,
  Zap,
  Clock,
  Trash2,
  CheckCheck,
  Smile,
} from 'lucide-react';
import { PriorityLevel } from '@/types/email';
import {
  AccountSettings,
  EmailSignature,
  ConfirmationSettings,
  DEFAULT_CONFIRMATION_SETTINGS,
} from '@/types/settings';
import { RecentFileItem } from '../../types/electron';
import { EmailSending } from './animated-icons';
import { CorporateContact } from './ContactsView';
import {
  OutgoingAnimationType,
  compileToInlineHtml,
} from '../services/stationeryCompiler';

const EMOJI_CATEGORIES: Array<{ id: string; label: string; icon: string; emojis: string[] }> = [
  {
    id: 'faces',
    label: 'Expressões',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
      '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘',
      '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭',
      '🤔', '😐', '😑', '😶', '😏', '😒', '🙄', '😬',
      '😌', '😔', '😪', '😴', '😷', '🤒', '🤕', '🤢',
      '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎',
      '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲',
      '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢',
      '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫',
      '😤', '😡', '😠', '🤬', '😈', '💀', '👻', '🤖',
    ],
  },
  {
    id: 'gestures',
    label: 'Gestos',
    icon: '👍',
    emojis: [
      '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙',
      '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️',
      '🖖', '👋', '🤝', '🙏', '✍️', '💪', '👏', '🙌',
      '👐', '🤲', '🫶', '❤️‍🔥', '👀', '🧠', '🗣️', '👤',
    ],
  },
  {
    id: 'work',
    label: 'Trabalho',
    icon: '💼',
    emojis: [
      '💼', '📁', '📂', '📄', '📝', '📌', '📍', '📎',
      '📅', '📆', '⏰', '⏳', '📧', '📨', '📩', '📤',
      '📊', '📈', '📉', '💻', '🖥️', '📱', '☎️', '🔒',
      '🔑', '🛠️', '⚙️', '💡', '🔍', '🎯', '🏆', '🚀',
    ],
  },
  {
    id: 'symbols',
    label: 'Símbolos',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '✅', '☑️', '✔️', '❌', '⚠️', '❗', '❓', '💯',
      '🔥', '⭐', '🌟', '✨', '🎉', '🎊', '👏', '🔔',
      '➡️', '⬅️', '⬆️', '⬇️', '🔄', '➕', '➖', '💬',
    ],
  },
];

interface EmailSnippet {
  id: string;
  title: string;
  content: string;
}

const SNIPPETS_STORAGE_KEY = 'anectta_mail_snippets_v1';

const DEFAULT_SNIPPETS: EmailSnippet[] = [
  {
    id: 'snip-1',
    title: 'Confirmação de Recebimento',
    content: 'Olá,\n\nConfirmo o recebimento da sua mensagem e dos documentos encaminhados. Retornarei em breve com os próximos passos.\n\nAtenciosamente,',
  },
  {
    id: 'snip-2',
    title: 'Agendar Reunião',
    content: 'Olá,\n\nPodemos agendar uma breve reunião para alinharmos os detalhes? Por favor, me informe os melhores horários na sua agenda.\n\nAtenciosamente,',
  },
  {
    id: 'snip-3',
    title: 'Encaminhando Documento',
    content: 'Olá,\n\nSegue em anexo o documento solicitado para sua análise e validação.\n\nFico à disposição para qualquer dúvida.',
  },
];

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (email: {
    recipient: string;
    subject: string;
    body: string;
    html?: string;
    signature?: string;
    stationery?: string;
    priority: PriorityLevel;
    fromAccountId?: string;
    attachments?: Array<{ name: string; path: string; size: number }>;
    scheduledAt?: number;
    trackingEnabled?: boolean;
    requestReadReceipt?: boolean;
  }) => Promise<void>;
  defaultRecipient?: string;
  defaultSubject?: string;
  defaultBody?: string;
  accounts?: AccountSettings[];
  activeAccountId?: string;
  signatures?: EmailSignature[];
  contacts?: CorporateContact[];
  /** Salvamento automático do rascunho (local). */
  draftAutoSaveEnabled?: boolean;
  draftAutoSaveMinutes?: number;
  spellCheckEnabled?: boolean;
  outgoingAnimation?: OutgoingAnimationType;
  /** Id do rascunho em edição (se foi aberto da pasta Rascunhos). */
  draftId?: string;
  draftAttachments?: Array<{ name: string; path: string; size: number }>;
  onSaveDraft?: (draft: {
    id: string;
    recipient: string;
    subject: string;
    body: string;
    priority: PriorityLevel;
    fromAccountId?: string;
    attachments: Array<{ name: string; path: string; size: number }>;
  }) => void;
  onDiscardDraft?: (id: string) => void;
  confirmations?: ConfirmationSettings;
}

const DRAFT_STORAGE_KEY = 'anectta-compose-draft-v1';

interface StoredDraft {
  recipient: string;
  subject: string;
  body: string;
  priority: PriorityLevel;
  fromAccountId?: string;
  attachments: Array<{ name: string; path: string; size: number }>;
  savedAt: number;
}

const clearStoredDraft = () => {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {}
};

const hasVisibleSignatureContent = (html?: string): boolean => {
  if (!html) return false;
  if (/<img\b/i.test(html)) return true;
  const plain = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return plain.length > 0;
};

const resolveDefaultSignatureId = (
  accountId: string,
  accounts: AccountSettings[],
  signatures: EmailSignature[]
): string => {
  const byAccount = signatures.find(
    (s) => s.defaultAccountId === accountId && hasVisibleSignatureContent(s.html)
  );
  if (byAccount) return byAccount.id;

  const account = accounts.find((a) => a.id === accountId) || accounts[0];
  if (hasVisibleSignatureContent(account?.signature)) {
    return '__account__';
  }

  const nonEmptySignatures = signatures.filter((s) => hasVisibleSignatureContent(s.html));
  if (nonEmptySignatures.length === 1 && !nonEmptySignatures[0].defaultAccountId) {
    return nonEmptySignatures[0].id;
  }

  return 'none';
};

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  onSend,
  defaultRecipient = '',
  spellCheckEnabled = true,
  defaultSubject = '',
  defaultBody = '',
  accounts = [],
  activeAccountId = '',
  signatures = [],
  contacts = [],
  draftAutoSaveEnabled = true,
  draftAutoSaveMinutes = 3,
  outgoingAnimation = 'airplane',
  draftId,
  draftAttachments,
  onSaveDraft,
  onDiscardDraft,
  confirmations,
}) => {
  const effectiveConfirmations: ConfirmationSettings = {
    ...DEFAULT_CONFIRMATION_SETTINGS,
    ...(confirmations || {}),
  };
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('medium');
  const [fromAccountId, setFromAccountId] = useState<string>(activeAccountId);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string>('none');
  const [attachments, setAttachments] = useState<Array<{ name: string; path: string; size: number }>>([]);
  const [recentDownloads, setRecentDownloads] = useState<RecentFileItem[]>([]);
  const [showMissingAttachmentAlert, setShowMissingAttachmentAlert] = useState(false);

  // Emojis
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [activeEmojiCategory, setActiveEmojiCategory] = useState<string>('faces');
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const signaturePreviewRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // Movimento e alinhamento da logo / imagem inserida na assinatura dentro da composição
  // A assinatura flutua integrada à área de escrita e pode ser arrastada livremente
  const composeCanvasRef = useRef<HTMLDivElement | null>(null);
  const [signaturePos, setSignaturePos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingSignature, setIsDraggingSignature] = useState(false);

  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Snippets de Resposta Rápida
  const [snippets, setSnippets] = useState<EmailSnippet[]>(() => {
    try {
      const saved = localStorage.getItem(SNIPPETS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_SNIPPETS;
  });
  const [isSnippetPickerOpen, setIsSnippetPickerOpen] = useState(false);
  const [newSnippetTitle, setNewSnippetTitle] = useState('');
  const [newSnippetContent, setNewSnippetContent] = useState('');

  // Agendamento de Envio (Send Later)
  const [isSchedulePickerOpen, setIsSchedulePickerOpen] = useState(false);
  const [scheduledDateTime, setScheduledDateTime] = useState('');

  // Confirmação de Leitura & Monitoramento de Abertura por Destinatário
  const [trackingEnabled, setTrackingEnabled] = useState<boolean>(true);

  // Salvamento automático do rascunho
  const [draftNotice, setDraftNotice] = useState('');
  const draftRef = useRef<StoredDraft | null>(null);
  draftRef.current = {
    recipient,
    subject,
    body,
    priority,
    fromAccountId,
    attachments,
    savedAt: Date.now(),
  };
  const sentRef = useRef(false);
  const draftIdRef = useRef<string>('');
  const onSaveDraftRef = useRef(onSaveDraft);
  onSaveDraftRef.current = onSaveDraft;

  const saveDraftNow = (silent = false): boolean => {
    const d = draftRef.current;
    if (sentRef.current || !d || !onSaveDraftRef.current) return false;
    if (!d.recipient.trim() && !d.subject.trim() && !d.body.trim() && d.attachments.length === 0) return false;
    if (!draftIdRef.current) draftIdRef.current = `draft-${Date.now()}`;
    onSaveDraftRef.current({
      id: draftIdRef.current,
      recipient: d.recipient,
      subject: d.subject,
      body: d.body,
      priority: d.priority,
      fromAccountId: d.fromAccountId,
      attachments: d.attachments,
    });
    if (!silent) {
      setDraftNotice(
        `Rascunho salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      );
    }
    return true;
  };
  const saveDraftNowRef = useRef(saveDraftNow);
  saveDraftNowRef.current = saveDraftNow;

  // Ao abrir: define o id do rascunho; ao fechar sem enviar: salva em Rascunhos
  useEffect(() => {
    if (!isOpen) return;
    sentRef.current = false;
    draftIdRef.current = draftId || '';
    return () => {
      saveDraftNowRef.current(true);
    };
  }, [isOpen]);

  // Salvamento automático periódico
  useEffect(() => {
    if (!isOpen || !draftAutoSaveEnabled) return;
    const minutes = Math.min(60, Math.max(1, Number(draftAutoSaveMinutes) || 3));
    const timer = setInterval(() => saveDraftNowRef.current(), minutes * 60 * 1000);
    return () => clearInterval(timer);
  }, [isOpen, draftAutoSaveEnabled, draftAutoSaveMinutes]);


  useEffect(() => {
    try {
      localStorage.setItem(SNIPPETS_STORAGE_KEY, JSON.stringify(snippets));
    } catch {}
  }, [snippets]);

  const currentAccount =
    (fromAccountId && accounts.find((a) => a.id === fromAccountId)) || accounts[0];

  const baseSignatureHtml = (() => {
    if (selectedSignatureId === 'none') return '';
    if (selectedSignatureId === '__account__') return currentAccount?.signature || '';
    const found = signatures.find((s) => s.id === selectedSignatureId);
    return found && hasVisibleSignatureContent(found.html) ? found.html : '';
  })();

  const signatureDisplayHtml = /<[a-z][\s\S]*>/i.test(baseSignatureHtml)
    ? baseSignatureHtml
    : baseSignatureHtml.replace(/\n/g, '<br/>');

  // No e-mail enviado, preserva o deslocamento horizontal escolhido pelo usuário
  const activeSignatureHtml =
    baseSignatureHtml && signaturePos && signaturePos.x > 0
      ? `<div style="margin-left:${Math.round(signaturePos.x)}px">${signatureDisplayHtml}</div>`
      : baseSignatureHtml;

  useEffect(() => {
    setSignaturePos(null);
  }, [selectedSignatureId, fromAccountId, isOpen]);

  const startDragSignature = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = composeCanvasRef.current;
    const sigEl = signaturePreviewRef.current;
    if (!canvas || !sigEl || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const canvasRect = canvas.getBoundingClientRect();
    const sigRect = sigEl.getBoundingClientRect();
    const offsetX = e.clientX - sigRect.left;
    const offsetY = e.clientY - sigRect.top;
    setIsDraggingSignature(true);

    const onMove = (ev: MouseEvent) => {
      const maxX = Math.max(0, canvasRect.width - sigRect.width);
      const maxY = Math.max(0, canvasRect.height - sigRect.height);
      const x = Math.min(maxX, Math.max(0, ev.clientX - canvasRect.left - offsetX));
      const y = Math.min(maxY, Math.max(0, ev.clientY - canvasRect.top - offsetY));
      setSignaturePos({ x, y });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setIsDraggingSignature(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    if (isOpen) {
      const targetAccountId = activeAccountId || accounts[0]?.id || '';
      setRecipient(defaultRecipient);
      setSubject(defaultSubject);
      setBody(defaultBody || '');
      setFromAccountId(targetAccountId);
      setSelectedSignatureId(resolveDefaultSignatureId(targetAccountId, accounts, signatures));
      setAttachments(draftAttachments || []);
      setErrorMessage('');
      setShowMissingAttachmentAlert(false);
      setIsDispatching(false);
      setIsSending(false);
      setIsEmojiPickerOpen(false);
      setIsSnippetPickerOpen(false);
      setIsSchedulePickerOpen(false);
      setScheduledDateTime('');
      setDraftNotice(draftId ? 'Rascunho carregado' : '');

      if (window.electronAPI?.getRecentDownloads) {
        window.electronAPI
          .getRecentDownloads()
          .then((files) => setRecentDownloads(files || []))
          .catch(() => {});
      }
    }
  }, [isOpen, defaultRecipient, defaultSubject, defaultBody, activeAccountId, accounts]);

  if (!isOpen) return null;

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handlePickFiles = async () => {
    if (!window.electronAPI?.openFileDialog) return;
    try {
      const selected = await window.electronAPI.openFileDialog();
      if (selected && selected.length > 0) {
        setAttachments((prev) => {
          const existingPaths = new Set(prev.map((a) => a.path));
          const newOnes = selected.filter((s) => !existingPaths.has(s.path));
          return [...prev, ...newOnes];
        });
      }
    } catch (err: any) {
      console.warn('Erro ao abrir diálogo de arquivos:', err);
    }
  };

  const handleAddRecentDownload = (file: RecentFileItem) => {
    setAttachments((prev) => {
      if (prev.some((a) => a.path === file.path)) return prev;
      return [...prev, { name: file.name, path: file.path, size: file.size }];
    });
  };

  const handleRemoveAttachment = (filePath: string) => {
    if (effectiveConfirmations.askBeforeDeleteAttachment) {
      if (!window.confirm('Deseja realmente remover este anexo da mensagem?')) {
        return;
      }
    }
    setAttachments((prev) => prev.filter((a) => a.path !== filePath));
  };

  const handleInsertEmoji = (emoji: string) => {
    const el = bodyTextareaRef.current;
    if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = body.slice(0, start) + emoji + body.slice(end);
      setBody(next);
      requestAnimationFrame(() => {
        el.focus();
        const cursor = start + emoji.length;
        el.setSelectionRange(cursor, cursor);
      });
    } else {
      setBody((prev) => prev + emoji);
    }
  };

  const executeSend = async (scheduledAt?: number) => {
    // Dispara animação de saída escolhida antes do fechamento
    setIsDispatching(true);
    setIsSending(true);
    setErrorMessage('');

    // Compilação do HTML com CSS 100% Inline garantido para clientes de correio
    const compiledHtml = compileToInlineHtml({
      text: body,
      stationeryId: 'clean',
      senderName: currentAccount?.displayName || currentAccount?.email || 'Anectta User',
      senderEmail: currentAccount?.email || '',
      signature: activeSignatureHtml || undefined,
      subject,
    });

    try {
      // Pequeno delay suave para a animação cinematográfica decolar
      const animationDelay = scheduledAt || outgoingAnimation === 'instant' ? 150 : 900;
      await new Promise((res) => setTimeout(res, animationDelay));

      await onSend({
        recipient,
        subject,
        body,
        html: compiledHtml,
        signature: activeSignatureHtml,
        priority,
        fromAccountId,
        attachments,
        scheduledAt,
        trackingEnabled,
        requestReadReceipt: trackingEnabled,
      });
      sentRef.current = true;
      clearStoredDraft();
      if (draftIdRef.current) onDiscardDraft?.(draftIdRef.current);
      onClose();
    } catch (err: any) {
      setIsDispatching(false);
      setErrorMessage(err?.message || 'Erro ao enviar mensagem. Verifique as configurações do servidor SMTP.');
      formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSending(false);
    }
  };

  const handleInsertSnippet = (content: string) => {
    setBody((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${content}` : content));
    setIsSnippetPickerOpen(false);
  };

  const handleSaveNewSnippet = () => {
    if (!newSnippetTitle.trim() || !newSnippetContent.trim()) return;
    setSnippets((prev) => [
      ...prev,
      {
        id: `snip-${Date.now()}`,
        title: newSnippetTitle.trim(),
        content: newSnippetContent.trim(),
      },
    ]);
    setNewSnippetTitle('');
    setNewSnippetContent('');
  };

  const handleScheduleSend = async (timestampMs: number) => {
    if (!recipient.trim() || !subject.trim() || !body.trim()) {
      setErrorMessage('Por favor, preencha destinatário, assunto e mensagem antes de agendar.');
      setIsSchedulePickerOpen(false);
      return;
    }
    if (timestampMs <= Date.now()) {
      setErrorMessage('Escolha uma data e hora futura para o agendamento.');
      return;
    }
    setIsSchedulePickerOpen(false);
    await executeSend(timestampMs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !body.trim()) {
      setErrorMessage('Por favor, preencha destinatário e mensagem antes de enviar.');
      formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Aviso de assunto em branco
    if (!subject.trim()) {
      if (effectiveConfirmations.warnIfBlankSubjectOnSend) {
        if (!window.confirm('O assunto desta mensagem está em branco. Deseja enviá-la mesmo assim?')) {
          return;
        }
      }
    }

    // Aviso de tamanho máximo da mensagem
    if (effectiveConfirmations.warnOnSendMessageLargerThanEnabled) {
      const limitMb = Math.max(1, Number(effectiveConfirmations.warnOnSendMessageLargerThanMb) || 10);
      const totalBytes =
        new Blob([body || '']).size +
        attachments.reduce((acc, item) => acc + (Number(item.size) || 0), 0);
      const totalMb = totalBytes / (1024 * 1024);
      if (totalMb > limitMb) {
        if (
          !window.confirm(
            `Esta mensagem possui aproximadamente ${totalMb.toFixed(1)} MB, ultrapassando o limite configurado de ${limitMb} MB. Deseja enviar mesmo assim?`
          )
        ) {
          return;
        }
      }
    }

    // Detector de anexo esquecido
    if (effectiveConfirmations.warnOnMissingAttachmentKeyword) {
      const mentionsAttachment = /(anexo|anexei|anexado|segue anexo|em anexo|anexando|anexos)/i.test(body);
      if (mentionsAttachment && attachments.length === 0) {
        setShowMissingAttachmentAlert(true);
        formRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    await executeSend();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-200 relative max-h-[92vh]">
        {/* Outgoing Animation Cinematic Overlay */}
        {isDispatching && (
          <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-lg flex flex-col items-center justify-center animate-in fade-in duration-200">
            {outgoingAnimation === 'airplane' && (
              <div className="flex flex-col items-center space-y-4 animate-in zoom-in-95">
                <EmailSending size={88} primaryColor="#60a5fa" secondaryColor="#38bdf8" />
                <span className="text-sm font-bold text-white tracking-wide">
                  Dobrando envelope e decolando...
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Despachando via servidor seguro SMTP
                </span>
              </div>
            )}

            {outgoingAnimation === 'rocket' && (
              <div className="flex flex-col items-center space-y-4 animate-in zoom-in-95">
                <div className="w-20 h-20 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center animate-bounce">
                  <Rocket className="w-10 h-10 text-cyan-400" />
                </div>
                <span className="text-sm font-bold text-white tracking-wide">
                  Disparo Warp Speed ativado!
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Prioridade máxima de transmissão
                </span>
              </div>
            )}

            {outgoingAnimation === 'wax-seal' && (
              <div className="flex flex-col items-center space-y-4 animate-in zoom-in-95">
                <div className="w-20 h-20 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center ring-4 ring-amber-500/20">
                  <Shield className="w-10 h-10 text-amber-400" />
                </div>
                <span className="text-sm font-bold text-amber-200 tracking-wide">
                  Selo oficial de cera aplicado!
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Mensagem formal lacrada com integridade
                </span>
              </div>
            )}

            {outgoingAnimation === 'instant' && (
              <div className="flex flex-col items-center space-y-3">
                <Zap className="w-10 h-10 text-emerald-400 animate-pulse" />
                <span className="text-sm font-bold text-white tracking-wide">
                  Despacho instantâneo concluído...
                </span>
              </div>
            )}
          </div>
        )}

        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />
            <span className="text-xs font-bold text-slate-100 tracking-wide uppercase">
              Nova Mensagem
            </span>
          </div>
          <div className="flex items-center space-x-2">
            {onSaveDraft && (
              <button
                type="button"
                onClick={() => {
                  if (saveDraftNow()) onClose();
                  else setErrorMessage('Nada para salvar: preencha ao menos um campo.');
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
              >
                Salvar em Rascunhos
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="p-5 space-y-3 overflow-y-auto custom-scroll flex-1">
          {draftNotice && !errorMessage && (
            <div className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>{draftNotice}</span>
              <button
                type="button"
                onClick={() => {
                  clearStoredDraft();
                  if (draftIdRef.current) onDiscardDraft?.(draftIdRef.current);
                  setRecipient('');
                  setSubject('');
                  setBody('');
                  setAttachments([]);
                  setDraftNotice('Rascunho descartado');
                }}
                className="text-rose-400 hover:text-rose-300 underline"
              >
                Descartar
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="break-words">{errorMessage}</span>
            </div>
          )}

          {/* Missing Attachment Alert Banner */}
          {showMissingAttachmentAlert && (
            <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex flex-col space-y-2 animate-in fade-in">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-semibold text-amber-300">
                  Detector Inteligente: Você mencionou anexos na mensagem!
                </span>
              </div>
              <p className="text-[11px] text-amber-200/90">
                O corpo do e-mail contém termos como "anexo", porém nenhum arquivo foi anexado. Deseja selecionar um arquivo agora ou enviar mesmo assim?
              </p>
              <div className="flex items-center space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowMissingAttachmentAlert(false);
                    handlePickFiles();
                  }}
                  className="px-3 py-1 bg-amber-500/30 hover:bg-amber-500/40 border border-amber-500/50 rounded-lg text-amber-100 font-medium text-xs transition-colors flex items-center space-x-1"
                >
                  <Paperclip className="w-3 h-3" />
                  <span>Anexar Arquivo Agora</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMissingAttachmentAlert(false);
                    executeSend();
                  }}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
                >
                  Enviar Sem Anexo
                </button>
              </div>
            </div>
          )}

          {/* From Account Selector */}
          {accounts.length > 0 && (
            <div className="flex items-center border-b border-slate-800 pb-2">
              <span className="w-16 text-xs text-slate-400 font-medium">De:</span>
              <select
                value={fromAccountId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setFromAccountId(nextId);
                  setSelectedSignatureId(resolveDefaultSignatureId(nextId, accounts, signatures));
                }}
                className="flex-1 bg-slate-900 text-xs text-slate-100 focus:outline-none font-mono cursor-pointer"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id} className="bg-slate-900 text-slate-100">
                    {acc.displayName ? `${acc.displayName} <${acc.email}>` : acc.email} (
                    {(acc.incomingServer?.protocol || 'imap').toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Recipient */}
          <div className="flex items-center border-b border-slate-800 pb-2 gap-2">
            <span className="w-16 text-xs text-slate-400 font-medium shrink-0">Para:</span>
            <input
              type="text"
              list="anectta-contacts-datalist"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="destinatario@empresa.com"
              className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-600 focus:outline-none font-mono"
            />
            {contacts.length > 0 && (
              <>
                <datalist id="anectta-contacts-datalist">
                  {contacts.map((c) => (
                    <option key={c.id || c.email} value={c.email}>
                      {c.name ? `${c.name} <${c.email}>` : c.email}
                    </option>
                  ))}
                </datalist>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      setRecipient(e.target.value);
                    }
                  }}
                  title="Selecionar contato salvo"
                  className="bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700 rounded px-2 py-1 focus:outline-none focus:border-brand-500 cursor-pointer max-w-[160px]"
                >
                  <option value="" disabled>
                    Contatos...
                  </option>
                  {contacts.map((c) => (
                    <option key={c.id || c.email} value={c.email} className="bg-slate-900 text-slate-100">
                      {c.name ? `${c.name} (${c.email})` : c.email}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {/* Subject */}
          <div className="flex items-center border-b border-slate-800 pb-2">
            <span className="w-16 text-xs text-slate-400 font-medium">Assunto:</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Assunto do e-mail..."
              className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
            />
          </div>

          {/* Barra de Recursos da Mensagem */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <div className="flex items-center space-x-2">
              {/* Emojis */}
              <button
                type="button"
                onClick={() => {
                  setIsEmojiPickerOpen(!isEmojiPickerOpen);
                  setIsSnippetPickerOpen(false);
                }}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                  isEmojiPickerOpen
                    ? 'bg-brand-600 text-white border-brand-500 shadow-sm'
                    : 'bg-slate-900 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
                }`}
                title="Inserir emoji na mensagem"
              >
                <Smile className="w-3.5 h-3.5 text-amber-400" />
                <span>Emojis</span>
              </button>

              {/* Snippets de Resposta Rápida */}
              <button
                type="button"
                onClick={() => {
                  setIsSnippetPickerOpen(!isSnippetPickerOpen);
                  setIsEmojiPickerOpen(false);
                }}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                  isSnippetPickerOpen
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                    : 'bg-slate-900 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
                }`}
                title="Inserir resposta rápida (Snippet) ou criar novo modelo de texto"
              >
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>Snippets ({snippets.length})</span>
              </button>

              {/* Monitoramento de Abertura e Confirmação de Leitura */}
              <button
                type="button"
                onClick={() => setTrackingEnabled((v) => !v)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                  trackingEnabled
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                }`}
                title="Rastrear abertura e solicitar confirmação de leitura por destinatário"
              >
                <CheckCheck className={`w-3.5 h-3.5 ${trackingEnabled ? 'text-sky-400' : 'text-slate-500'}`} />
                <span>Rastrear Leitura</span>
              </button>
            </div>

            {/* Priority Selector */}
            <div className="flex items-center space-x-1.5">
              <span className="text-[11px] text-slate-400 mr-1">Prioridade:</span>
              {(['low', 'medium', 'high'] as PriorityLevel[]).map((lvl) => (
                <button
                  type="button"
                  key={lvl}
                  onClick={() => setPriority(lvl)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all border ${
                    priority === lvl
                      ? lvl === 'high'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : lvl === 'medium'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                      : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                  }`}
                >
                  {lvl === 'high' ? 'Alta' : lvl === 'medium' ? 'Média' : 'Baixa'}
                </button>
              ))}
            </div>
          </div>

          {/* Emoji Picker Popover Drawer */}
          {isEmojiPickerOpen && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                <div className="flex items-center gap-1 flex-wrap">
                  {EMOJI_CATEGORIES.map((cat) => (
                    <button
                      type="button"
                      key={cat.id}
                      onClick={() => setActiveEmojiCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all ${
                        activeEmojiCategory === cat.id
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setIsEmojiPickerOpen(false)}
                  className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800"
                  title="Fechar painel de emojis"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-8 sm:grid-cols-12 gap-1 max-h-44 overflow-y-auto custom-scroll pr-1">
                {(EMOJI_CATEGORIES.find((c) => c.id === activeEmojiCategory) || EMOJI_CATEGORIES[0]).emojis.map(
                  (emoji, idx) => (
                    <button
                      type="button"
                      key={`${activeEmojiCategory}-${idx}`}
                      onClick={() => handleInsertEmoji(emoji)}
                      className="h-8 rounded-lg hover:bg-slate-800 active:scale-95 flex items-center justify-center text-lg transition-transform cursor-pointer"
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/* Snippets Popover Drawer */}
          {isSnippetPickerOpen && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Snippets de Resposta Rápida (1 clique para inserir)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsSnippetPickerOpen(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Fechar
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto custom-scroll">
                {snippets.map((snip) => (
                  <div
                    key={snip.id}
                    className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition-all flex flex-col justify-between gap-1.5 group"
                  >
                    <button
                      type="button"
                      onClick={() => handleInsertSnippet(snip.content)}
                      className="text-left flex-1"
                    >
                      <div className="text-xs font-semibold text-emerald-300 truncate">{snip.title}</div>
                      <div className="text-[10px] text-slate-400 line-clamp-2 mt-0.5">{snip.content}</div>
                    </button>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (effectiveConfirmations.askBeforeDeleteTextTemplate) {
                            if (!window.confirm(`Deseja realmente apagar o modelo de texto "${snip.title}"?`)) {
                              return;
                            }
                          }
                          setSnippets((prev) => prev.filter((s) => s.id !== snip.id));
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded"
                        title="Excluir snippet"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newSnippetTitle}
                  onChange={(e) => setNewSnippetTitle(e.target.value)}
                  placeholder="Título do novo snippet..."
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  value={newSnippetContent}
                  onChange={(e) => setNewSnippetContent(e.target.value)}
                  placeholder="Texto da resposta rápida..."
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleSaveNewSnippet}
                  disabled={!newSnippetTitle.trim() || !newSnippetContent.trim()}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  + Salvar Snippet
                </button>
              </div>
            </div>
          )}

          {/* Body Textarea + Assinatura Unificada no Corpo da Mensagem (Cor de fundo sempre fiel ao skin escolhido) */}
          <div
            style={{
              backgroundColor: 'var(--bg-app)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            ref={composeCanvasRef}
            className="compose-message-canvas relative rounded-xl p-3 border transition-all flex flex-col min-h-[280px]"
          >
            <textarea
              ref={bodyTextareaRef}
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  if (effectiveConfirmations.askBeforeSendOnCtrlEnter) {
                    if (!window.confirm('Deseja enviar esta mensagem agora (Ctrl+Enter)?')) {
                      return;
                    }
                  }
                  void handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              spellCheck={spellCheckEnabled}
              placeholder="Escreva sua mensagem..."
              style={{
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
              }}
              className="compose-message-field w-full flex-1 min-h-[250px] bg-transparent border-0 text-xs focus:outline-none resize-none font-sans leading-relaxed custom-scroll"
              required
            />

            {signatureDisplayHtml && (
              <div
                ref={signaturePreviewRef}
                onMouseDown={startDragSignature}
                onDragStart={(e) => e.preventDefault()}
                title="Arraste para mover a assinatura"
                style={{
                  color: 'var(--text-primary)',
                  position: 'absolute',
                  ...(signaturePos
                    ? { left: signaturePos.x, top: signaturePos.y }
                    : { left: 12, bottom: 12 }),
                  cursor: isDraggingSignature ? 'grabbing' : 'grab',
                }}
                className="text-xs select-none max-w-[90%] z-10 [&_img]:pointer-events-none"
                dangerouslySetInnerHTML={{ __html: signatureDisplayHtml }}
              />
            )}
            {isDraggingSignature && <div className="fixed inset-0 z-50 cursor-grabbing" />}
          </div>

          {/* Anexos Inteligentes: Downloads Recentes */}
          {recentDownloads.length > 0 && (
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center space-x-1.5 font-medium text-slate-300">
                  <Download className="w-3.5 h-3.5 text-brand-400" />
                  <span>Anexos Inteligentes (Arquivos Recentes em Downloads):</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">1 clique para anexar</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {recentDownloads.map((file) => {
                  const isAttached = attachments.some((a) => a.path === file.path);
                  return (
                    <button
                      type="button"
                      key={file.path}
                      onClick={() => handleAddRecentDownload(file)}
                      disabled={isAttached}
                      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-all border ${
                        isAttached
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 opacity-70 cursor-default'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/80 hover:border-brand-500/50'
                      }`}
                    >
                      <Plus className="w-3 h-3 text-brand-400 shrink-0" />
                      <span className="truncate max-w-[150px] font-mono">{file.name}</span>
                      <span className="text-[9px] text-slate-500 font-mono">({formatFileSize(file.size)})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Attachments List */}
          {attachments.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] text-slate-400 font-medium">
                Arquivos Anexados ({attachments.length}):
              </span>
              <div className="flex flex-wrap gap-2">
                {attachments.map((att) => (
                  <div
                    key={att.path}
                    className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-800/90 border border-slate-700 rounded-lg text-xs text-slate-200 shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                    <span className="truncate max-w-[180px] font-mono text-[11px]">{att.name}</span>
                    <span className="text-[10px] text-slate-400">({formatFileSize(att.size)})</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.path)}
                      className="ml-1 text-slate-400 hover:text-rose-400 p-0.5 rounded transition-colors"
                      title="Remover anexo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800 shrink-0">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handlePickFiles}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 transition-colors border border-slate-700/60"
                title="Procurar arquivo no computador"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>Anexar Arquivo...</span>
              </button>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Descartar
              </button>

              {/* Botão Agendar Envio (Send Later) */}
              <div className="relative">
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => {
                    setIsSchedulePickerOpen((v) => !v);
                  }}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition-colors disabled:opacity-50"
                  title="Agendar envio para data/hora futura (Send Later)"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Agendar</span>
                </button>

                {isSchedulePickerOpen && (
                  <div className="absolute bottom-full right-0 mb-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 z-50 space-y-2.5 animate-in fade-in">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Agendar Envio (Send Later)
                    </span>
                    <div className="grid grid-cols-1 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleScheduleSend(Date.now() + 3600 * 1000)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex justify-between"
                      >
                        <span>Em 1 hora</span>
                        <span className="text-slate-400 text-[11px]">
                          {new Date(Date.now() + 3600 * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() + 1);
                          d.setHours(9, 0, 0, 0);
                          handleScheduleSend(d.getTime());
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex justify-between"
                      >
                        <span>Amanhã de manhã</span>
                        <span className="text-slate-400 text-[11px]">09:00</span>
                      </button>
                    </div>
                    <div className="pt-2 border-t border-slate-800 space-y-2">
                      <input
                        type="datetime-local"
                        value={scheduledDateTime}
                        onChange={(e) => setScheduledDateTime(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        disabled={!scheduledDateTime}
                        onClick={() => {
                          const ts = new Date(scheduledDateTime).getTime();
                          if (!isNaN(ts)) handleScheduleSend(ts);
                        }}
                        className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
                      >
                        Confirmar Agendamento
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isSending}
                className="flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-brand-600/30 transition-all disabled:opacity-50 active:scale-98"
              >
                {isSending ? (
                  <>
                    <EmailSending size={18} primaryColor="#ffffff" secondaryColor="#93c5fd" />
                    <span>Despachando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar E-mail</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
