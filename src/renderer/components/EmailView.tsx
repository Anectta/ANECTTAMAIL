import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Archive,
  Trash2,
  Reply,
  ReplyAll,
  Forward,
  Maximize2,
  Clock,
  CheckCircle,
  Loader2,
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
  UserPlus,
  UserCheck,
  ArrowLeft,
  CheckSquare,
  BookOpen,
  Tag,
  CheckCheck,
  Shield,
  ShieldCheck,
  ShieldAlert,
  EyeOff,
  UserX,
  ImageOff,
  Printer,
  Plus,
  MessagesSquare,
  ChevronDown,
  ChevronRight,
  Calendar,
  MapPin,
  Video,
  Check,
  HelpCircle,
  X,
  BellRing,
  MailX,
  PanelRight,
  StickyNote,
  Lock,
  Unlock,
  Languages,
  Copy,
  Award,
} from 'lucide-react';
import { CustomFolder, EmailItem, MailFolder } from '@/types/email';
import { SenderAvatar } from './SenderAvatar';
import { AssistantCard } from './AssistantCard';
import type { DateMention } from '../utils/assistantInsights';
import { soundService } from '../services/soundService';
import { filterRealAttachments } from '../utils/attachmentUtils';
import DOMPurify from 'dompurify';
import { formatReceivedLabel } from '../utils/dateSortUtils';
import { linkifyHtml, splitLinks } from '../utils/linkify';
import { senderInList } from '../utils/mailHygiene';
import { authLevel, baseDomain, replyToRisk } from '../utils/phishingDetector';
import {
  analyzePhishing,
  hostOf,
  linkWarnings,
  loadPhishingTrusted,
  loadTrustedHosts,
  savePhishingTrusted,
  saveTrustedHosts,
} from '../utils/phishingDetector';
import { parseUnsubscribeInfo } from '../utils/triageAndTemplates';
import { getPrivateNoteForEmail } from './ContactContextSidebar';
import {
  detectPgpBlock,
  findContactPublicKeyByEmail,
  findOwnKeyByEmail,
} from '../utils/pgpKeyring';
import { detectSmimeBlock, findOwnSmimeCertByEmail } from '../utils/smimeStore';

/**
 * Barra de ações do e-mail: botões quadrados só com ícone, cada ação com sua cor.
 * O ÍCONE e a BORDA usam cores FIXAS (iguais em todos os temas); apenas o FUNDO
 * acompanha o tema (mistura da cor da ação com --bg-surface). Estilos em
 * index.css → .action-tile (a cor vai na variável --tile-color, definida inline).
 */
const ACTION_TONES = {
  slate: '#94a3b8',
  blue: '#60a5fa',
  sky: '#38bdf8',
  indigo: '#818cf8',
  teal: '#2dd4bf',
  rose: '#fb7185',
  cyan: '#22d3ee',
  amber: '#fbbf24',
  orange: '#fb923c',
  emerald: '#34d399',
  violet: '#a78bfa',
  yellow: '#facc15',
} as const;

type ActionTone = keyof typeof ACTION_TONES;

const actionTile = (tone: ActionTone, active = false) => ({
  className: `action-tile${active ? ' is-active' : ''} w-10 h-10 shrink-0 flex items-center justify-center rounded-xl border transition-all duration-150 disabled:opacity-60 disabled:cursor-wait`,
  style: { ['--tile-color' as string]: ACTION_TONES[tone] } as React.CSSProperties,
});

const ACTION_ICON = 'w-[18px] h-[18px] shrink-0';

/** Ícone do botão "Mais ações": grade 3x3 de pontos coloridos. */
const MoreActionsDotsIcon: React.FC = () => {
  const colors = ['#f87171', '#fbbf24', '#34d399', '#38bdf8', '#a78bfa', '#f472b6', '#fb923c', '#22d3ee', '#a3e635'];
  return (
    <svg viewBox="0 0 18 18" className={ACTION_ICON} aria-hidden="true">
      {colors.map((fill, i) => (
        <circle key={fill} cx={3 + (i % 3) * 6} cy={3 + Math.floor(i / 3) * 6} r={1.9} fill={fill} />
      ))}
    </svg>
  );
};

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
  /** Quantos e-mails estão marcados na lista; com mais de 1, a lixeira exclui todos eles. */
  bulkSelectedCount?: number;
  onDeleteBulk?: () => void;
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
  /** Contatos VIP */
  isVipSender?: boolean;
  onToggleVip?: (senderEmail: string) => void;
  onBackToList?: () => void;
  onToggleTask?: (id: string) => void;
  onToggleReadingList?: (id: string) => void;
  onToggleImportant?: (id: string) => void;
  blockExternalImages?: boolean;
  blockTrackingPixels?: boolean;
  blockBlockedSenders?: boolean;
  /** Escudo Anectta: aviso de golpe (padrão: ligado). */
  phishingProtection?: boolean;
  /** Confirmar antes de abrir links do e-mail (padrão: ligado). */
  confirmExternalLinks?: boolean;
  /** Remetentes confiáveis: imagens sempre visíveis e sem aviso de golpe. */
  trustedSenders?: string[];
  onTrustSender?: (senderEmail: string) => void;
  onChangePrivacySetting?: (
    key: 'blockExternalImages' | 'blockTrackingPixels' | 'blockBlockedSenders',
    value: boolean
  ) => void;
  /** Regra de bloqueio (e-mail ou @domínio) que atinge o remetente, ou null. */
  getSenderBlockRule?: (senderEmail?: string) => string | null;
  onSendReadReceipt?: (email: EmailItem) => Promise<void> | void;
  onComposeNewEmail?: () => void;
  threadMessages?: EmailItem[];
  onOpenInNewTab?: (id: string) => void;
  isInTab?: boolean;
  onRespondCalendarInvite?: (
    email: EmailItem,
    status: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED'
  ) => Promise<void> | void;
  onSnoozeWithTime?: (id: string, untilMs: number, label: string) => void;
  onSetFollowUp?: (id: string, followUpAtMs: number, label: string) => void;
  onCreateTaskFromEmail?: (email: EmailItem) => void;
  onUnsubscribe?: (email: EmailItem) => Promise<void> | void;
  onToggleContactContext?: () => void;
  isContactContextOpen?: boolean;
  /** Amoroso — Assistente Anectta */
  showAssistant?: boolean;
  onAssistantQuickReply?: (email: EmailItem, kind: 'confirm' | 'thanks') => void;
  onAssistantCreateEvent?: (email: EmailItem, when?: DateMention) => void;
  onAssistantCreateReminder?: (email: EmailItem, when?: DateMention) => void;
  onHideAssistant?: () => void;
}

