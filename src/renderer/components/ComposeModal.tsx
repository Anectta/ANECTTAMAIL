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
  CheckCheck,
  Smile,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link2,
  Image as ImageIcon,
  Table as TableIcon,
  Quote,
  RemoveFormatting,
  Undo2,
  Redo2,
  Minus,
  Highlighter,
  Palette,
  Trash2,
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
import { QuickRepliesService, QuickSnippetItem } from '../services/quickRepliesService';
import {
  buildEmailSafeTableHtml,
  fileToOptimizedDataUrl,
  hasRichBodyContent,
  htmlToPlainText,
  plainTextToEditorHtml,
  sanitizePastedHtml,
  sanitizeRichEditorHtml,
} from '../utils/richTextUtils';

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

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (email: {
    recipient: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    html?: string;
    editorHtml?: string;
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
  defaultCc?: string;
  defaultBcc?: string;
  defaultSubject?: string;
  defaultBody?: string;
  defaultBodyHtml?: string;
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
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    bodyHtml?: string;
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
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  priority: PriorityLevel;
  fromAccountId?: string;
  attachments: Array<{ name: string; path: string; size: number }>;
  savedAt: number;
}

const FONT_FAMILIES = [
  'Inter',
  'Arial',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Courier New',
];

const FONT_SIZES: Array<{ label: string; cmdValue: string }> = [
  { label: '10', cmdValue: '1' },
  { label: '12', cmdValue: '2' },
  { label: '14', cmdValue: '3' },
  { label: '16', cmdValue: '4' },
  { label: '18', cmdValue: '5' },
  { label: '24', cmdValue: '6' },
];

const TEXT_COLOR_PALETTE = [
  '#e2e8f0',
  '#0f172a',
  '#475569',
  '#2563eb',
  '#0284c7',
  '#16a34a',
  '#ca8a04',
  '#ea580c',
  '#dc2626',
  '#9333ea',
  '#db2777',
  '#0d9488',
];

const HIGHLIGHT_COLOR_PALETTE = [
  '#fef08a',
  '#bbf7d0',
  '#bae6fd',
  '#fed7aa',
  '#fbcfe8',
  '#ddd6fe',
];

function appendRecipientToken(currentValue: string, addressToAdd: string): string {
  const cleanAdd = addressToAdd.trim();
  if (!cleanAdd) return currentValue;
  const tokens = currentValue
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const exists = tokens.some((t) => {
    const match = t.match(/<([^>]+)>/);
    const addr = (match ? match[1] : t).trim().toLowerCase();
    return addr === cleanAdd.toLowerCase();
  });
  if (exists) return currentValue;
  return tokens.length > 0 ? `${tokens.join(', ')}, ${cleanAdd}` : cleanAdd;
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
  defaultCc = '',
  defaultBcc = '',
  spellCheckEnabled = true,
  defaultSubject = '',
  defaultBody = '',
  defaultBodyHtml = '',
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
  const [cc, setCc] = useState(defaultCc);
  const [bcc, setBcc] = useState(defaultBcc);
  const [showCc, setShowCc] = useState(Boolean(defaultCc?.trim()));
  const [showBcc, setShowBcc] = useState(Boolean(defaultBcc?.trim()));
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('medium');
  const [fromAccountId, setFromAccountId] = useState<string>(activeAccountId);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string>('none');
  const [attachments, setAttachments] = useState<Array<{ name: string; path: string; size: number }>>([]);
  const [recentDownloads, setRecentDownloads] = useState<RecentFileItem[]>([]);
  const [showMissingAttachmentAlert, setShowMissingAttachmentAlert] = useState(false);

  // Emojis & Rich-Text Editor
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [activeEmojiCategory, setActiveEmojiCategory] = useState<string>('faces');
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const inlineImageInputRef = useRef<HTMLInputElement | null>(null);
  const wasOpenRef = useRef(false);
  const lastInitDraftIdRef = useRef<string | undefined>(undefined);
  const signaturePreviewRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // Popovers e estados do Editor Rich-Text
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [isTablePopoverOpen, setIsTablePopoverOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [isTextColorOpen, setIsTextColorOpen] = useState(false);
  const [isHighlightColorOpen, setIsHighlightColorOpen] = useState(false);
  const [selectedFontFamily, setSelectedFontFamily] = useState('Inter');
  const [selectedFontSize, setSelectedFontSize] = useState('3');
  const [selectedInlineImg, setSelectedInlineImg] = useState<HTMLImageElement | null>(null);
  const [isDragOverEditor, setIsDragOverEditor] = useState(false);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    insertUnorderedList: false,
    insertOrderedList: false,
    justifyLeft: false,
    justifyCenter: false,
    justifyRight: false,
  });

  // Movimento e alinhamento da logo / imagem inserida na assinatura dentro da composição
  // A assinatura flutua integrada à área de escrita e pode ser arrastada livremente
  const composeCanvasRef = useRef<HTMLDivElement | null>(null);
  const [signaturePos, setSignaturePos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingSignature, setIsDraggingSignature] = useState(false);

  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Snippets de Resposta Rápida (sincronizados com Personalização de Respostas Rápidas)
  const [snippets, setSnippets] = useState<QuickSnippetItem[]>(() =>
    QuickRepliesService.getSnippets()
  );
  const [isSnippetPickerOpen, setIsSnippetPickerOpen] = useState(false);

  // Agendamento de Envio (Send Later)
  const [isSchedulePickerOpen, setIsSchedulePickerOpen] = useState(false);
  const [scheduledDateTime, setScheduledDateTime] = useState('');

  // Confirmação de Leitura & Monitoramento de Abertura por Destinatário (desmarcado por padrão)
  const [trackingEnabled, setTrackingEnabled] = useState<boolean>(false);

  // Salvamento automático do rascunho
  const [draftNotice, setDraftNotice] = useState('');
  const draftRef = useRef<StoredDraft | null>(null);
  draftRef.current = {
    recipient,
    cc,
    bcc,
    subject,
    body,
    bodyHtml,
    priority,
    fromAccountId,
    attachments,
    savedAt: Date.now(),
  };
  const sentRef = useRef(false);
  const draftIdRef = useRef<string>('');
  const onSaveDraftRef = useRef(onSaveDraft);
  onSaveDraftRef.current = onSaveDraft;

  const getLiveEditorContent = (): { html: string; text: string } => {
    const rawHtml = editorRef.current ? editorRef.current.innerHTML : bodyHtml;
    const text = htmlToPlainText(rawHtml);
    const hasRich = hasRichBodyContent(rawHtml, text);
    return {
      html: hasRich ? rawHtml : '',
      text,
    };
  };

  const saveDraftNow = (silent = false): boolean => {
    const d = draftRef.current;
    if (sentRef.current || !d || !onSaveDraftRef.current) return false;
    const live = getLiveEditorContent();
    if (
      !d.recipient.trim() &&
      !(d.cc || '').trim() &&
      !(d.bcc || '').trim() &&
      !d.subject.trim() &&
      !hasRichBodyContent(live.html, live.text) &&
      d.attachments.length === 0
    ) {
      return false;
    }
    if (!draftIdRef.current) draftIdRef.current = `draft-${Date.now()}`;
    onSaveDraftRef.current({
      id: draftIdRef.current,
      recipient: d.recipient,
      cc: d.cc?.trim() || undefined,
      bcc: d.bcc?.trim() || undefined,
      subject: d.subject,
      body: live.text,
      bodyHtml: live.html || undefined,
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
    const syncSnippets = () => setSnippets(QuickRepliesService.getSnippets());
    if (isOpen) {
      syncSnippets();
    }
    window.addEventListener('anectta:snippets-updated', syncSnippets);
    window.addEventListener('anectta:quick-replies-updated', syncSnippets);
    return () => {
      window.removeEventListener('anectta:snippets-updated', syncSnippets);
      window.removeEventListener('anectta:quick-replies-updated', syncSnippets);
    };
  }, [isOpen]);

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

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = (placeAtEndIfMissing = true) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (!sel) return;
    if (savedSelectionRef.current && editor.contains(savedSelectionRef.current.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);
      return;
    }
    if (placeAtEndIfMissing) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      savedSelectionRef.current = range.cloneRange();
    }
  };

  const updateActiveFormats = () => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) return;
    try {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        justifyLeft: document.queryCommandState('justifyLeft'),
        justifyCenter: document.queryCommandState('justifyCenter'),
        justifyRight: document.queryCommandState('justifyRight'),
      });
    } catch {
      // ignore queryCommandState errors
    }
  };

  const syncEditorFromDom = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const rawHtml = editor.innerHTML;
    const plain = htmlToPlainText(rawHtml);
    const hasContent = hasRichBodyContent(rawHtml, plain);
    setBody(plain);
    setBodyHtml(hasContent ? rawHtml : '');
    if (selectedInlineImg && !editor.contains(selectedInlineImg)) {
      setSelectedInlineImg(null);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const onSelectionChange = () => {
      const editor = editorRef.current;
      const sel = window.getSelection();
      if (editor && sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
        savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
        updateActiveFormats();
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      lastInitDraftIdRef.current = undefined;
      return;
    }

    const shouldInit = !wasOpenRef.current || draftId !== lastInitDraftIdRef.current;
    if (!shouldInit) return;

    wasOpenRef.current = true;
    lastInitDraftIdRef.current = draftId;

    const targetAccountId = activeAccountId || accounts[0]?.id || '';
    const initialHtml = defaultBodyHtml
      ? sanitizeRichEditorHtml(defaultBodyHtml)
      : plainTextToEditorHtml(defaultBody || '');
    const initialPlain = defaultBody || (initialHtml ? htmlToPlainText(initialHtml) : '');

    setRecipient(defaultRecipient);
    setCc(defaultCc);
    setBcc(defaultBcc);
    setShowCc(Boolean(defaultCc?.trim()));
    setShowBcc(Boolean(defaultBcc?.trim()));
    setSubject(defaultSubject);
    setBody(initialPlain);
    setBodyHtml(initialHtml);
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
    setIsLinkPopoverOpen(false);
    setIsTablePopoverOpen(false);
    setIsTextColorOpen(false);
    setIsHighlightColorOpen(false);
    setSelectedInlineImg(null);
    setIsDragOverEditor(false);
    setScheduledDateTime('');
    setTrackingEnabled(false);
    setDraftNotice(draftId ? 'Rascunho carregado' : '');
    savedSelectionRef.current = null;

    requestAnimationFrame(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = initialHtml;
      }
    });

    if (window.electronAPI?.getRecentDownloads) {
      window.electronAPI
        .getRecentDownloads()
        .then((files) => setRecentDownloads(files || []))
        .catch(() => {});
    }
  }, [
    isOpen,
    draftId,
    defaultRecipient,
    defaultCc,
    defaultBcc,
    defaultSubject,
    defaultBody,
    defaultBodyHtml,
    activeAccountId,
    accounts,
    signatures,
    draftAttachments,
  ]);

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

  const closeRichPopovers = () => {
    setIsLinkPopoverOpen(false);
    setIsTablePopoverOpen(false);
    setIsTextColorOpen(false);
    setIsHighlightColorOpen(false);
  };

  const execRichCommand = (command: string, value?: string) => {
    restoreSelection(true);
    try {
      document.execCommand('styleWithCSS', false, 'true');
    } catch {
      // ignore unsupported styleWithCSS
    }
    document.execCommand(command, false, value);
    saveSelection();
    updateActiveFormats();
    syncEditorFromDom();
  };

  const insertInlineImages = async (files: Array<File | Blob>) => {
    const validImages = files.filter((f) => f.type.startsWith('image/'));
    if (validImages.length === 0) return;

    restoreSelection(true);
    for (const file of validImages) {
      try {
        const dataUrl = await fileToOptimizedDataUrl(file);
        if (!dataUrl) continue;
        const safeAlt =
          'name' in file && file.name
            ? String(file.name).replace(/["<>]/g, '')
            : 'Imagem inline';
        restoreSelection(true);
        document.execCommand(
          'insertHTML',
          false,
          `<img src="${dataUrl}" alt="${safeAlt}" style="max-width:100%;height:auto;display:inline-block;margin:6px 0;border-radius:4px;" />`
        );
      } catch (err) {
        console.warn('Falha ao inserir imagem inline:', err);
      }
    }
    saveSelection();
    syncEditorFromDom();
  };

  const handleInlineImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length > 0) {
      await insertInlineImages(files);
    }
  };

  const handleInsertLink = () => {
    const rawUrl = linkUrl.trim();
    if (!rawUrl) return;
    const href =
      /^https?:\/\//i.test(rawUrl) || rawUrl.startsWith('mailto:')
        ? rawUrl
        : `https://${rawUrl}`;
    const escapeHtml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const safeHref = escapeHtml(href);
    const label = escapeHtml(linkText.trim() || rawUrl);
    restoreSelection(true);
    document.execCommand(
      'insertHTML',
      false,
      `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">${label}</a>`
    );
    saveSelection();
    syncEditorFromDom();
    setLinkUrl('');
    setLinkText('');
    setIsLinkPopoverOpen(false);
  };

  const handleInsertTable = (rows: number, cols: number) => {
    restoreSelection(true);
    document.execCommand('insertHTML', false, buildEmailSafeTableHtml(rows, cols));
    saveSelection();
    syncEditorFromDom();
    setIsTablePopoverOpen(false);
  };

  const updateSelectedInlineImageWidth = (widthPercent: string) => {
    if (!selectedInlineImg || !editorRef.current?.contains(selectedInlineImg)) return;
    selectedInlineImg.style.width = widthPercent;
    selectedInlineImg.style.maxWidth = '100%';
    selectedInlineImg.style.height = 'auto';
    syncEditorFromDom();
  };

  const alignSelectedInlineImage = (align: 'left' | 'center' | 'right') => {
    if (!selectedInlineImg || !editorRef.current?.contains(selectedInlineImg)) return;
    selectedInlineImg.style.display = 'block';
    if (align === 'left') {
      selectedInlineImg.style.marginLeft = '0';
      selectedInlineImg.style.marginRight = 'auto';
    } else if (align === 'center') {
      selectedInlineImg.style.marginLeft = 'auto';
      selectedInlineImg.style.marginRight = 'auto';
    } else {
      selectedInlineImg.style.marginLeft = 'auto';
      selectedInlineImg.style.marginRight = '0';
    }
    syncEditorFromDom();
  };

  const removeSelectedInlineImage = () => {
    if (!selectedInlineImg || !editorRef.current?.contains(selectedInlineImg)) return;
    selectedInlineImg.remove();
    setSelectedInlineImg(null);
    syncEditorFromDom();
  };

  const handleEditorPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => Boolean(f));

    if (imageFiles.length > 0) {
      e.preventDefault();
      await insertInlineImages(imageFiles);
      return;
    }

    const htmlData = e.clipboardData?.getData('text/html');
    if (htmlData && htmlData.trim()) {
      e.preventDefault();
      const cleaned = sanitizePastedHtml(htmlData);
      if (cleaned) {
        restoreSelection(true);
        document.execCommand('insertHTML', false, cleaned);
        saveSelection();
        syncEditorFromDom();
      }
    }
  };

  const handleEditorDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverEditor(false);

    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;

    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    const regularFiles = files.filter((f) => !f.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      await insertInlineImages(imageFiles);
    }

    if (regularFiles.length > 0) {
      const attachable = regularFiles
        .map((f) => {
          const filePath = (f as any).path;
          return filePath ? { name: f.name, path: String(filePath), size: f.size } : null;
        })
        .filter((x): x is { name: string; path: string; size: number } => Boolean(x));

      if (attachable.length > 0) {
        setAttachments((prev) => {
          const existingPaths = new Set(prev.map((a) => a.path));
          return [...prev, ...attachable.filter((a) => !existingPaths.has(a.path))];
        });
      }
    }
  };

  const handleInsertEmoji = (emoji: string) => {
    restoreSelection(true);
    document.execCommand('insertText', false, emoji);
    saveSelection();
    syncEditorFromDom();
  };

  const executeSend = async (scheduledAt?: number) => {
    // Dispara animação de saída escolhida antes do fechamento
    setIsDispatching(true);
    setIsSending(true);
    setErrorMessage('');

    const live = getLiveEditorContent();
    const sanitizedEditorHtml = live.html ? sanitizeRichEditorHtml(live.html) : '';

    // Compilação do HTML com CSS 100% Inline garantido para clientes de correio
    const compiledHtml = compileToInlineHtml({
      text: live.text,
      bodyHtml: sanitizedEditorHtml || undefined,
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
        recipient: recipient.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject,
        body: live.text,
        html: compiledHtml,
        editorHtml: sanitizedEditorHtml || undefined,
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
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r?\n/g, '<br/>');
    restoreSelection(true);
    document.execCommand('insertHTML', false, escaped);
    saveSelection();
    syncEditorFromDom();
    setIsSnippetPickerOpen(false);
  };

  const hasAnyRecipient = Boolean(recipient.trim() || cc.trim() || bcc.trim());

  const handleScheduleSend = async (timestampMs: number) => {
    const live = getLiveEditorContent();
    if (!hasAnyRecipient || !subject.trim() || !hasRichBodyContent(live.html, live.text)) {
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
    const live = getLiveEditorContent();
    if (!hasAnyRecipient || !hasRichBodyContent(live.html, live.text)) {
      setErrorMessage('Por favor, preencha ao menos um destinatário e o conteúdo da mensagem antes de enviar.');
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
        new Blob([live.html || live.text || '']).size +
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
      const mentionsAttachment = /(anexo|anexei|anexado|segue anexo|em anexo|anexando|anexos)/i.test(live.text);
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
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-200 relative max-h-[92vh]">
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
                  setCc('');
                  setBcc('');
                  setShowCc(false);
                  setShowBcc(false);
                  setSubject('');
                  setBody('');
                  setBodyHtml('');
                  setSelectedInlineImg(null);
                  if (editorRef.current) editorRef.current.innerHTML = '';
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

          {/* Recipient (Para + toggles Cc/CCO) */}
          <div className="flex items-center border-b border-slate-800 pb-2 gap-2">
            <span className="w-16 text-xs text-slate-400 font-medium shrink-0">Para:</span>
            <input
              type="text"
              list="anectta-contacts-datalist"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="destinatario@empresa.com (separe múltiplos com vírgula ou ;)"
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
                      setRecipient((prev) => appendRecipientToken(prev, e.target.value));
                    }
                  }}
                  title="Adicionar contato salvo em Para"
                  className="bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700 rounded px-2 py-1 focus:outline-none focus:border-brand-500 cursor-pointer max-w-[150px]"
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
            <div className="flex items-center space-x-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowCc((v) => !v)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                  showCc || cc.trim()
                    ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                    : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 border-slate-700/70'
                }`}
                title="Exibir/ocultar campo Com Cópia (Cc)"
              >
                Cc
              </button>
              <button
                type="button"
                onClick={() => setShowBcc((v) => !v)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                  showBcc || bcc.trim()
                    ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                    : 'bg-slate-800/70 text-slate-400 hover:text-slate-200 border-slate-700/70'
                }`}
                title="Exibir/ocultar campo Cópia Oculta (CCO)"
              >
                CCO
              </button>
            </div>
          </div>

          {/* CC */}
          {(showCc || cc.trim()) && (
            <div className="flex items-center border-b border-slate-800 pb-2 gap-2 animate-in fade-in duration-100">
              <span className="w-16 text-xs text-slate-400 font-medium shrink-0">Cc:</span>
              <input
                type="text"
                list={contacts.length > 0 ? 'anectta-contacts-datalist' : undefined}
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="copia@empresa.com (separe múltiplos com vírgula ou ;)"
                className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-600 focus:outline-none font-mono"
              />
              {contacts.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      setCc((prev) => appendRecipientToken(prev, e.target.value));
                    }
                  }}
                  title="Adicionar contato salvo em Cc"
                  className="bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700 rounded px-2 py-1 focus:outline-none focus:border-brand-500 cursor-pointer max-w-[140px]"
                >
                  <option value="" disabled>
                    + Cc...
                  </option>
                  {contacts.map((c) => (
                    <option key={`cc-${c.id || c.email}`} value={c.email} className="bg-slate-900 text-slate-100">
                      {c.name ? `${c.name} (${c.email})` : c.email}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => {
                  setCc('');
                  setShowCc(false);
                }}
                className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                title="Limpar e ocultar Cc"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* BCC / CCO */}
          {(showBcc || bcc.trim()) && (
            <div className="flex items-center border-b border-slate-800 pb-2 gap-2 animate-in fade-in duration-100">
              <span className="w-16 text-xs text-slate-400 font-medium shrink-0">CCO:</span>
              <input
                type="text"
                list={contacts.length > 0 ? 'anectta-contacts-datalist' : undefined}
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="copia.oculta@empresa.com (invisível para os demais destinatários)"
                className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-600 focus:outline-none font-mono"
              />
              {contacts.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      setBcc((prev) => appendRecipientToken(prev, e.target.value));
                    }
                  }}
                  title="Adicionar contato salvo em CCO"
                  className="bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700 rounded px-2 py-1 focus:outline-none focus:border-brand-500 cursor-pointer max-w-[140px]"
                >
                  <option value="" disabled>
                    + CCO...
                  </option>
                  {contacts.map((c) => (
                    <option key={`bcc-${c.id || c.email}`} value={c.email} className="bg-slate-900 text-slate-100">
                      {c.name ? `${c.name} (${c.email})` : c.email}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => {
                  setBcc('');
                  setShowBcc(false);
                }}
                className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                title="Limpar e ocultar CCO"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

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
            <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
              {/* Emojis */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                }}
                onClick={() => {
                  closeRichPopovers();
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
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                }}
                onClick={() => {
                  closeRichPopovers();
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

              {/* Solicitação de Confirmação de Leitura (desmarcado por padrão) */}
              <button
                type="button"
                onClick={() => setTrackingEnabled((v) => !v)}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                  trackingEnabled
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                }`}
                title="Solicitar confirmação de leitura ao destinatário"
              >
                <CheckCheck className={`w-3.5 h-3.5 ${trackingEnabled ? 'text-sky-400' : 'text-slate-500'}`} />
                <span>Solicitar confirmação de Leitura</span>
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

          {/* Barra de Formatação Rich-Text WYSIWYG */}
          <div className="compose-rich-toolbar relative flex flex-wrap items-center gap-1 px-2 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800/90">
            <input
              ref={inlineImageInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleInlineImageFileChange}
              className="hidden"
            />

            {/* Desfazer / Refazer */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execRichCommand('undo')}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              title="Desfazer (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execRichCommand('redo')}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              title="Refazer (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>

            <span className="h-4 w-px bg-slate-800 mx-0.5" />

            {/* Fonte e Tamanho */}
            <select
              value={selectedFontFamily}
              onChange={(e) => {
                setSelectedFontFamily(e.target.value);
                execRichCommand('fontName', e.target.value);
              }}
              title="Família da fonte"
              className="bg-slate-900 border border-slate-800 rounded-md px-1.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-brand-500 cursor-pointer max-w-[106px]"
            >
              {FONT_FAMILIES.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
            <select
              value={selectedFontSize}
              onChange={(e) => {
                setSelectedFontSize(e.target.value);
                execRichCommand('fontSize', e.target.value);
              }}
              title="Tamanho do texto"
              className="bg-slate-900 border border-slate-800 rounded-md px-1.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-brand-500 cursor-pointer w-[54px]"
            >
              {FONT_SIZES.map((sz) => (
                <option key={sz.cmdValue} value={sz.cmdValue}>
                  {sz.label}px
                </option>
              ))}
            </select>

            <span className="h-4 w-px bg-slate-800 mx-0.5" />

            {/* Estilos básicos */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execRichCommand('bold')}
              className={`p-1.5 rounded-lg transition-colors ${
                activeFormats.bold
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Negrito (Ctrl+B)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execRichCommand('italic')}
              className={`p-1.5 rounded-lg transition-colors ${
                activeFormats.italic
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Itálico (Ctrl+I)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execRichCommand('underline')}
              className={`p-1.5 rounded-lg transition-colors ${
                activeFormats.underline
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Sublinhado (Ctrl+U)"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execRichCommand('strikeThrough')}
              className={`p-1.5 rounded-lg transition-colors ${
                activeFormats.strikeThrough
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Tachado"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>

            <span className="h-4 w-px bg-slate-800 mx-0.5" />

            {/* Cor do texto */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                }}
                onClick={() => {
                  const next = !isTextColorOpen;
                  closeRichPopovers();
                  setIsTextColorOpen(next);
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  isTextColorOpen
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Cor do texto"
              >
                <Palette className="w-3.5 h-3.5" />
              </button>
              {isTextColorOpen && (
                <div className="absolute left-0 top-full mt-1.5 p-2.5 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-40 w-44 space-y-2 animate-in fade-in">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Cor do texto
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {TEXT_COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          execRichCommand('foreColor', color);
                          setIsTextColorOpen(false);
                        }}
                        style={{ backgroundColor: color }}
                        className="w-5 h-5 rounded-md border border-slate-600 hover:scale-110 transition-transform"
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Marca-texto / Destaque */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                }}
                onClick={() => {
                  const next = !isHighlightColorOpen;
                  closeRichPopovers();
                  setIsHighlightColorOpen(next);
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  isHighlightColorOpen
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Cor de destaque (marca-texto)"
              >
                <Highlighter className="w-3.5 h-3.5" />
              </button>
              {isHighlightColorOpen && (
                <div className="absolute left-0 top-full mt-1.5 p-2.5 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-40 w-44 space-y-2 animate-in fade-in">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Destaque
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {HIGHLIGHT_COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          execRichCommand('hiliteColor', color);
                          setIsHighlightColorOpen(false);
                        }}
                        style={{ backgroundColor: color }}
                        className="w-5 h-5 rounded-md border border-slate-600 hover:scale-110 transition-transform"
                        title={color}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      execRichCommand('hiliteColor', 'transparent');
                      setIsHighlightColorOpen(false);
                    }}
                    className="w-full py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 transition-colors"
                  >
                    Sem destaque
                  </button>
                </div>
              )}
            </div>

            <span className="h-4 w-px bg-slate-800 mx-0.5" />

            {/* Alinhamento */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execRichCommand('justifyLeft')}
              className={`p-1.5 rounded-lg transition-colors ${
                activeFormats.justifyLeft
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Alinhar à esquerda"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execRichCommand('justifyCenter')}
              className={`p-1.5 rounded-lg transition-colors ${
                activeFormats.justifyCenter
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Centralizar"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execRichCommand('justifyRight')}
              className={`p-1.5 rounded-lg transition-colors ${
                activeFormats.justifyRight
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Alinhar à direita"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>

            <span className="h-4 w-px bg-slate-800 mx-0.5" />

            {/* Listas & Citação */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execRichCommand('insertUnorderedList')}
              className={`p-1.5 rounded-lg transition-colors ${
                activeFormats.insertUnorderedList
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Lista com marcadores"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execRichCommand('insertOrderedList')}
              className={`p-1.5 rounded-lg transition-colors ${
                activeFormats.insertOrderedList
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Lista numerada"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execRichCommand('formatBlock', 'BLOCKQUOTE')}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              title="Bloco de citação"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>

            <span className="h-4 w-px bg-slate-800 mx-0.5" />

            {/* Link */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                }}
                onClick={() => {
                  const next = !isLinkPopoverOpen;
                  closeRichPopovers();
                  if (next) {
                    const selText = window.getSelection()?.toString() || '';
                    setLinkText(selText);
                    setLinkUrl('');
                  }
                  setIsLinkPopoverOpen(next);
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  isLinkPopoverOpen
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Inserir link (URL)"
              >
                <Link2 className="w-3.5 h-3.5" />
              </button>
              {isLinkPopoverOpen && (
                <div className="absolute left-0 top-full mt-1.5 p-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-40 w-64 space-y-2 animate-in fade-in">
                  <div className="text-[11px] font-semibold text-slate-200">Inserir Hiperlink</div>
                  <input
                    type="text"
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                    placeholder="Texto do link (opcional)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleInsertLink();
                      }
                    }}
                    placeholder="https://exemplo.com.br"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                  <div className="flex justify-end space-x-1.5">
                    <button
                      type="button"
                      onClick={() => setIsLinkPopoverOpen(false)}
                      className="px-2 py-1 text-[11px] text-slate-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleInsertLink}
                      className="px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-semibold"
                    >
                      Inserir
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Imagem Inline */}
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => {
                closeRichPopovers();
                inlineImageInputRef.current?.click();
              }}
              className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[11px] font-medium text-sky-300 hover:text-white bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 transition-colors"
              title="Inserir imagem inline no corpo do e-mail (ou cole com Ctrl+V / arraste)"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Imagem</span>
            </button>

            {/* Tabela */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  saveSelection();
                }}
                onClick={() => {
                  const next = !isTablePopoverOpen;
                  closeRichPopovers();
                  setIsTablePopoverOpen(next);
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  isTablePopoverOpen
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title="Inserir tabela"
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
              {isTablePopoverOpen && (
                <div className="absolute right-0 top-full mt-1.5 p-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-40 w-56 space-y-2.5 animate-in fade-in">
                  <div className="text-[11px] font-semibold text-slate-200">Inserir Tabela</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      [2, 2],
                      [3, 3],
                      [4, 3],
                      [4, 4],
                    ].map(([r, c]) => (
                      <button
                        key={`${r}x${c}`}
                        type="button"
                        onClick={() => handleInsertTable(r, c)}
                        className="py-1 rounded bg-slate-800 hover:bg-brand-600 text-[11px] text-slate-200 hover:text-white font-mono transition-colors"
                      >
                        {r}x{c}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <label className="flex-1 text-slate-400">
                      Linhas
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={tableRows}
                        onChange={(e) => setTableRows(Number(e.target.value) || 2)}
                        className="mt-0.5 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                      />
                    </label>
                    <label className="flex-1 text-slate-400">
                      Colunas
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={tableCols}
                        onChange={(e) => setTableCols(Number(e.target.value) || 2)}
                        className="mt-0.5 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInsertTable(tableRows, tableCols)}
                    className="w-full py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-semibold"
                  >
                    Inserir {tableRows}x{tableCols}
                  </button>
                </div>
              )}
            </div>

            {/* Linha Divisória & Limpar Formatação */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execRichCommand('insertHorizontalRule')}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              title="Inserir linha divisória"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => execRichCommand('removeFormat')}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              title="Limpar formatação"
            >
              <RemoveFormatting className="w-3.5 h-3.5" />
            </button>
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

          {/* Snippets Popover Drawer (somente inserção — sem exclusão ou alteração) */}
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto custom-scroll">
                {snippets.map((snip) => (
                  <button
                    key={snip.id}
                    type="button"
                    onClick={() => handleInsertSnippet(snip.content)}
                    className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900/80 transition-all text-left flex flex-col justify-start gap-1"
                  >
                    <div className="text-xs font-semibold text-emerald-300 truncate w-full">
                      {snip.title}
                    </div>
                    <div className="text-[10px] text-slate-400 line-clamp-2">
                      {snip.content}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Editor Rich-Text + Assinatura Unificada no Corpo da Mensagem (Cor de fundo sempre fiel ao skin escolhido) */}
          <div
            style={{
              backgroundColor: 'var(--bg-app)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            ref={composeCanvasRef}
            onDragOver={(e) => {
              e.preventDefault();
              if (!isDragOverEditor) setIsDragOverEditor(true);
            }}
            onDragLeave={(e) => {
              if (!composeCanvasRef.current?.contains(e.relatedTarget as Node)) {
                setIsDragOverEditor(false);
              }
            }}
            onDrop={handleEditorDrop}
            className={`compose-message-canvas relative rounded-xl p-3 border transition-all flex flex-col min-h-[280px] ${
              isDragOverEditor ? 'ring-2 ring-brand-500/70' : ''
            }`}
          >
            {/* Barra contextual para Imagem Inline selecionada */}
            {selectedInlineImg && (
              <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-slate-900/95 border border-brand-500/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-200 z-20">
                <span className="font-semibold text-brand-300">Imagem selecionada:</span>
                <div className="flex flex-wrap items-center gap-1">
                  {(['25%', '50%', '75%', '100%'] as const).map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => updateSelectedInlineImageWidth(pct)}
                      className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-brand-600 text-slate-200 hover:text-white transition-colors"
                    >
                      {pct}
                    </button>
                  ))}
                  <span className="h-3.5 w-px bg-slate-700 mx-0.5" />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => alignSelectedInlineImage('left')}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700"
                    title="Alinhar imagem à esquerda"
                  >
                    <AlignLeft className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => alignSelectedInlineImage('center')}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700"
                    title="Centralizar imagem"
                  >
                    <AlignCenter className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => alignSelectedInlineImage('right')}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700"
                    title="Alinhar imagem à direita"
                  >
                    <AlignRight className="w-3 h-3" />
                  </button>
                  <span className="h-3.5 w-px bg-slate-700 mx-0.5" />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={removeSelectedInlineImage}
                    className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-300"
                    title="Remover imagem"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remover</span>
                  </button>
                </div>
              </div>
            )}

            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="Corpo da mensagem"
              data-placeholder="Escreva sua mensagem... (cole imagens com Ctrl+V ou arraste arquivos aqui)"
              spellCheck={spellCheckEnabled}
              onInput={syncEditorFromDom}
              onClick={(e) => {
                saveSelection();
                updateActiveFormats();
                const target = e.target as HTMLElement | null;
                if (target && target.tagName === 'IMG') {
                  setSelectedInlineImg(target as HTMLImageElement);
                } else {
                  setSelectedInlineImg(null);
                }
              }}
              onKeyUp={() => {
                saveSelection();
                updateActiveFormats();
              }}
              onMouseUp={() => {
                saveSelection();
                updateActiveFormats();
              }}
              onPaste={handleEditorPaste}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  if (effectiveConfirmations.askBeforeSendOnCtrlEnter) {
                    if (!window.confirm('Deseja enviar esta mensagem agora (Ctrl+Enter)?')) {
                      return;
                    }
                  }
                  void handleSubmit(e as unknown as React.FormEvent);
                  return;
                }
                if (e.key === 'Tab') {
                  const sel = window.getSelection();
                  const anchorNode = sel?.anchorNode;
                  const anchorEl =
                    anchorNode instanceof HTMLElement ? anchorNode : anchorNode?.parentElement;
                  const cell = anchorEl?.closest('td, th') as HTMLTableCellElement | null;
                  const table = cell?.closest('table');
                  if (cell && table) {
                    e.preventDefault();
                    const cells = Array.from(table.querySelectorAll('th, td'));
                    const idx = cells.indexOf(cell);
                    const nextCell = cells[e.shiftKey ? idx - 1 : idx + 1] as HTMLElement | undefined;
                    if (nextCell) {
                      const range = document.createRange();
                      range.selectNodeContents(nextCell);
                      range.collapse(false);
                      sel?.removeAllRanges();
                      sel?.addRange(range);
                    }
                    return;
                  }
                  e.preventDefault();
                  document.execCommand('insertText', false, '    ');
                  syncEditorFromDom();
                }
              }}
              style={{
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
              }}
              className={`compose-message-field compose-rich-editor w-full flex-1 min-h-[250px] max-h-[380px] overflow-y-auto bg-transparent border-0 text-xs focus:outline-none font-sans leading-relaxed custom-scroll ${
                signatureDisplayHtml ? 'pb-16' : ''
              }`}
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