export const EmailView: React.FC<EmailViewProps> = ({
  email,
  onArchive,
  onSnooze,
  onDelete,
  bulkSelectedCount = 0,
  onDeleteBulk,
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
  isVipSender = false,
  onToggleVip,
  onBackToList,
  onToggleTask,
  onToggleReadingList,
  onToggleImportant,
  blockExternalImages = false,
  blockTrackingPixels = true,
  blockBlockedSenders = true,
  phishingProtection = true,
  confirmExternalLinks = true,
  trustedSenders,
  onTrustSender,
  onChangePrivacySetting,
  getSenderBlockRule,
  onSendReadReceipt,
  onComposeNewEmail,
  threadMessages,
  onOpenInNewTab,
  isInTab = false,
  onRespondCalendarInvite,
  onSnoozeWithTime,
  onSetFollowUp,
  onCreateTaskFromEmail,
  onUnsubscribe,
  onToggleContactContext,
  isContactContextOpen = false,
  showAssistant = false,
  onAssistantQuickReply,
  onAssistantCreateEvent,
  onAssistantCreateReminder,
  onHideAssistant,
}) => {
  const [revealedImagesEmailIds, setRevealedImagesEmailIds] = useState<Record<string, boolean>>({});

  // Escudo Anectta — golpes (phishing) e confirmação ao abrir links
  const [phishingTrusted, setPhishingTrusted] = useState<Set<string>>(() => loadPhishingTrusted());
  const [trustedHosts, setTrustedHosts] = useState<Set<string>>(() => loadTrustedHosts());
  const [pendingLink, setPendingLink] = useState<{ href: string; warnings: string[] } | null>(null);
  // Anexo que não abre direto (tipo perigoso ou programa disfarçado): janela com as opções
  const [blockedAttachment, setBlockedAttachment] = useState<{
    name: string;
    path: string;
    kind: 'dangerous' | 'disguised';
    ext: string;
  } | null>(null);
  // "Responder para" diferente do remetente
  const replyRisk = useMemo(
    () => (email ? replyToRisk({ sender: email.sender, senderEmail: email.senderEmail, replyTo: email.replyTo }) : { level: 'none' as const }),
    [email]
  );
  const [dontAskHost, setDontAskHost] = useState(false);

  const phishingReport = useMemo(() => {
    if (!email || !phishingProtection || email.folder === 'sent' || email.folder === 'drafts' || senderInList(email.senderEmail, trustedSenders)) {
      return { level: 'none' as const, reasons: [] as string[] };
    }
    return analyzePhishing(
      {
        sender: email.sender,
        senderEmail: email.senderEmail,
        subject: email.subject,
        body: email.body,
        bodyHtml: email.bodyHtml,
        attachments: email.attachments,
        authResults: email.authResults,
      },
      phishingTrusted
    );
  }, [email, phishingProtection, phishingTrusted, trustedSenders]);

  const openUrlNow = (href: string) => {
    if (window.electronAPI?.openExternal) {
      void window.electronAPI.openExternal(href);
    } else {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  /** Clique em link do e-mail: mostra o endereço real antes de abrir (e alerta se for suspeito). */
  const requestOpenLink = (href: string, shownText?: string) => {
    if (/^mailto:/i.test(href)) {
      openUrlNow(href);
      return;
    }
    const warnings = linkWarnings(href, shownText);
    if (phishingReport.level === 'danger') warnings.push('Este e-mail tem sinais de golpe.');
    const host = hostOf(href);
    if (warnings.length === 0 && (!confirmExternalLinks || trustedHosts.has(host))) {
      openUrlNow(href);
      return;
    }
    setDontAskHost(false);
    setPendingLink({ href, warnings });
  };
  const [expandedThreadIds, setExpandedThreadIds] = useState<Record<string, boolean>>({});
  const [isRespondingRsvp, setIsRespondingRsvp] = useState(false);
  const [isSnoozeMenuOpen, setIsSnoozeMenuOpen] = useState(false);
  const [customSnoozeValue, setCustomSnoozeValue] = useState('');
  const [isFollowUpMenuOpen, setIsFollowUpMenuOpen] = useState(false);
  const [isUnsubscribing, setIsUnsubscribing] = useState(false);
  const [unsubscribedIds, setUnsubscribedIds] = useState<Record<string, boolean>>({});
  const [privateNotePreview, setPrivateNotePreview] = useState('');
  const [pgpPassphrase, setPgpPassphrase] = useState('');
  const [pgpBusy, setPgpBusy] = useState(false);
  const [pgpResult, setPgpResult] = useState<{
    emailId: string;
    plainText?: string;
    verified?: boolean;
    signerKeyId?: string;
    error?: string;
  } | null>(null);
  const [smimeBusy, setSmimeBusy] = useState(false);
  const [smimeResult, setSmimeResult] = useState<{
    emailId: string;
    mode?: 'decrypted' | 'verified';
    plainText?: string;
    signerSubject?: string;
    signerIssuer?: string;
    validTo?: string;
    error?: string;
  } | null>(null);
  const [translateTargetLang, setTranslateTargetLang] = useState<string>(() => {
    try {
      return localStorage.getItem('anectta_translate_target_lang') || 'pt';
    } catch {
      return 'pt';
    }
  });
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslatedText, setShowTranslatedText] = useState(true);
  const [translationResult, setTranslationResult] = useState<{
    emailId: string;
    subject?: string;
    body?: string;
    detectedLang?: string;
    targetLang: string;
    error?: string;
  } | null>(null);

  const handleTranslateEmail = async (langOverride?: string) => {
    if (!email) return;
    if (!window.electronAPI?.translateEmailText) {
      setTranslationResult({
        emailId: email.id,
        targetLang: langOverride || translateTargetLang,
        error: 'Tradução instantânea disponível apenas no aplicativo desktop.',
      });
      return;
    }
    const targetLang = langOverride || translateTargetLang;
    const rawBody =
      (email.body || '').trim() ||
      (email.bodyHtml
        ? email.bodyHtml.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        : '');
    const combined = email.subject
      ? `[[SUBJECT]]\n${email.subject}\n[[BODY]]\n${rawBody}`
      : rawBody;

    setIsTranslating(true);
    setShowTranslatedText(true);
    try {
      const res = await window.electronAPI.translateEmailText({
        text: combined,
        targetLang,
      });
      if (!res.success || !res.translatedText) {
        setTranslationResult({
          emailId: email.id,
          targetLang,
          error: res.error || 'Falha ao traduzir e-mail.',
        });
        return;
      }
      let translatedSubject: string | undefined;
      let translatedBody = res.translatedText;
      const markerIdx = res.translatedText.indexOf('[[BODY]]');
      if (markerIdx !== -1) {
        translatedSubject = res.translatedText
          .slice(0, markerIdx)
          .replace('[[SUBJECT]]', '')
          .trim();
        translatedBody = res.translatedText.slice(markerIdx + 8).trim();
      }
      setTranslationResult({
        emailId: email.id,
        subject: translatedSubject,
        body: translatedBody,
        detectedLang: res.detectedLang,
        targetLang,
      });
    } finally {
      setIsTranslating(false);
    }
  };

  useEffect(() => {
    if (!email?.id) {
      setPrivateNotePreview('');
      return;
    }
    setPrivateNotePreview(getPrivateNoteForEmail(email.id));
    setPgpResult((prev) => (prev?.emailId === email.id ? prev : null));
    setTranslationResult((prev) => (prev?.emailId === email.id ? prev : null));
    const onNotesUpdated = () => setPrivateNotePreview(getPrivateNoteForEmail(email.id));
    window.addEventListener('anectta:notes-updated', onNotesUpdated);
    return () => window.removeEventListener('anectta:notes-updated', onNotesUpdated);
  }, [email?.id]);
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
    setExpandedThreadIds({});
  }, [email?.id]);

  // Export & Print State
  const [isExportingEml, setIsExportingEml] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [emlToast, setEmlToast] = useState<string | null>(null);

  const handlePrintEmail = async () => {
    if (!email || isPrinting) return;
    setIsPrinting(true);
    soundService.play('click');
    try {
      const sanitized = email.bodyHtml
        ? sanitizeEmailHtml(email.bodyHtml, {
            blockTrackingPixels,
            blockExternalImages:
              blockExternalImages && !revealedImagesEmailIds[email.id] && !senderInList(email.senderEmail, trustedSenders),
          }).html
        : undefined;
      const attachments = filterRealAttachments(email.attachments).map((a) => a.name);

      if (window.electronAPI?.printEmail) {
        const res = await window.electronAPI.printEmail({
          subject: email.subject,
          sender: email.sender,
          senderEmail: email.senderEmail,
          recipient: email.recipient,
          cc: email.cc,
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
        } else if (res.blocked) {
          soundService.play('error');
          setBlockedAttachment({ name: att.name, path: att.path!, kind: res.blocked, ext: res.ext || '' });
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

  if (!email) {
    return (
      <main className="flex-1 bg-slate-950 flex flex-col items-center justify-center text-slate-500 p-8 select-text">
        <svg
          width="136"
          height="114"
          viewBox="0 0 136 114"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="mb-4 text-slate-400"
          aria-hidden="true"
        >
          <line x1="18" y1="22" x2="32" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
          <line x1="24" y1="30" x2="34" y2="30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
          <rect x="39" y="12" width="58" height="40" rx="5" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="2" />
          <path d="M41 16L68 36L95 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="48" y1="43" x2="57" y2="35" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
          <line x1="88" y1="43" x2="79" y2="35" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
          <path d="M32 58C32 54.6863 34.6863 52 38 52H98C101.314 52 104 54.6863 104 58V62H32V58Z" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="2" />
          <path d="M27 68C27 64.6863 29.6863 62 33 62H103C106.314 62 109 64.6863 109 68V73H27V68Z" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2" />
          <path d="M21 50C21 47.7909 22.7909 46 25 46H29M115 50C115 47.7909 113.209 46 111 46H107" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M21 50V94C21 98.4183 24.5817 102 29 102H107C111.418 102 115 98.4183 115 94V50" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M21 73H50C51.6569 73 53 74.3431 53 76C53 80.4183 56.5817 84 61 84H75C79.4183 84 83 80.4183 83 76C83 74.3431 84.3431 73 86 73H115" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        <h3 className="text-base font-bold text-slate-200 mb-1">
          Tudo pronto por aqui
        </h3>
        <p className="text-xs text-slate-500 text-center max-w-sm mb-5">
          Escolha uma mensagem na lista ao lado ou comece uma nova ação.
        </p>
        {onComposeNewEmail && (
          <div className="flex items-center justify-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={onComposeNewEmail}
              className="accent-solid-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Escrever novo e-mail</span>
            </button>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="flex-1 bg-slate-950 flex flex-col h-full overflow-hidden select-text">
      {/* Barra de ações: botões quadrados só com ícone, cada ação com sua cor (nome no tooltip) */}
      <div className="border-b border-slate-800/80 px-5 py-2.5 flex items-center gap-3 flex-wrap shrink-0 bg-slate-950/60">
        {/* Grupo Esquerdo: Voltar, Responder, Responder a Todos, Encaminhar */}
        <div className="flex items-center flex-wrap gap-2">
          {onBackToList && (
            <button
              type="button"
              onClick={onBackToList}
              {...actionTile('slate')}
              title="Voltar para a lista de e-mails"
              aria-label="Voltar para a lista de e-mails"
            >
              <ArrowLeft className={ACTION_ICON} />
            </button>
          )}

          <button
            type="button"
            onClick={() => onReply(email)}
            {...actionTile('teal')}
            title={email.folder === 'drafts' ? 'Continuar editando' : 'Responder'}
            aria-label={email.folder === 'drafts' ? 'Continuar editando' : 'Responder'}
          >
            <Reply className={ACTION_ICON} />
          </button>

          {onReplyAll && (
            <button
              type="button"
              onClick={() => onReplyAll(email)}
              {...actionTile('blue')}
              title="Responder a Todos"
              aria-label="Responder a Todos"
            >
              <ReplyAll className={ACTION_ICON} />
            </button>
          )}

          {onForward && (
            <button
              type="button"
              onClick={() => onForward(email)}
              {...actionTile('violet')}
              title="Encaminhar"
              aria-label="Encaminhar"
            >
              <Forward className={ACTION_ICON} />
            </button>
          )}
        </div>

        {/* Grupo Direito: Arquivar, Excluir, Imprimir, Spam, Adiar, Follow-up, Tarefa, Traduzir, CRM e Mais */}
        <div className="ml-auto flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onArchive(email.id)}
            {...actionTile('teal')}
            title="Arquivar"
            aria-label="Arquivar"
          >
            <Archive className={ACTION_ICON} />
          </button>

          <button
            type="button"
            onClick={() =>
              bulkSelectedCount > 1 && onDeleteBulk ? onDeleteBulk() : onDelete(email.id)
            }
            {...actionTile('rose')}
            title={
              bulkSelectedCount > 1 && onDeleteBulk
                ? `Excluir os ${bulkSelectedCount} e-mails selecionados`
                : 'Excluir'
            }
            aria-label="Excluir"
          >
            <Trash2 className={ACTION_ICON} />
          </button>

          <button
            type="button"
            onClick={handlePrintEmail}
            disabled={isPrinting}
            {...actionTile('blue')}
            title="Imprimir e-mail ou salvar em PDF"
            aria-label="Imprimir"
          >
            {isPrinting ? <Loader2 className={`${ACTION_ICON} animate-spin`} /> : <Printer className={ACTION_ICON} />}
          </button>

          {email.folder !== 'junk' && onMarkSpam && (
            <button
              type="button"
              onClick={() => onMarkSpam(email.id)}
              {...actionTile('orange')}
              title="Marcar como Spam e mover futuros e-mails deste remetente para o Lixo Eletrônico"
              aria-label="Marcar como Spam"
            >
              <AlertOctagon className={ACTION_ICON} />
            </button>
          )}

          {email.folder === 'junk' && onUnmarkSpam && (
            <button
              type="button"
              onClick={() => onUnmarkSpam(email.id)}
              {...actionTile('emerald')}
              title="Desmarcar como Spam e retornar para Caixa de Entrada"
              aria-label="Não é Spam"
            >
              <CheckCircle className={ACTION_ICON} />
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (onSnoozeWithTime) {
                  setIsFollowUpMenuOpen(false);
                  setIsSnoozeMenuOpen((prev) => !prev);
                } else {
                  onSnooze(email.id);
                }
              }}
              {...actionTile('amber', isSnoozeMenuOpen)}
              title="Adiar e-mail para voltar à Caixa de Entrada depois"
              aria-label="Adiar"
            >
              <Clock className={ACTION_ICON} />
            </button>
            {isSnoozeMenuOpen && onSnoozeWithTime && (
              <>
                <div className="fixed inset-0 z-[80]" onClick={() => setIsSnoozeMenuOpen(false)} />
                <div className="absolute left-0 top-full mt-1.5 z-[85] w-60 rounded-xl bg-slate-900 border border-slate-700/90 shadow-2xl p-2 space-y-1 text-xs">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Adiar até...
                  </div>
                  {[
                    {
                      label: 'Daqui a 3 horas',
                      ms: Date.now() + 3 * 60 * 60 * 1000,
                    },
                    {
                      label: 'Amanhã às 09:00',
                      ms: (() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 1);
                        d.setHours(9, 0, 0, 0);
                        return d.getTime();
                      })(),
                    },
                    {
                      label: 'Próxima segunda às 09:00',
                      ms: (() => {
                        const d = new Date();
                        const diff = (8 - d.getDay()) % 7 || 7;
                        d.setDate(d.getDate() + diff);
                        d.setHours(9, 0, 0, 0);
                        return d.getTime();
                      })(),
                    },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        onSnoozeWithTime(email.id, opt.ms, opt.label);
                        setIsSnoozeMenuOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-800 transition-colors flex items-center justify-between"
                    >
                      <span>{opt.label}</span>
                      <Clock className="w-3 h-3 text-amber-400" />
                    </button>
                  ))}
                  <div className="pt-1.5 mt-1 border-t border-slate-800 space-y-1.5 px-1">
                    <input
                      type="datetime-local"
                      value={customSnoozeValue}
                      onChange={(e) => setCustomSnoozeValue(e.target.value)}
                      className="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-[11px]"
                    />
                    <button
                      type="button"
                      disabled={!customSnoozeValue}
                      onClick={() => {
                        const ts = new Date(customSnoozeValue).getTime();
                        if (!Number.isNaN(ts) && ts > Date.now()) {
                          onSnoozeWithTime(
                            email.id,
                            ts,
                            new Date(ts).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          );
                          setIsSnoozeMenuOpen(false);
                          setCustomSnoozeValue('');
                        }
                      }}
                      className="w-full py-1 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[11px] font-semibold"
                    >
                      Aplicar data personalizada
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {onSetFollowUp && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsSnoozeMenuOpen(false);
                  setIsFollowUpMenuOpen((prev) => !prev);
                }}
                {...actionTile('violet', !!email.followUpAt || isFollowUpMenuOpen)}
                title={email.followUpAt ? 'Follow-up definido — alterar lembrete' : 'Definir lembrete se não houver resposta (Follow-up)'}
                aria-label="Follow-up"
              >
                <BellRing className={ACTION_ICON} />
              </button>
              {isFollowUpMenuOpen && (
                <>
                  <div className="fixed inset-0 z-[80]" onClick={() => setIsFollowUpMenuOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-[85] w-56 rounded-xl bg-slate-900 border border-slate-700/90 shadow-2xl p-2 space-y-1 text-xs">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Lembrar se sem resposta em...
                    </div>
                    {[
                      { label: 'Em 24 horas', ms: Date.now() + 24 * 60 * 60 * 1000 },
                      { label: 'Em 2 dias', ms: Date.now() + 2 * 24 * 60 * 60 * 1000 },
                      { label: 'Em 3 dias', ms: Date.now() + 3 * 24 * 60 * 60 * 1000 },
                      { label: 'Em 1 semana', ms: Date.now() + 7 * 24 * 60 * 60 * 1000 },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          onSetFollowUp(email.id, opt.ms, opt.label);
                          setIsFollowUpMenuOpen(false);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-800 transition-colors"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {onCreateTaskFromEmail && (
            <button
              type="button"
              onClick={() => onCreateTaskFromEmail(email)}
              {...actionTile('emerald')}
              title="Transformar este e-mail em tarefa no módulo Tarefas"
              aria-label="Criar tarefa"
            >
              <CheckSquare className={ACTION_ICON} />
            </button>
          )}

          <button
            type="button"
            disabled={isTranslating}
            onClick={() => void handleTranslateEmail()}
            {...actionTile('sky', translationResult?.emailId === email.id && !translationResult.error)}
            title="Traduzir e-mail instantaneamente"
            aria-label="Traduzir"
          >
            {isTranslating ? (
              <Loader2 className={`${ACTION_ICON} animate-spin`} />
            ) : (
              <Languages className={ACTION_ICON} />
            )}
          </button>

          {onToggleContactContext && !isModalMode && (
            <button
              type="button"
              onClick={onToggleContactContext}
              {...actionTile('yellow', !!isContactContextOpen)}
              title="Abrir/Fechar Painel Lateral Mini-CRM, Histórico, Anexos e Notas Privadas"
              aria-label="CRM e Notas"
            >
              <PanelRight className={ACTION_ICON} />
            </button>
          )}
        </div>

        {/* Botão "Mais ações" com menu suspenso em duas colunas */}
        <div className="relative flex items-center">
          <button
            ref={moreBtnRef}
            type="button"
            onClick={() => {
              soundService.play('click');
              setIsPrivacyPopoverOpen(false);
              setIsMoreMenuOpen((prev) => !prev);
            }}
            {...actionTile('slate', isMoreMenuOpen)}
            title="Mais ações"
            aria-label="Mais ações"
          >
            <MoreActionsDotsIcon />
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

                    {!isModalMode && !isInTab && onOpenInNewTab && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          soundService.play('pop');
                          onOpenInNewTab(email.id);
                        }}
                        className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
                        title="Fixar este e-mail em uma nova aba"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                        <span>Abrir em aba</span>
                      </button>
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
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0 max-w-2xl">
              <h1 className="text-xl font-bold text-slate-100 tracking-tight leading-snug">
                {email.subject}
              </h1>
              {threadMessages && threadMessages.length > 1 && (() => {
                const otherMsgs = threadMessages.filter((m) => m.id !== email.id);
                const allExpanded =
                  otherMsgs.length > 0 && otherMsgs.every((m) => expandedThreadIds[m.id]);
                return (
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-500/15 text-brand-300 border border-brand-500/30">
                      <MessagesSquare className="w-3 h-3" />
                      <span>{threadMessages.length} mensagens na conversa</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        soundService.play('pop');
                        const next: Record<string, boolean> = {};
                        if (!allExpanded) {
                          for (const m of otherMsgs) next[m.id] = true;
                        }
                        setExpandedThreadIds(next);
                      }}
                      className="text-[11px] font-medium text-slate-400 hover:text-brand-300 underline transition-colors"
                    >
                      {allExpanded ? 'Recolher anteriores' : 'Expandir todas'}
                    </button>
                  </div>
                );
              })()}
            </div>
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

          {/* Banner de Cancelar Inscrição 1-Clique (List-Unsubscribe / Newsletters) */}
          {email.folder !== 'sent' &&
            onUnsubscribe &&
            !unsubscribedIds[email.id] &&
            (() => {
              const unsub = parseUnsubscribeInfo(email);
              if (!unsub) return null;
              return (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center space-x-2 text-xs text-amber-200">
                    <MailX className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Mensagem de lista ou newsletter detectada.
                      {unsub.supportsOneClickPost ? ' Suporta descadastro automático em 1 clique.' : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isUnsubscribing}
                    onClick={async () => {
                      setIsUnsubscribing(true);
                      try {
                        await onUnsubscribe(email);
                        setUnsubscribedIds((prev) => ({ ...prev, [email.id]: true }));
                      } finally {
                        setIsUnsubscribing(false);
                      }
                    }}
                    className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors shrink-0"
                  >
                    {isUnsubscribing ? 'Cancelando...' : 'Cancelar inscrição'}
                  </button>
                </div>
              );
            })()}

          {/* Banner de Nota Privada (quando o usuário salvou nota para este e-mail) */}
          {privateNotePreview.trim() && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 text-xs text-amber-200 min-w-0">
                <StickyNote className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-amber-300 block">
                    Nota Privada (somente você vê)
                  </span>
                  <p className="text-xs text-amber-100 whitespace-pre-wrap break-words">
                    {privateNotePreview}
                  </p>
                </div>
              </div>
              {onToggleContactContext && !isContactContextOpen && (
                <button
                  type="button"
                  onClick={onToggleContactContext}
                  className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 shrink-0"
                >
                  Editar
                </button>
              )}
            </div>
          )}

          {/* Banner OpenPGP (Mensagem Criptografada ou Assinada Digitalmente) */}
          {(() => {
            const pgpBlock = detectPgpBlock(email.body);
            if (!pgpBlock) return null;
            const currentPgpRes = pgpResult?.emailId === email.id ? pgpResult : null;
            const ownKey = findOwnKeyByEmail(email.recipient) || findOwnKeyByEmail();
            const senderKey = findContactPublicKeyByEmail(email.senderEmail);
            return (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-xs text-emerald-200">
                    {pgpBlock.type === 'encrypted' ? (
                      <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
                    )}
                    <span className="font-semibold">
                      {pgpBlock.type === 'encrypted'
                        ? 'Mensagem Criptografada Ponta-a-Ponta (OpenPGP)'
                        : 'Mensagem Assinada Digitalmente (OpenPGP)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {pgpBlock.type === 'encrypted' && ownKey?.hasPassphrase && !currentPgpRes?.plainText && (
                      <input
                        type="password"
                        value={pgpPassphrase}
                        onChange={(e) => setPgpPassphrase(e.target.value)}
                        placeholder="Senha da chave PGP"
                        className="px-2.5 py-1 rounded-lg bg-slate-950 border border-emerald-500/40 text-xs text-slate-100 w-40 focus:outline-none"
                      />
                    )}
                    <button
                      type="button"
                      disabled={pgpBusy}
                      onClick={async () => {
                        if (!window.electronAPI?.pgpDecryptVerify) return;
                        setPgpBusy(true);
                        try {
                          const res = await window.electronAPI.pgpDecryptVerify({
                            armoredText: pgpBlock.block,
                            privateKey: ownKey?.privateKey,
                            passphrase: pgpPassphrase || undefined,
                            senderPublicKey: senderKey?.publicKey,
                          });
                          setPgpResult({
                            emailId: email.id,
                            plainText: res.plainText,
                            verified: res.verified,
                            signerKeyId: res.signerKeyId,
                            error: res.success ? undefined : res.error,
                          });
                        } finally {
                          setPgpBusy(false);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>
                        {pgpBusy
                          ? 'Processando...'
                          : pgpBlock.type === 'encrypted'
                          ? 'Descriptografar'
                          : 'Verificar Assinatura'}
                      </span>
                    </button>
                  </div>
                </div>

                {currentPgpRes?.error && (
                  <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2.5 py-1.5">
                    {currentPgpRes.error}
                  </p>
                )}

                {currentPgpRes?.plainText && (
                  <div className="rounded-lg bg-slate-950/90 border border-emerald-500/30 p-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Unlock className="w-3.5 h-3.5" /> Conteúdo Descriptografado
                      </span>
                      {currentPgpRes.signerKeyId && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            currentPgpRes.verified
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {currentPgpRes.verified
                            ? `✓ Assinatura válida (${currentPgpRes.signerKeyId})`
                            : `Assinatura não verificada (${currentPgpRes.signerKeyId})`}
                        </span>
                      )}
                    </div>
                    <pre className="text-xs text-slate-100 whitespace-pre-wrap font-sans leading-relaxed">
                      {currentPgpRes.plainText}
                    </pre>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Banner de Tradução Instantânea */}
          {translationResult?.emailId === email.id && (
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-xs text-sky-200">
                  <Languages className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="font-semibold">
                    Tradução Instantânea
                    {translationResult.detectedLang
                      ? ` (${translationResult.detectedLang.toUpperCase()} → ${translationResult.targetLang.toUpperCase()})`
                      : ''}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <select
                    value={translateTargetLang}
                    onChange={(e) => {
                      const next = e.target.value;
                      setTranslateTargetLang(next);
                      try {
                        localStorage.setItem('anectta_translate_target_lang', next);
                      } catch {}
                      void handleTranslateEmail(next);
                    }}
                    className="bg-slate-900 border border-sky-500/30 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none"
                    title="Idioma de destino"
                  >
                    <option value="pt">Português</option>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="it">Italiano</option>
                  </select>

                  {translationResult.body && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowTranslatedText((v) => !v)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition-colors"
                      >
                        {showTranslatedText ? 'Ocultar tradução' : 'Mostrar tradução'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const txt = translationResult.subject
                            ? `${translationResult.subject}\n\n${translationResult.body}`
                            : translationResult.body || '';
                          navigator.clipboard?.writeText(txt);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                        title="Copiar texto traduzido"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setTranslationResult(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                    title="Fechar tradução"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {translationResult.error && (
                <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2.5 py-1.5">
                  {translationResult.error}
                </p>
              )}

              {translationResult.body && showTranslatedText && (
                <div className="rounded-lg bg-slate-950/90 border border-sky-500/25 p-3 space-y-2">
                  {translationResult.subject && (
                    <div className="text-xs font-bold text-sky-200 border-b border-slate-800 pb-1.5">
                      {translationResult.subject}
                    </div>
                  )}
                  <pre className="text-xs text-slate-100 whitespace-pre-wrap font-sans leading-relaxed">
                    {translationResult.body}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Banner S/MIME (Certificado X.509 / PKCS#7) */}
          {(() => {
            const pkcs7Block = detectSmimeBlock(email.body);
            if (!pkcs7Block) return null;
            const currentSmime = smimeResult?.emailId === email.id ? smimeResult : null;
            const ownCert = findOwnSmimeCertByEmail(email.recipient) || findOwnSmimeCertByEmail();
            return (
              <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/30 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-xs text-violet-200">
                    <Award className="w-4 h-4 text-violet-400 shrink-0" />
                    <span className="font-semibold">
                      Mensagem Protegida com S/MIME (X.509 / PKCS#7)
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={smimeBusy}
                    onClick={async () => {
                      if (!window.electronAPI?.smimeDecryptVerify) return;
                      setSmimeBusy(true);
                      try {
                        const res = await window.electronAPI.smimeDecryptVerify({
                          pkcs7Pem: pkcs7Block,
                          privateKeyPem: ownCert?.privateKeyPem,
                          certPem: ownCert?.certPem,
                        });
                        setSmimeResult({
                          emailId: email.id,
                          mode: res.mode,
                          plainText: res.plainText,
                          signerSubject: res.signerSubject,
                          signerIssuer: res.signerIssuer,
                          validTo: res.validTo,
                          error: res.success ? undefined : res.error,
                        });
                      } finally {
                        setSmimeBusy(false);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>{smimeBusy ? 'Processando...' : 'Abrir / Verificar S/MIME'}</span>
                  </button>
                </div>

                {currentSmime?.error && (
                  <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-2.5 py-1.5">
                    {currentSmime.error}
                  </p>
                )}

                {currentSmime?.plainText && (
                  <div className="rounded-lg bg-slate-950/90 border border-violet-500/30 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                      <span className="text-violet-300 font-semibold">
                        {currentSmime.mode === 'decrypted'
                          ? '✓ Conteúdo S/MIME Descriptografado'
                          : '✓ Assinatura Digital X.509 Verificada'}
                      </span>
                      {currentSmime.signerSubject && (
                        <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-200 text-[10px]">
                          {currentSmime.signerSubject}
                          {currentSmime.signerIssuer ? ` · AC: ${currentSmime.signerIssuer}` : ''}
                        </span>
                      )}
                    </div>
                    <pre className="text-xs text-slate-100 whitespace-pre-wrap font-sans leading-relaxed">
                      {currentSmime.plainText}
                    </pre>
                  </div>
                )}
              </div>
            );
          })()}

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
                  {(() => {
                    const lvl = authLevel(email.authResults);
                    if (lvl === 'unknown') return null;
                    const r = email.authResults || {};
                    const detail = `SPF: ${r.spf || '—'} · DKIM: ${r.dkim || '—'} · DMARC: ${r.dmarc || '—'}`;
                    return lvl === 'verified' ? (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                        title={`Remetente verificado pelo servidor de e-mail (${detail})`}
                      >
                        <ShieldCheck className="w-3 h-3" /> Verificado
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                        title={`O servidor de e-mail não conseguiu confirmar o remetente (${detail})`}
                      >
                        <ShieldAlert className="w-3 h-3" /> Remetente não confirmado
                      </span>
                    );
                  })()}
                </div>
                {replyRisk.level !== 'none' && replyRisk.replyTo && (
                  <div className="text-xs text-slate-400">
                    Respostas vão para:{' '}
                    <span className={replyRisk.level === 'warn' ? 'text-amber-300 font-semibold' : 'text-slate-300 font-medium'}>
                      {replyRisk.replyTo}
                    </span>
                  </div>
                )}
                <div className="text-xs text-slate-400">
                  Para:{' '}
                  <span className="text-slate-300 font-medium">
                    {email.recipient}
                  </span>
                </div>
                {email.cc && (
                  <div className="text-xs text-slate-400">
                    Cc:{' '}
                    <span className="text-slate-300 font-medium">
                      {email.cc}
                    </span>
                  </div>
                )}
                {email.bcc && (
                  <div className="text-xs text-slate-400">
                    CCO:{' '}
                    <span className="text-slate-300 font-medium">
                      {email.bcc}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {email.senderEmail && onToggleVip && !['sent', 'drafts', 'outbox'].includes(String(email.folder)) && (
              <button
                type="button"
                onClick={() => {
                  soundService.play('click');
                  onToggleVip(email.senderEmail);
                }}
                title={
                  isVipSender
                    ? `Tirar ${email.senderEmail} dos contatos VIP`
                    : `Marcar ${email.senderEmail} como VIP: os e-mails vão para o topo dos Prioritários`
                }
                className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer shrink-0 ${
                  isVipSender
                    ? 'bg-amber-400/20 text-amber-300 border-amber-400/40 hover:bg-amber-400/30'
                    : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:text-amber-300 hover:border-amber-400/40'
                }`}
              >
                <span>{isVipSender ? '⭐ VIP' : '☆ Marcar VIP'}</span>
              </button>
            )}

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

        {/* Escudo Anectta: "Responder para" suspeito */}
        {replyRisk.level === 'warn' && (
          <div
            className={`flex items-start gap-2 px-3.5 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-100 max-w-none`}
          >
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Escudo Anectta:</strong> se você responder, a mensagem vai para{' '}
              <strong className="text-amber-200">{replyRisk.replyTo}</strong>, e não para {email.senderEmail}.{' '}
              {replyRisk.reason}
            </span>
          </div>
        )}

        {/* Janela: anexo que não abre direto (tipo perigoso ou programa disfarçado) */}
        {blockedAttachment && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(2, 6, 23, 0.6)' }}
            onClick={() => setBlockedAttachment(null)}
          >
            <div
              role="dialog"
              aria-label="Anexo bloqueado"
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-2xl border shadow-2xl bg-slate-950 p-5 space-y-3 ${
                blockedAttachment.kind === 'disguised' ? 'border-rose-500/60' : 'border-amber-500/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className={`w-5 h-5 ${blockedAttachment.kind === 'disguised' ? 'text-rose-400' : 'text-amber-400'}`} />
                <h3 className="text-sm font-bold text-white">
                  {blockedAttachment.kind === 'disguised' ? 'Anexo perigoso: programa disfarçado' : 'Este anexo não abre direto'}
                </h3>
              </div>
              <p className="text-sm text-slate-200 font-mono break-all">{blockedAttachment.name}</p>
              {blockedAttachment.kind === 'disguised' ? (
                <p className="text-xs text-rose-200">
                  O arquivo diz ser "{blockedAttachment.ext || 'documento'}", mas na verdade é um <strong>programa</strong>. Isso é
                  típico de vírus. Recomendamos <strong>não abrir</strong> e excluir o e-mail.
                </p>
              ) : (
                <p className="text-xs text-slate-300">
                  Arquivos {blockedAttachment.ext ? <strong>{blockedAttachment.ext}</strong> : 'deste tipo'} podem conter
                  programas e executar algo no seu computador. Só abra se você <strong>esperava receber este arquivo</strong> de
                  alguém que você conhece. Ao abrir pela pasta, o Windows ainda vai avisar que o arquivo veio da internet.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setBlockedAttachment(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white"
                  autoFocus
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const b = blockedAttachment;
                    setBlockedAttachment(null);
                    const res = await window.electronAPI?.saveAttachmentAs?.({ sourcePath: b.path, defaultName: b.name });
                    if (res?.success) showAttachmentFeedback(`Anexo salvo em: ${res.savedPath}`);
                    else if (res && !res.canceled) showAttachmentFeedback(res.error || 'Não foi possível salvar.', true);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-600 text-slate-200 hover:bg-slate-800"
                >
                  Salvar em…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const b = blockedAttachment;
                    setBlockedAttachment(null);
                    void window.electronAPI?.showAttachmentInFolder?.(b.path);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${
                    blockedAttachment.kind === 'disguised' ? 'bg-rose-700 hover:bg-rose-600' : 'bg-amber-600 hover:bg-amber-500'
                  }`}
                >
                  Mostrar na pasta
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Escudo Anectta: possível golpe (phishing) */}
        {phishingReport.level !== 'none' && (
          <div
            role="alert"
            className={`px-3.5 py-3 rounded-xl border text-xs space-y-2 max-w-none ${
              phishingReport.level === 'danger'
                ? 'border-rose-500/50 bg-rose-500/15 text-rose-100'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className={`w-4 h-4 shrink-0 ${phishingReport.level === 'danger' ? 'text-rose-400' : 'text-amber-400'}`} />
              <span className="flex-1">
                <strong>Escudo Anectta:</strong>{' '}
                {phishingReport.level === 'danger'
                  ? 'Possível golpe. Não clique em links, não abra anexos e não informe senhas ou dados.'
                  : 'E-mail suspeito. Tenha cuidado com links e pedidos de dados.'}
              </span>
            </div>
            <ul className="list-disc pl-8 space-y-0.5 opacity-90">
              {phishingReport.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className="flex items-center gap-2 pl-6">
              {onMarkSpam && email.folder !== 'junk' && (
                <button
                  type="button"
                  onClick={() => onMarkSpam(email.id)}
                  className="px-2.5 py-1 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white font-semibold"
                >
                  Mover para o Lixo eletrônico
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const next = new Set(phishingTrusted);
                  next.add((email.senderEmail || '').toLowerCase());
                  savePhishingTrusted(next);
                  setPhishingTrusted(next);
                }}
                className="px-2.5 py-1 rounded-lg border border-white/20 hover:bg-white/10 font-semibold"
                title="Não mostrar este aviso para mensagens deste remetente"
              >
                Não é golpe
              </button>
            </div>
          </div>
        )}

        {/* Amoroso — Assistente Anectta (resumo rápido local + ações) */}
        {showAssistant && !['drafts', 'sent', 'outbox'].includes(String(email.folder)) && (
          <AssistantCard
            email={email}
            wide
            onQuickReply={onAssistantQuickReply}
            onCreateEvent={onAssistantCreateEvent}
            onCreateReminder={onAssistantCreateReminder}
            onHide={onHideAssistant}
          />
        )}

        {/* Cartão Interativo de Convite de Reunião (.ics / RSVP) */}
        {email.calendarInvite && (
          <div className={`p-4 rounded-xl border border-indigo-500/35 bg-indigo-500/10 space-y-3 max-w-none`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start space-x-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5 text-indigo-300" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center space-x-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                      Convite de Reunião (.ics)
                    </span>
                    {email.calendarInvite.rsvpStatus && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          email.calendarInvite.rsvpStatus === 'ACCEPTED'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : email.calendarInvite.rsvpStatus === 'TENTATIVE'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        {email.calendarInvite.rsvpStatus === 'ACCEPTED'
                          ? '✓ Aceito'
                          : email.calendarInvite.rsvpStatus === 'TENTATIVE'
                          ? '? Talvez'
                          : '✕ Recusado'}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-white leading-snug">
                    {email.calendarInvite.summary}
                  </h3>
                  <div className="text-xs text-slate-300 flex items-center flex-wrap gap-x-3 gap-y-1 pt-0.5">
                    <span className="inline-flex items-center space-x-1 font-mono text-indigo-200">
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      <span>
                        {email.calendarInvite.date.split('-').reverse().join('/')}
                        {email.calendarInvite.allDay
                          ? ' • Dia inteiro'
                          : ` • ${email.calendarInvite.startTime} – ${email.calendarInvite.endTime}`}
                      </span>
                    </span>
                    {email.calendarInvite.location && (
                      <span className="inline-flex items-center space-x-1 text-slate-300">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-xs">{email.calendarInvite.location}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {email.calendarInvite.meetingUrl && (
                <button
                  type="button"
                  onClick={() => {
                    const url = email.calendarInvite?.meetingUrl;
                    if (!url) return;
                    if (window.electronAPI?.openExternal) {
                      void window.electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors shrink-0"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Entrar na Reunião</span>
                </button>
              )}
            </div>

            {onRespondCalendarInvite && (
              <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-indigo-500/20">
                <span className="text-[11px] text-slate-300">
                  Responder convite (envia RSVP ao organizador e atualiza seu Calendário):
                </span>
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    disabled={isRespondingRsvp}
                    onClick={async () => {
                      setIsRespondingRsvp(true);
                      try {
                        await onRespondCalendarInvite(email, 'ACCEPTED');
                      } finally {
                        setIsRespondingRsvp(false);
                      }
                    }}
                    className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                      email.calendarInvite.rsvpStatus === 'ACCEPTED'
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/35'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Aceitar</span>
                  </button>
                  <button
                    type="button"
                    disabled={isRespondingRsvp}
                    onClick={async () => {
                      setIsRespondingRsvp(true);
                      try {
                        await onRespondCalendarInvite(email, 'TENTATIVE');
                      } finally {
                        setIsRespondingRsvp(false);
                      }
                    }}
                    className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                      email.calendarInvite.rsvpStatus === 'TENTATIVE'
                        ? 'bg-amber-600 text-white border-amber-500'
                        : 'bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border-amber-500/35'
                    }`}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Talvez</span>
                  </button>
                  <button
                    type="button"
                    disabled={isRespondingRsvp}
                    onClick={async () => {
                      setIsRespondingRsvp(true);
                      try {
                        await onRespondCalendarInvite(email, 'DECLINED');
                      } finally {
                        setIsRespondingRsvp(false);
                      }
                    }}
                    className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
                      email.calendarInvite.rsvpStatus === 'DECLINED'
                        ? 'bg-rose-600 text-white border-rose-500'
                        : 'bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border-rose-500/35'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Recusar</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mensagens anteriores da conversa (Thread) */}
        {threadMessages && threadMessages.length > 1 && (() => {
          const previousMessages = threadMessages.filter((m) => m.id !== email.id);
          if (previousMessages.length === 0) return null;

          return (
            <div className={`space-y-2 max-w-none`}>
              {previousMessages.map((msg) => {
                const isExpanded = Boolean(expandedThreadIds[msg.id]);
                const allowMsgImages = Boolean(revealedImagesEmailIds[msg.id]);
                const msgSanitized =
                  isExpanded && msg.bodyHtml
                    ? sanitizeEmailHtml(msg.bodyHtml, {
                        blockTrackingPixels,
                        blockExternalImages: blockExternalImages && !allowMsgImages,
                      })
                    : null;
                const msgAttachments = filterRealAttachments(msg.attachments, msg.bodyHtml);

                return (
                  <div
                    key={msg.id}
                    className="rounded-xl border border-slate-800/90 bg-slate-900/60 overflow-hidden transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        soundService.play('click');
                        setExpandedThreadIds((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }));
                      }}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <SenderAvatar
                          name={msg.sender}
                          email={msg.senderEmail || msg.sender}
                          avatar={msg.avatar}
                          size={28}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-slate-200 truncate">
                              {msg.sender}
                            </span>
                            {msg.folder === 'sent' && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                                Enviado
                              </span>
                            )}
                            {msgAttachments.length > 0 && (
                              <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                            )}
                          </div>
                          {!isExpanded && (
                            <p className="text-[11px] text-slate-400 truncate max-w-md">
                              {msg.snippet || msg.body}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 shrink-0">
                        {formatReceivedLabel(msg)}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-slate-800/80 space-y-3">
                        <div className="flex items-start justify-between gap-2 flex-wrap text-[11px] text-slate-400">
                          <div className="space-y-0.5 min-w-0">
                            <div>
                              <span className="text-slate-500">De:</span>{' '}
                              <span className="text-slate-300 font-medium">
                                {msg.sender} &lt;{msg.senderEmail}&gt;
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500">Para:</span>{' '}
                              <span className="text-slate-300">{msg.recipient}</span>
                            </div>
                            {msg.cc && (
                              <div>
                                <span className="text-slate-500">Cc:</span>{' '}
                                <span className="text-slate-300">{msg.cc}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center space-x-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onReply(msg)}
                              className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                            >
                              <Reply className="w-3 h-3 text-brand-400" />
                              <span>Responder</span>
                            </button>
                            {onReplyAll && (
                              <button
                                type="button"
                                onClick={() => onReplyAll(msg)}
                                className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                              >
                                <ReplyAll className="w-3 h-3 text-sky-400" />
                                <span>Todos</span>
                              </button>
                            )}
                            {onForward && (
                              <button
                                type="button"
                                onClick={() => onForward(msg)}
                                className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                              >
                                <Forward className="w-3 h-3 text-indigo-400" />
                                <span>Encaminhar</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {msgSanitized ? (
                          <div className="space-y-2">
                            {msgSanitized.blockedImagesCount > 0 && (
                              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-200">
                                <span>
                                  {msgSanitized.blockedImagesCount} imagem(ns) externa(s) bloqueada(s).
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRevealedImagesEmailIds((prev) => ({ ...prev, [msg.id]: true }))
                                  }
                                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-100 font-medium"
                                >
                                  Exibir imagens
                                </button>
                              </div>
                            )}
                            <div
                              style={{
                                backgroundColor: '#FFFFFF',
                                color: '#111827',
                                borderColor: 'var(--border-subtle)',
                              }}
                              className="email-body-sanitized text-xs leading-relaxed font-sans rounded-lg overflow-x-auto border p-3"
                              dangerouslySetInnerHTML={{ __html: msgSanitized.html }}
                            />
                          </div>
                        ) : (
                          <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-sans bg-slate-950/50 rounded-lg p-3 border border-slate-800/80">
                            {msg.body}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Physical Attachments Strip (se o e-mail contiver anexos reais) */}
        {(() => {
          const realAttachments = filterRealAttachments(email.attachments, email.bodyHtml);
          if (realAttachments.length === 0) return null;

          return (
            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 max-w-none space-y-2.5">
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
          <div className="p-3 bg-brand-500/10 border border-brand-500/30 text-brand-300 rounded-xl text-xs flex items-center space-x-2 animate-in fade-in max-w-none">
            <CheckCircle className="w-4 h-4 text-brand-400 shrink-0" />
            <span>{emlToast}</span>
          </div>
        )}

        {/* Confirmação ao abrir link: mostra o endereço real antes de sair do Anectta */}
        {pendingLink && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(2, 6, 23, 0.6)' }}
            onClick={() => setPendingLink(null)}
          >
            <div
              role="dialog"
              aria-label="Abrir link"
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-2xl border shadow-2xl bg-slate-950 p-5 space-y-3 ${
                pendingLink.warnings.length > 0 ? 'border-rose-500/50' : 'border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                {pendingLink.warnings.length > 0 ? (
                  <ShieldAlert className="w-5 h-5 text-rose-400" />
                ) : (
                  <ExternalLink className="w-5 h-5 text-sky-400" />
                )}
                <h3 className="text-sm font-bold text-white">
                  {pendingLink.warnings.length > 0 ? 'Cuidado: link suspeito' : 'Abrir link no navegador?'}
                </h3>
              </div>
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 space-y-1">
                <p className="text-[11px] text-slate-500">Você vai para o site:</p>
                {/* Domínio principal (ex.: itau.com.br) em destaque: é ele que diz de quem é o site */}
                <p
                  className={`text-xl font-extrabold break-all ${
                    pendingLink.warnings.length > 0 ? 'text-rose-400' : 'text-sky-300'
                  }`}
                >
                  {baseDomain(hostOf(pendingLink.href)) || pendingLink.href}
                </p>
                {hostOf(pendingLink.href) !== baseDomain(hostOf(pendingLink.href)) && (
                  <p className="text-xs text-slate-400 break-all">Endereço: {hostOf(pendingLink.href)}</p>
                )}
                <p className="text-[11px] text-slate-500 break-all">{pendingLink.href}</p>
              </div>
              {pendingLink.warnings.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-rose-200 space-y-0.5">
                  {pendingLink.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {pendingLink.warnings.length === 0 && (
                <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={dontAskHost} onChange={(e) => setDontAskHost(e.target.checked)} />
                  Não perguntar de novo para {hostOf(pendingLink.href)}
                </label>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(pendingLink.href);
                    setPendingLink(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Copiar endereço
                </button>
                <button
                  type="button"
                  onClick={() => setPendingLink(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white"
                  autoFocus
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (dontAskHost) {
                      const next = new Set(trustedHosts);
                      next.add(hostOf(pendingLink.href));
                      saveTrustedHosts(next);
                      setTrustedHosts(next);
                    }
                    openUrlNow(pendingLink.href);
                    setPendingLink(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white ${
                    pendingLink.warnings.length > 0 ? 'bg-rose-600 hover:bg-rose-500' : 'bg-brand-600 hover:bg-brand-500'
                  }`}
                >
                  {pendingLink.warnings.length > 0 ? 'Abrir mesmo assim' : 'Abrir no navegador'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Escudo Anectta: remetente bloqueado (segue o interruptor "Bloquear remetentes" do Escudo) */}
        {(() => {
          const rule = blockBlockedSenders ? getSenderBlockRule?.(email.senderEmail) : null;
          if (!rule) return null;
          const how = rule.startsWith('@')
            ? `Domínio ${rule} bloqueado`
            : `Remetente ${rule} bloqueado`;
          return (
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-200 max-w-none`}
              title={`${how}. ${email.folder === 'junk' ? 'Para desbloquear, use o botão "Não é Spam" na barra acima.' : ''}`}
            >
              <UserX className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                <strong>Escudo Anectta:</strong> Proteção Ativa (Remetente bloqueado)
              </span>
            </div>
          );
        })()}

        {/* Email Body (Renderiza HTML sanitizado com CSS inline ou texto plano) */}
        {email.bodyHtml ? (() => {
          const allowImages =
            Boolean(revealedImagesEmailIds[email.id]) || senderInList(email.senderEmail, trustedSenders);
          const { html: rawSanitizedHtml, blockedImagesCount, blockedPixelsCount } = sanitizeEmailHtml(email.bodyHtml, {
            blockTrackingPixels,
            blockExternalImages: blockExternalImages && !allowImages,
          });
          // Endereços escritos como texto (sem link) também ficam clicáveis
          const sanitizedHtml = linkifyHtml(rawSanitizedHtml);
          return (
            <div className="space-y-2">
              {blockedPixelsCount > 0 && (
                <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-200 max-w-none`}>
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span
                      title={`${blockedPixelsCount} ${blockedPixelsCount === 1 ? 'rastreador de leitura bloqueado' : 'rastreadores de leitura bloqueados'} nesta mensagem`}
                    >
                      <strong>Escudo Anectta:</strong> Proteção Ativa (Rastreamento de leitura bloqueado)
                    </span>
                  </div>
                </div>
              )}
              {blockedImagesCount > 0 && (
                <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200 max-w-none`}>
                  <div className="flex items-center space-x-2">
                    <ImageIcon className="w-4 h-4 text-amber-400 shrink-0" />
                    <span
                      title={`${blockedImagesCount} ${blockedImagesCount === 1 ? 'imagem externa bloqueada' : 'imagens externas bloqueadas'} para sua privacidade`}
                    >
                      <strong>Escudo Anectta:</strong> Proteção Ativa (Exibição de imagens bloqueada)
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
                  {onTrustSender && email.senderEmail && phishingReport.level === 'none' && (
                    <button
                      type="button"
                      onClick={() => onTrustSender(email.senderEmail)}
                      className="px-2.5 py-1 rounded-lg border border-amber-500/30 hover:bg-amber-500/15 text-amber-100/90 font-medium shrink-0 transition-colors"
                      title="Adicionar aos remetentes confiáveis: imagens sempre visíveis e nunca vai para o Lixo eletrônico"
                    >
                      Sempre exibir deste remetente
                    </button>
                  )}
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
                    requestOpenLink(rawHref, (anchor.textContent || '').trim());
                  }
                }}
                style={{
                  backgroundColor: '#FFFFFF',
                  color: '#111827',
                  borderColor: 'var(--border-subtle)',
                }}
                className={`email-body-sanitized text-sm leading-relaxed font-sans max-w-none rounded-xl overflow-x-auto border shadow-md p-4`}
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
            </div>
          );
        })() : (
          <div
            onClick={(e) => {
              // E-mail só de texto: endereços viram links e abrem no navegador
              const anchor = (e.target as HTMLElement | null)?.closest('a');
              const href = (anchor?.getAttribute('href') || '').trim();
              if (!anchor || !/^(https?:|mailto:)/i.test(href)) return;
              e.preventDefault();
              e.stopPropagation();
              requestOpenLink(href, (anchor.textContent || '').trim());
            }}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#111827',
              borderColor: 'var(--border-subtle)',
            }}
            className={`email-body-sanitized text-sm leading-relaxed whitespace-pre-wrap font-sans max-w-none rounded-xl border p-4`}
          >
            {splitLinks(email.body || '').map((part, i) =>
              part.type === 'link' ? (
                <a
                  key={i}
                  href={part.href}
                  className="text-blue-600 underline break-all"
                  title={part.href}
                >
                  {part.value}
                </a>
              ) : (
                <React.Fragment key={i}>{part.value}</React.Fragment>
              )
            )}
          </div>
        )}
      </div>
    </main>
  );
};
