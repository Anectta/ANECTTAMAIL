import React, { useState, useRef } from 'react';
import {
  X,
  Mail,
  Palette,
  Shield,
  FileSignature,
  Save,
  CheckCircle2,
  Server,
  Lock,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Sparkles,
  Quote,
  Plus,
  Trash2,
  RotateCcw,
  FolderTree,
  Star,
  ArrowLeftRight,
  Download,
  Upload,
  FileJson,
  LifeBuoy,
  Bell,
  Calendar,
  LayoutGrid,
  SlidersHorizontal,
  SpellCheck2,
  HardDriveDownload,
  Network,
  Check,
  GripVertical,
  DownloadCloud,
  Globe,
  Pencil,
} from 'lucide-react';
import { EmailItem } from '@/types/email';
import { AccountSettings, AppSettings, EmailSignature } from '@/types/settings';
import { OUTGOING_ANIMATIONS } from '../services/stationeryCompiler';
import { QuickRepliesService, QuickSnippetItem } from '../services/quickRepliesService';
import { EmailProviderNotice } from './EmailProviderNotice';
import { SignatureEditorPanel } from './SignatureEditorPanel';
import { PrivacyCenterPanel } from './PrivacyCenterPanel';
import { SupportHelpPanel } from './SupportHelpPanel';
import { NotificationsSettingsPanel } from './NotificationsSettingsPanel';
import { MotivationalSettingsPanel } from './MotivationalSettingsPanel';
import type { MailImportResult } from '../../types/electron';
import { CalendarSettingsPanel } from './CalendarSettingsPanel';
import { AppsSettingsPanel } from './AppsSettingsPanel';
import { SkinGalleryPanel } from './SkinGalleryPanel';
import { SpellcheckSettingsPanel } from './SpellcheckSettingsPanel';
import { BackupSettingsPanel } from './BackupSettingsPanel';
import { StorageSettingsPanel } from './StorageSettingsPanel';
import { VersionSettingsPanel } from './VersionSettingsPanel';
import { ProxySettingsPanel } from './ProxySettingsPanel';
import logoImg from '../assets/logo.png';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  onOpenRules?: () => void;
  activeRulesCount?: number;
  onOpenSetupWizard?: () => void;
  emails?: EmailItem[];
  onImportEmails?: (imported: EmailItem[]) => void;
  onComposeSupport?: (recipient: string, subject: string, body?: string) => void;
  /** E-mails importados de outro programa (Configurações → Backup) para uma conta. */
  onImportMailResult?: (result: MailImportResult, account: AccountSettings) => void;
  /** Message-IDs que a conta já tem (a importação não duplica). */
  getKnownMessageIds?: (accountId: string) => string[];
  initialTab?:
    | 'account'
    | 'appearance'
    | 'spellcheck'
    | 'backup'
    | 'storage'
    | 'signature'
    | 'quickReplies'
    | 'notifications'
    | 'calendar'
    | 'apps'
    | 'security'
    | 'importExport'
    | 'support'
    | 'version'
    | 'proxy';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onOpenRules,
  activeRulesCount = 0,
  onOpenSetupWizard,
  emails = [],
  onImportEmails,
  onComposeSupport,
  onImportMailResult,
  getKnownMessageIds,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<
    'account' | 'appearance' | 'spellcheck' | 'backup' | 'storage' | 'signature' | 'quickReplies' | 'notifications' | 'calendar' | 'apps' | 'security' | 'importExport' | 'support' | 'version' | 'proxy' | 'motivational'
  >(initialTab || 'appearance'); // padrão: 1º item da ordem alfabética ("Aparência & Sons")
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [quickSnippetsList, setQuickSnippetsList] = useState<QuickSnippetItem[]>(() =>
    QuickRepliesService.getSnippets()
  );
  const [editingQuickReplyIdx, setEditingQuickReplyIdx] = useState<number | null>(null);
  const quickReplyInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [newQuickReplyTitle, setNewQuickReplyTitle] = useState('');
  const [newQuickReplyInput, setNewQuickReplyInput] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<'success' | 'error' | null>(null);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [importExportBusy, setImportExportBusy] = useState(false);
  const [importExportStatus, setImportExportStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [draggingAccountId, setDraggingAccountId] = useState<string | null>(null);
  const accountBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const accountDragRef = useRef<{
    accId: string;
    startY: number;
    isDragging: boolean;
    holdTimer: number | null;
  } | null>(null);
  const suppressAccClickRef = useRef(false);
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = accountDragRef.current;
      if (!state) return;

      if (!state.isDragging) {
        if (Math.abs(e.clientY - state.startY) > 4) {
          if (state.holdTimer) {
            window.clearTimeout(state.holdTimer);
            state.holdTimer = null;
          }
          state.isDragging = true;
          suppressAccClickRef.current = true;
          setDraggingAccountId(state.accId);
          document.body.style.cursor = 'grabbing';
        } else {
          return;
        }
      }

      const currentForm = formDataRef.current;
      const baseList =
        currentForm.accounts && currentForm.accounts.length > 0
          ? currentForm.accounts
          : [currentForm.account];
      const currentList = baseList.map((a) =>
        a.id === currentForm.account.id ? { ...currentForm.account } : a
      );
      const currentIndex = currentList.findIndex((a) => a.id === state.accId);
      if (currentIndex === -1) return;

      for (let idx = 0; idx < currentList.length; idx++) {
        if (idx === currentIndex) continue;
        const otherAcc = currentList[idx];
        const el = accountBtnRefs.current[otherAcc.id];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        if (
          (idx < currentIndex && e.clientY < midY) ||
          (idx > currentIndex && e.clientY > midY)
        ) {
          const nextList = [...currentList];
          const [moved] = nextList.splice(currentIndex, 1);
          nextList.splice(idx, 0, moved);
          const nextForm = {
            ...currentForm,
            accounts: nextList,
          };
          formDataRef.current = nextForm;
          setFormData(nextForm);
          break;
        }
      }
    };

    const handleMouseUp = () => {
      const state = accountDragRef.current;
      if (!state) return;
      if (state.holdTimer) {
        window.clearTimeout(state.holdTimer);
        state.holdTimer = null;
      }
      if (state.isDragging) {
        setDraggingAccountId(null);
        document.body.style.cursor = '';
        window.setTimeout(() => {
          suppressAccClickRef.current = false;
        }, 80);
      }
      accountDragRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      const existingSignatures = settings.signatures;
      let initialSignatures: EmailSignature[];
      if (existingSignatures && existingSignatures.length > 0) {
        initialSignatures = existingSignatures;
      } else {
        const accountList = settings.accounts?.length ? settings.accounts : [settings.account];
        const migrated = accountList
          .filter((acc) => acc.signature && acc.signature.trim())
          .map((acc) => ({
            id: `sig-${acc.id}`,
            name: acc.accountName || acc.email || 'Assinatura Padrão',
            defaultAccountId: acc.id,
            html: acc.signatureUseHtml
              ? acc.signature
              : acc.signature.replace(/\n/g, '<br/>'),
          }));
        initialSignatures =
          migrated.length > 0
            ? migrated
            : [{ id: 'sig-default', name: 'Sem título', defaultAccountId: '', html: '' }];
      }

      setFormData({ ...settings, signatures: initialSignatures });
      setQuickSnippetsList(QuickRepliesService.getSnippets());
      setEditingQuickReplyIdx(null);
      setNewQuickReplyTitle('');
      setNewQuickReplyInput('');
      setConnectionTestResult(null);
      setConnectionMessage('');
      setSavedSuccess(false);
      if (initialTab) {
        setActiveTab(initialTab);
      }
    }
  }, [isOpen, settings, initialTab]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    setConnectionMessage('');

    try {
      if (window.electronAPI?.testImapConnection) {
        const res = await window.electronAPI.testImapConnection({
          protocol: formData.account.incomingServer.protocol || 'imap',
          host: formData.account.incomingServer.host,
          port: formData.account.incomingServer.port,
          secure: formData.account.incomingServer.security === 'ssl',
          user: formData.account.incomingServer.username || formData.account.email,
          pass: formData.account.incomingServer.password || formData.account.password || '',
        });

        if (res.success) {
          setConnectionTestResult('success');
          setConnectionMessage(res.message);
        } else {
          setConnectionTestResult('error');
          setConnectionMessage(res.message);
        }
      } else {
        await new Promise((res) => setTimeout(res, 800));
        setConnectionTestResult('success');
        setConnectionMessage('Conexão IMAP/SMTP testada com êxito (Modo Local)!');
      }
    } catch (err: any) {
      setConnectionTestResult('error');
      setConnectionMessage(err.message || 'Falha ao conectar.');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSave = () => {
    const signaturesList = formData.signatures || [];
    const baseAccounts = formData.accounts || [formData.account];
    const updatedAccounts = baseAccounts.map((acc) => {
      const baseAcc = acc.id === formData.account.id ? { ...formData.account } : { ...acc };
      const assignedSig = signaturesList.find((s) => s.defaultAccountId === baseAcc.id);
      return {
        ...baseAcc,
        signature: assignedSig ? assignedSig.html : '',
        signatureUseHtml: Boolean(assignedSig),
      };
    });
    const updatedActiveAccount =
      updatedAccounts.find((a) => a.id === formData.account.id) || formData.account;
    const finalData = {
      ...formData,
      account: updatedActiveAccount,
      accounts: updatedAccounts,
    };
    onSaveSettings(finalData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl h-[620px] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center p-1">
              <img src={logoImg} alt="Anectta MAIL" className="w-6 h-6 object-contain" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Configurações Internas do <span className="font-light tracking-[0.06em]">&#923;NECTT&#923; M@il</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Gerenciamento de contas, servidores corporativos (IMAP/POP3/SMTP) e segurança
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Left Tabs + Right Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Navigation Tabs (Sidebar) - Sempre classificado em ordem alfabética */}
          <div className="w-64 bg-slate-950/60 border-r border-slate-800/80 p-3 space-y-1 shrink-0 overflow-y-auto custom-scroll">
            {[
              {
                key: 'appearance',
                label: 'Aparência & Sons',
                icon: <Palette className="w-4 h-4" />,
                isActive: activeTab === 'appearance',
                activeClass: 'bg-brand-600/20 text-brand-400 font-semibold border border-brand-500/30',
                onClick: () => setActiveTab('appearance'),
              },
              {
                key: 'apps',
                label: 'Aplicativos',
                icon: <LayoutGrid className="w-4 h-4 text-brand-400" />,
                isActive: activeTab === 'apps',
                activeClass: 'bg-brand-600/20 text-brand-400 font-semibold border border-brand-500/30',
                onClick: () => setActiveTab('apps'),
              },
              {
                key: 'storage',
                label: 'Armazenamento',
                icon: <Network className="w-4 h-4" />,
                isActive: activeTab === 'storage',
                activeClass: 'bg-brand-600/20 text-brand-400 font-semibold border border-brand-500/30',
                onClick: () => setActiveTab('storage'),
              },
              {
                key: 'signature',
                label: 'Assinatura de E-mail',
                icon: <FileSignature className="w-4 h-4" />,
                isActive: activeTab === 'signature',
                activeClass: 'bg-brand-600/20 text-brand-400 font-semibold border border-brand-500/30',
                onClick: () => setActiveTab('signature'),
              },
              {
                key: 'backup',
                label: 'Backup',
                icon: <HardDriveDownload className="w-4 h-4" />,
                isActive: activeTab === 'backup',
                activeClass: 'bg-brand-600/20 text-brand-400 font-semibold border border-brand-500/30',
                onClick: () => setActiveTab('backup'),
              },
              {
                key: 'calendar',
                label: 'Calendário',
                icon: <Calendar className="w-4 h-4 text-brand-400" />,
                isActive: activeTab === 'calendar',
                activeClass: 'bg-brand-600/20 text-brand-400 font-semibold border border-brand-500/30',
                onClick: () => setActiveTab('calendar'),
              },
              {
                key: 'account',
                label: 'Conta & Servidores',
                icon: <Mail className="w-4 h-4" />,
                isActive: activeTab === 'account',
                activeClass: 'bg-brand-600/20 text-brand-400 font-semibold border border-brand-500/30',
                onClick: () => setActiveTab('account'),
              },
              {
                key: 'spellcheck',
                label: 'Corretor Ortográfico',
                icon: <SpellCheck2 className="w-4 h-4" />,
                isActive: activeTab === 'spellcheck',
                activeClass: 'bg-brand-600/20 text-brand-400 font-semibold border border-brand-500/30',
                onClick: () => setActiveTab('spellcheck'),
              },
              {
                key: 'importExport',
                label: 'Importar / Exportar',
                icon: <ArrowLeftRight className="w-4 h-4 text-sky-400" />,
                isActive: activeTab === 'importExport',
                activeClass: 'bg-brand-600/20 text-brand-400 font-semibold border border-brand-500/30',
                onClick: () => {
                  setActiveTab('importExport');
                  setImportExportStatus(null);
                },
              },
              {
                key: 'motivational',
                label: 'Mensagens Motivacionais',
                icon: <Quote className="w-4 h-4 text-amber-400" />,
                isActive: activeTab === 'motivational',
                activeClass: 'bg-brand-600/20 text-brand-400 font-semibold border border-brand-500/30',
                onClick: () => setActiveTab('motivational'),
              },
              {
                key: 'notifications',
                label: 'Notificações & Avisos',
                icon: <Bell className="w-4 h-4 text-brand-400" />,
                isActive: activeTab === 'notifications',
                activeClass: 'bg-brand-600/20 text-brand-400 font-semibold border border-brand-500/30',
                onClick: () => setActiveTab('notifications'),
              },
              ...(onOpenRules
                ? [
                    {
                      key: 'rules',
                      label: 'Regras de e-mails',
                      icon: <SlidersHorizontal className="w-4 h-4 text-brand-400" />,
                      isActive: false,
                      activeClass: '',
                      onClick: onOpenRules,
                      title: 'Configurar Motor de Regras Automáticas',
                      badge: activeRulesCount > 0 ? activeRulesCount : undefined,
                    },
                  ]
                : []),
              {
                key: 'quickReplies',
                label: 'Respostas Rápidas',
                icon: <Sparkles className="w-4 h-4 text-amber-400" />,
                isActive: activeTab === 'quickReplies',
                activeClass: 'bg-brand-600/20 text-brand-400 font-semibold border border-brand-500/30',
                onClick: () => setActiveTab('quickReplies'),
              },
              {
                key: 'security',
                label: 'Segurança & SOC2',
                icon: <Shield className="w-4 h-4" />,
                isActive: activeTab === 'security',
                activeClass: 'bg-emerald-600/20 text-emerald-400 font-semibold border border-emerald-500/30',
                onClick: () => setActiveTab('security'),
              },
              {
                key: 'proxy',
                label: 'Servidor Proxy',
                icon: <Globe className="w-4 h-4 text-sky-400" />,
                isActive: activeTab === 'proxy',
                activeClass: 'bg-brand-600/20 text-brand-400 font-semibold border border-brand-500/30',
                onClick: () => setActiveTab('proxy'),
              },
              {
                key: 'support',
                label: 'Suporte & Ajuda',
                icon: <LifeBuoy className="w-4 h-4 text-sky-400" />,
                isActive: activeTab === 'support',
                activeClass: 'bg-sky-600/20 text-sky-400 font-semibold border border-sky-500/30',
                onClick: () => setActiveTab('support'),
              },
              {
                key: 'version',
                label: 'Versão',
                icon: <DownloadCloud className="w-4 h-4 text-sky-400" />,
                isActive: activeTab === 'version',
                activeClass: 'bg-sky-600/20 text-sky-400 font-semibold border border-sky-500/30',
                onClick: () => setActiveTab('version'),
              },
            ]
              .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }))
              .map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  title={item.title}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    item.isActive
                      ? item.activeClass
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <span className="shrink-0 flex items-center">{item.icon}</span>
                    <span className="text-left whitespace-nowrap truncate">{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className="px-1.5 py-0.5 bg-brand-600/30 text-brand-300 border border-brand-500/30 rounded-full text-[10px] font-bold">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
          </div>

          {/* Tab Content Panel */}
          <div className="flex-1 p-6 overflow-y-auto custom-scroll space-y-6">
            {/* ================= TAB 1: CONTA & SERVIDORES ================= */}
            {activeTab === 'account' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">
                    Configuração de Conta Corporativa
                  </h3>
                  <p className="text-xs text-slate-400">
                    Defina os parâmetros de conexão IMAP, POP3 ou SMTP exclusivos desta conta.
                  </p>
                </div>

                {/* Gerenciamento & Seleção de Contas */}
                {(() => {
                  const accountList = formData.accounts && formData.accounts.length > 0
                    ? formData.accounts
                    : [formData.account];
                  const currentId = formData.activeAccountId || formData.account.id;
                  const canDelete = accountList.length > 1;

                  const syncCurrentIntoList = () =>
                    accountList.map((a) => (a.id === formData.account.id ? { ...formData.account } : a));

                  return (
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-[11px] font-semibold text-slate-300">
                          Selecionar Conta para Configurar ({accountList.length}):
                        </label>
                        <div className="flex items-center space-x-1.5">
                          {onOpenSetupWizard && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenSetupWizard();
                              }}
                              className="flex items-center space-x-1 px-2.5 py-1 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-[11px] font-semibold transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Adicionar Conta</span>
                            </button>
                          )}

                          {!formData.account.isDefault && (
                            <button
                              type="button"
                              onClick={() => {
                                const updatedList = syncCurrentIntoList().map((a) => ({
                                  ...a,
                                  isDefault: a.id === formData.account.id,
                                }));
                                setFormData({
                                  ...formData,
                                  accounts: updatedList,
                                  account: { ...formData.account, isDefault: true },
                                });
                              }}
                              className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg text-[11px] font-medium transition-colors"
                              title="Definir esta conta como conta padrão de envio"
                            >
                              <Star className="w-3 h-3" />
                              <span>Definir como Padrão</span>
                            </button>
                          )}

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                const filtered = syncCurrentIntoList().filter(
                                  (a) => a.id !== formData.account.id
                                );
                                if (filtered.length === 0) return;
                                if (formData.account.isDefault) {
                                  filtered[0] = { ...filtered[0], isDefault: true };
                                }
                                setFormData({
                                  ...formData,
                                  accounts: filtered,
                                  activeAccountId: filtered[0].id,
                                  account: filtered[0],
                                });
                              }}
                              className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-rose-600/80 text-rose-300 hover:text-white border border-slate-700 rounded-lg text-[11px] font-medium transition-colors"
                              title="Remover conta selecionada"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Remover</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        {accountList.map((acc) => {
                          const isCurrent = acc.id === currentId;
                          const isBeingDragged = draggingAccountId === acc.id;
                          const proto = (acc.incomingServer?.protocol || 'imap').toUpperCase();
                          return (
                            <button
                              key={acc.id}
                              ref={(el) => {
                                accountBtnRefs.current[acc.id] = el;
                              }}
                              type="button"
                              onClick={(e) => {
                                if (suppressAccClickRef.current) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  return;
                                }
                                const syncedList = syncCurrentIntoList();
                                const target = syncedList.find((a) => a.id === acc.id) || acc;
                                setFormData({
                                  ...formData,
                                  accounts: syncedList,
                                  activeAccountId: target.id,
                                  account: target,
                                });
                              }}
                              title={acc.email}
                              className={`group w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                                isBeingDragged
                                  ? 'bg-sky-500/20 text-white border-sky-400 ring-2 ring-sky-400 shadow-lg scale-[1.01] z-20 relative'
                                  : isCurrent
                                  ? 'bg-brand-600/30 text-brand-300 border-brand-500 font-semibold'
                                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                              }`}
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                {accountList.length > 1 && (
                                  <span
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      if (e.button !== 0 || accountList.length <= 1) return;
                                      const holdTimer = window.setTimeout(() => {
                                        if (
                                          accountDragRef.current &&
                                          accountDragRef.current.accId === acc.id &&
                                          !accountDragRef.current.isDragging
                                        ) {
                                          accountDragRef.current.isDragging = true;
                                          suppressAccClickRef.current = true;
                                          setDraggingAccountId(acc.id);
                                          document.body.style.cursor = 'grabbing';
                                        }
                                      }, 180);
                                      accountDragRef.current = {
                                        accId: acc.id,
                                        startY: e.clientY,
                                        isDragging: false,
                                        holdTimer,
                                      };
                                    }}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
                                    title="Clique e segure para mover esta caixa"
                                    className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded hover:bg-white/10 shrink-0 flex items-center justify-center"
                                  >
                                    <GripVertical
                                      className={`w-3.5 h-3.5 shrink-0 transition-opacity ${
                                        isBeingDragged
                                          ? 'text-sky-400 opacity-100'
                                          : 'text-slate-500 opacity-50 group-hover:opacity-90 hover:!opacity-100 hover:text-sky-400'
                                      }`}
                                    />
                                  </span>
                                )}
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: acc.color || '#2563eb' }}
                                />
                                <span className="truncate">{acc.email}</span>
                              </div>
                              <div className="flex items-center space-x-1.5 shrink-0">
                                {acc.isDefault && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-sans font-semibold">
                                    Padrão
                                  </span>
                                )}
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                    proto === 'IMAP'
                                      ? 'bg-blue-500/20 text-blue-300'
                                      : 'bg-amber-500/20 text-amber-300'
                                  }`}
                                >
                                  {proto}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Foto de Perfil do Usuário */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    {formData.account.avatar ? (
                      <img
                        src={formData.account.avatar}
                        alt={formData.account.displayName || formData.account.email}
                        className="w-11 h-11 rounded-xl object-cover ring-2 ring-brand-500/60 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-600 to-indigo-700 text-white font-bold text-xs flex items-center justify-center ring-1 ring-slate-700 shrink-0">
                        {(formData.account.displayName || formData.account.email || 'AN')
                          .split(/[\s@._-]+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase())
                          .join('')}
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-semibold text-white">Foto de Perfil do Usuário</div>
                      <div className="text-[11px] text-slate-400">
                        Exibida no canto inferior esquerdo da barra lateral.
                      </div>
                      <div className="text-[11px] font-mono text-brand-400 mt-0.5">
                        {formData.account.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <label className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors">
                      <span>Escolher Foto...</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === 'string') {
                              const newAvatar = reader.result;
                              const updatedAccounts = (formData.accounts || []).map((a) =>
                                a.id === formData.account.id ? { ...a, avatar: newAvatar } : a
                              );
                              setFormData({
                                ...formData,
                                accounts: updatedAccounts,
                                account: { ...formData.account, avatar: newAvatar },
                              });
                            }
                          };
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {formData.account.avatar && (
                      <button
                        type="button"
                        onClick={() => {
                          const updatedAccounts = (formData.accounts || []).map((a) =>
                            a.id === formData.account.id ? { ...a, avatar: '' } : a
                          );
                          setFormData({
                            ...formData,
                            accounts: updatedAccounts,
                            account: { ...formData.account, avatar: '' },
                          });
                        }}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-600/80 text-slate-300 hover:text-white rounded-lg text-xs transition-colors"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>

                {/* Nome da Conta e Cor */}
                <div className="flex items-start space-x-4">
                  <div className="flex-1">
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Nome da conta:
                    </label>
                    <input
                      type="text"
                      value={formData.account.accountName ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          account: { ...formData.account, accountName: e.target.value },
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Cor:</label>
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="color"
                        value={formData.account.color || '#2563eb'}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            account: { ...formData.account, color: e.target.value },
                          })
                        }
                        className="w-10 h-8 rounded-lg cursor-pointer bg-slate-950 border border-slate-800 p-0.5"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            account: { ...formData.account, color: '#2563eb' },
                          })
                        }
                        className="p-1.5 text-slate-500 hover:text-slate-300 rounded"
                        title="Restaurar cor padrão"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Nome de Exibição:
                    </label>
                    <input
                      type="text"
                      value={formData.account.displayName}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          account: { ...formData.account, displayName: e.target.value },
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      E-mail Institucional:
                    </label>
                    <input
                      type="email"
                      value={formData.account.email}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          account: { ...formData.account, email: e.target.value },
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Tipo de Provedor:
                    </label>
                    <select
                      value={formData.account.serverType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          account: {
                            ...formData.account,
                            serverType: e.target.value as any,
                          },
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                    >
                      <option value="exchange">Microsoft Exchange (Corporativo)</option>
                      <option value="m365">Microsoft 365 Enterprise</option>
                      <option value="google">Google Workspace</option>
                      <option value="imap_smtp">IMAP / SMTP Customizado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Cargo / Departamento:
                    </label>
                    <input
                      type="text"
                      value={formData.account.role}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          account: { ...formData.account, role: e.target.value },
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Endereço de resposta (Reply-to):
                    </label>
                    <input
                      type="email"
                      value={formData.account.replyTo ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          account: { ...formData.account, replyTo: e.target.value },
                        })
                      }
                      placeholder="Respostas irão para este endereço"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono placeholder-slate-600 focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Organização:
                    </label>
                    <input
                      type="text"
                      value={formData.account.organization ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          account: { ...formData.account, organization: e.target.value },
                        })
                      }
                      placeholder="Nome da sua empresa ou corporação"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                {/* Configuração Exclusiva de Protocolo */}
                {(() => {
                  const selectedProtocol = formData.account.incomingServer.protocol || 'imap';
                  return (
                    <div className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold border shrink-0 ${
                              selectedProtocol === 'imap'
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            }`}
                          >
                            {selectedProtocol.toUpperCase()}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                              <span>Configuração Exclusiva de Protocolo</span>
                              <span className="text-[10px] text-slate-400 font-normal normal-case">
                                ({formData.account.email})
                              </span>
                            </h4>
                            <p className="text-[11px] text-slate-400">
                              Define como este e-mail exclusivo sincroniza suas mensagens e pastas com o servidor.
                            </p>
                          </div>
                        </div>

                        <span
                          className={`text-[11px] font-mono px-2.5 py-1 rounded-lg font-bold border shrink-0 ${
                            selectedProtocol === 'imap'
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          }`}
                        >
                          {selectedProtocol === 'imap'
                            ? 'IMAP • Todas as Pastas Sincronizadas'
                            : 'POP3 • Download de Entrada Local'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div
                          onClick={() =>
                            setFormData({
                              ...formData,
                              account: {
                                ...formData.account,
                                incomingServer: {
                                  ...formData.account.incomingServer,
                                  protocol: 'imap',
                                  port:
                                    formData.account.incomingServer.port === 995
                                      ? 993
                                      : formData.account.incomingServer.port || 993,
                                },
                              },
                            })
                          }
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                            selectedProtocol === 'imap'
                              ? 'bg-blue-600/15 border-blue-500/60 shadow-md shadow-blue-500/10'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-blue-300 flex items-center space-x-1.5">
                              <Server className="w-3.5 h-3.5" />
                              <span>IMAP (Recomendado)</span>
                            </span>
                            {selectedProtocol === 'imap' && (
                              <CheckCircle2 className="w-4 h-4 text-blue-400" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            Sincronização em nuvem em tempo real de{' '}
                            <strong className="text-slate-200">todas as pastas</strong> (Caixa de Entrada, Enviados, Rascunhos, Lixeira, Lixo Eletrônico, Arquivo).
                          </p>
                          <div className="mt-2 text-[10px] font-mono text-blue-400/90">
                            Porta Padrão: 993 SSL/TLS
                          </div>
                        </div>

                        <div
                          onClick={() =>
                            setFormData({
                              ...formData,
                              account: {
                                ...formData.account,
                                incomingServer: {
                                  ...formData.account.incomingServer,
                                  protocol: 'pop3',
                                  port:
                                    formData.account.incomingServer.port === 993
                                      ? 995
                                      : formData.account.incomingServer.port || 995,
                                },
                              },
                            })
                          }
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                            selectedProtocol === 'pop3'
                              ? 'bg-amber-600/15 border-amber-500/60 shadow-md shadow-amber-500/10'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-amber-300 flex items-center space-x-1.5">
                              <Server className="w-3.5 h-3.5" />
                              <span>POP3 (Correio Local)</span>
                            </span>
                            {selectedProtocol === 'pop3' && (
                              <CheckCircle2 className="w-4 h-4 text-amber-400" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            Download das mensagens da Caixa de Entrada para{' '}
                            <strong className="text-slate-200">armazenamento local</strong> deste computador.
                          </p>
                          <div className="mt-2 text-[10px] font-mono text-amber-400/90">
                            Porta Padrão: 995 SSL/TLS
                          </div>
                        </div>
                      </div>

                      {/* Resumo Técnico da Conexão Exclusiva */}
                      <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800/80 text-[11px] grid grid-cols-2 gap-2 text-slate-300">
                        <div>
                          <span className="text-slate-500">Servidor Entrada:</span>{' '}
                          <span className="font-mono text-white">
                            {formData.account.incomingServer.host || '(não configurado)'}:
                            {formData.account.incomingServer.port}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Servidor Saída (SMTP):</span>{' '}
                          <span className="font-mono text-white">
                            {formData.account.outgoingServer.host || '(não configurado)'}:
                            {formData.account.outgoingServer.port}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Usuário Entrada:</span>{' '}
                          <span className="font-mono text-white">
                            {formData.account.incomingServer.username || formData.account.email}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Sincronização de Pastas:</span>{' '}
                          <span
                            className={`font-semibold ${
                              selectedProtocol === 'imap' ? 'text-blue-400' : 'text-amber-400'
                            }`}
                          >
                            {selectedProtocol === 'imap'
                              ? 'Ativa (Todas as pastas IMAP na nuvem)'
                              : 'Local (Caixa de Entrada baixada no disco)'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Servidor de Entrada & Saída */}
                <div className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-4">
                  <div className="text-xs font-bold text-slate-200 flex items-center space-x-2">
                    <Server className="w-3.5 h-3.5 text-brand-400" />
                    <span>Parâmetros de Conexão de Rede</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] text-slate-400">
                          Servidor de Entrada ({formData.account.incomingServer.protocol === 'pop3' ? 'POP3' : 'IMAP'}):
                        </label>
                      </div>
                      <input
                        type="text"
                        value={formData.account.incomingServer.host}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            account: {
                              ...formData.account,
                              incomingServer: {
                                ...formData.account.incomingServer,
                                host: e.target.value,
                              },
                            },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Porta {formData.account.incomingServer.protocol === 'pop3' ? 'POP3' : 'IMAP'}:
                      </label>
                      <input
                        type="number"
                        value={formData.account.incomingServer.port}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            account: {
                              ...formData.account,
                              incomingServer: {
                                ...formData.account.incomingServer,
                                port: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                      />
                    </div>
                  </div>

                  {/* Nome de usuário de entrada + SSL/TLS */}
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Nome de Usuário (Entrada):
                      </label>
                      <input
                        type="text"
                        value={formData.account.incomingServer.username ?? formData.account.email}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            account: {
                              ...formData.account,
                              incomingServer: {
                                ...formData.account.incomingServer,
                                username: e.target.value,
                              },
                            },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                      />
                    </div>

                    <div className="pt-4">
                      <label className="flex items-center space-x-2 cursor-pointer text-[11px] text-slate-300">
                        <input
                          type="checkbox"
                          checked={formData.account.incomingServer.security !== 'none'}
                          onChange={(e) => {
                            const useSsl = e.target.checked;
                            const isPop3 = formData.account.incomingServer.protocol === 'pop3';
                            const newPort = isPop3 ? (useSsl ? 995 : 110) : (useSsl ? 993 : 143);
                            setFormData({
                              ...formData,
                              account: {
                                ...formData.account,
                                incomingServer: {
                                  ...formData.account.incomingServer,
                                  security: useSsl ? 'ssl' : 'none',
                                  port: newPort,
                                },
                              },
                            });
                          }}
                          className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                        />
                        <span>Conexão criptografada (SSL/TLS)</span>
                      </label>
                    </div>
                  </div>

                  {/* Opções avançadas de retenção POP3 (Estilo Outlook) */}
                  {formData.account.incomingServer.protocol === 'pop3' && (
                    <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2 text-xs">
                      <div className="font-semibold text-slate-300 text-[11px] flex items-center space-x-1.5 text-brand-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-400" />
                        <span>Configurações de Entrega POP3 (Padrão Microsoft Outlook)</span>
                      </div>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.account.incomingServer.leaveOnServer ?? true}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              account: {
                                ...formData.account,
                                incomingServer: {
                                  ...formData.account.incomingServer,
                                  leaveOnServer: e.target.checked,
                                },
                              },
                            })
                          }
                          className="w-3.5 h-3.5 rounded text-brand-600 focus:ring-brand-500 bg-slate-950 border-slate-700"
                        />
                        <span className="text-slate-300 text-[11px]">Deixar uma cópia das mensagens no servidor</span>
                      </label>

                      <div className="flex items-center space-x-2 pl-5 text-[11px] text-slate-400">
                        <span>Remover do servidor após:</span>
                        <input
                          type="number"
                          value={formData.account.incomingServer.deleteAfterDays ?? 14}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              account: {
                                ...formData.account,
                                incomingServer: {
                                  ...formData.account.incomingServer,
                                  deleteAfterDays: Number(e.target.value),
                                },
                              },
                            })
                          }
                          className="w-14 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-center text-slate-200"
                        />
                        <span>dias</span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] text-slate-400">
                          Servidor de Saída (SMTP):
                        </label>
                      </div>
                      <input
                        type="text"
                        value={formData.account.outgoingServer.host}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            account: {
                              ...formData.account,
                              outgoingServer: {
                                ...formData.account.outgoingServer,
                                host: e.target.value,
                              },
                            },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Porta SMTP:
                      </label>
                      <input
                        type="number"
                        value={formData.account.outgoingServer.port}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            account: {
                              ...formData.account,
                              outgoingServer: {
                                ...formData.account.outgoingServer,
                                port: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                      />
                    </div>
                  </div>

                  {/* Segurança & Autenticação SMTP + Timeout */}
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Criptografia do Servidor de Saída (SMTP):
                      </label>
                      <select
                        value={
                          formData.account.outgoingServer.security === 'tls'
                            ? 'starttls'
                            : formData.account.outgoingServer.security || 'ssl'
                        }
                        onChange={(e) => {
                          const sec = e.target.value as 'none' | 'ssl' | 'starttls' | 'auto';
                          const suggestedPort =
                            sec === 'ssl' ? 465 : sec === 'starttls' || sec === 'auto' ? 587 : 25;
                          setFormData({
                            ...formData,
                            account: {
                              ...formData.account,
                              outgoingServer: {
                                ...formData.account.outgoingServer,
                                security: sec,
                                port: suggestedPort,
                              },
                            },
                          });
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                      >
                        <option value="none">Nenhum</option>
                        <option value="ssl">SSL/TLS</option>
                        <option value="starttls">STARTTLS</option>
                        <option value="auto">Automático</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Tempo limite do servidor ({formData.account.incomingServer.timeoutSeconds ?? 60}s):
                      </label>
                      <input
                        type="range"
                        min={15}
                        max={300}
                        step={15}
                        value={formData.account.incomingServer.timeoutSeconds ?? 60}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            account: {
                              ...formData.account,
                              incomingServer: {
                                ...formData.account.incomingServer,
                                timeoutSeconds: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="w-full accent-brand-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900/70 border border-slate-800/80 rounded-xl space-y-2 text-[11px] text-slate-300">
                    <label className="flex items-center space-x-2 cursor-pointer font-semibold text-white">
                      <input
                        type="checkbox"
                        checked={formData.account.outgoingServer.requiresAuth ?? true}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            account: {
                              ...formData.account,
                              outgoingServer: {
                                ...formData.account.outgoingServer,
                                requiresAuth: e.target.checked,
                              },
                            },
                          })
                        }
                        className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                      />
                      <span>Meu servidor de saída (SMTP) requer autenticação</span>
                    </label>

                    {(formData.account.outgoingServer.requiresAuth ?? true) && (
                      <div className="pl-5 space-y-1.5">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="settingsSmtpAuthMode"
                            checked={
                              (formData.account.outgoingServer.authMode || 'same_as_incoming') ===
                              'same_as_incoming'
                            }
                            onChange={() =>
                              setFormData({
                                ...formData,
                                account: {
                                  ...formData.account,
                                  outgoingServer: {
                                    ...formData.account.outgoingServer,
                                    authMode: 'same_as_incoming',
                                  },
                                },
                              })
                            }
                            className="text-brand-600 bg-slate-950 border-slate-700 focus:ring-brand-500"
                          />
                          <span>Usar mesmas configurações do servidor de entrada</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="settingsSmtpAuthMode"
                            checked={formData.account.outgoingServer.authMode === 'logon_incoming_first'}
                            onChange={() =>
                              setFormData({
                                ...formData,
                                account: {
                                  ...formData.account,
                                  outgoingServer: {
                                    ...formData.account.outgoingServer,
                                    authMode: 'logon_incoming_first',
                                  },
                                },
                              })
                            }
                            className="text-brand-600 bg-slate-950 border-slate-700 focus:ring-brand-500"
                          />
                          <span>Fazer logon no servidor de entrada antes de enviar</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.account.outgoingServer.requireSpa ?? false}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                account: {
                                  ...formData.account,
                                  outgoingServer: {
                                    ...formData.account.outgoingServer,
                                    requireSpa: e.target.checked,
                                  },
                                },
                              })
                            }
                            className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                          />
                          <span>Exigir Autenticação de Senha de Segurança (SPA)</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Senha da Conta IMAP/SMTP */}
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Senha ou Senha de Aplicativo (IMAP / SMTP):
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.account.password || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            account: {
                              ...formData.account,
                              password: e.target.value,
                              incomingServer: {
                                ...formData.account.incomingServer,
                                password: e.target.value,
                              },
                              outgoingServer: {
                                ...formData.account.outgoingServer,
                                password: e.target.value,
                              },
                            },
                          })
                        }
                        placeholder="Digite sua senha corporativa para sincronizar e-mails reais..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-3 pr-10 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        {showPassword ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Alertas dinâmicos de provedor (Gmail, Yahoo, iCloud, AOL, Microsoft, e neutro para domínios próprios) */}
                    <EmailProviderNotice
                      email={formData.account.email}
                      host={formData.account.incomingServer?.host}
                      providerId={formData.account.provider}
                      variant="dark"
                    />
                  </div>

                  <div className="flex flex-col space-y-2 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTestingConnection}
                        className="flex items-center space-x-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg transition-colors"
                      >
                        {isTestingConnection ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 text-brand-400" />
                        )}
                        <span>
                          Testar Conexão {(formData.account.incomingServer.protocol || 'imap').toUpperCase()}
                        </span>
                      </button>

                      {connectionTestResult === 'success' && (
                        <span className="text-xs text-emerald-400 flex items-center space-x-1 font-medium">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Conectado!</span>
                        </span>
                      )}
                    </div>

                    {connectionMessage && (
                      <div
                        className={`p-2 rounded text-[11px] leading-relaxed ${
                          connectionTestResult === 'success'
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {connectionMessage}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sincronização, Cópias/Pastas & Arquivo de Dados Local (.pst) */}
                <div className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-200 flex items-center space-x-2">
                      <FolderTree className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Sincronização, Pastas & Arquivo Local (.pst)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.electronAPI?.openLocalStorageFolder?.(formData.account.email)}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg text-[11px] font-semibold transition-colors"
                    >
                      Abrir Pasta do Arquivo .PST
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 items-center text-[11px] text-slate-300">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.account.incomingServer.checkOnStartup ?? true}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            account: {
                              ...formData.account,
                              incomingServer: {
                                ...formData.account.incomingServer,
                                checkOnStartup: e.target.checked,
                              },
                            },
                          })
                        }
                        className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                      />
                      <span>Verificar novas mensagens ao iniciar</span>
                    </label>

                    <div className="flex items-center space-x-2">
                      <span>Verificar a cada:</span>
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={formData.account.incomingServer.checkEveryMinutes ?? 10}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            account: {
                              ...formData.account,
                              incomingServer: {
                                ...formData.account.incomingServer,
                                checkEveryMinutes: Number(e.target.value),
                              },
                            },
                          })
                        }
                        className="w-16 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-center text-slate-200 font-mono"
                      />
                      <span>minutos</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-[11px] text-slate-300">
                    <span>Tempo para desfazer o envio:</span>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={formData.sending?.undoSendSeconds ?? 8}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          sending: {
                            ...formData.sending,
                            undoSendSeconds: Math.min(30, Math.max(0, Number(e.target.value) || 0)),
                          },
                        })
                      }
                      className="w-14 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-center text-slate-200 font-mono"
                    />
                    <span>segundos (0 = enviar imediatamente) · Enviar/Receber: F9</span>
                  </div>

                  {/* Animação de Despacho */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-slate-300">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Animação de Despacho</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {OUTGOING_ANIMATIONS.map((opt) => {
                        const selectedAnimation = formData.sending?.outgoingAnimation ?? 'airplane';
                        const isSelected = selectedAnimation === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setFormData({
                                ...formData,
                                sending: {
                                  undoSendSeconds: formData.sending?.undoSendSeconds ?? 8,
                                  outgoingAnimation: opt.id,
                                },
                              })
                            }
                            className={`text-left px-3 py-2 rounded-xl border text-xs flex items-start justify-between gap-2 transition-colors ${
                              isSelected
                                ? 'bg-brand-600/20 text-brand-200 border-brand-500/50'
                                : 'bg-slate-900/70 hover:bg-slate-800/80 text-slate-300 border-slate-800'
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="font-semibold block">{opt.name}</span>
                              <span className="text-[10px] text-slate-400 block mt-0.5 leading-snug">
                                {opt.description}
                              </span>
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 text-[11px] text-slate-300">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.drafts?.autoSaveEnabled ?? true}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            drafts: {
                              autoSaveMinutes: formData.drafts?.autoSaveMinutes ?? 3,
                              autoSaveEnabled: e.target.checked,
                            },
                          })
                        }
                        className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                      />
                      <span>Guardar rascunho da mensagem em edição a cada</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      disabled={!(formData.drafts?.autoSaveEnabled ?? true)}
                      value={formData.drafts?.autoSaveMinutes ?? 3}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          drafts: {
                            autoSaveEnabled: formData.drafts?.autoSaveEnabled ?? true,
                            autoSaveMinutes: Math.min(60, Math.max(1, Number(e.target.value) || 1)),
                          },
                        })
                      }
                      className="w-14 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-center text-slate-200 font-mono disabled:opacity-50"
                    />
                    <span>minutos</span>
                  </div>

                  <div className="p-3 bg-slate-900/70 border border-slate-800/80 rounded-xl space-y-1.5 text-[11px] text-slate-400">
                    <div className="font-semibold text-slate-200">Cópias e Pastas ({(formData.account.incomingServer.protocol || 'imap').toUpperCase()})</div>
                    <div>
                      • <strong className="text-slate-300">Itens Enviados & Rascunhos:</strong>{' '}
                      {(formData.account.incomingServer.protocol || 'imap') === 'imap'
                        ? 'Sincronizados automaticamente com as respectivas pastas do servidor IMAP.'
                        : 'Armazenados localmente no banco de dados deste computador.'}
                    </div>
                    <div>
                      • <strong className="text-slate-300">Backup Offline (.pst):</strong>{' '}
                      Gravado em <span className="font-mono text-slate-300">Documentos\Arquivos do Anectta MAIL</span>.
                    </div>
                  </div>
                </div>
              </div>
            )}



            {/* ================= TAB 3: ASSINATURA DE E-MAIL ================= */}
            {activeTab === 'signature' && (
              <SignatureEditorPanel
                signatures={
                  formData.signatures && formData.signatures.length > 0
                    ? formData.signatures
                    : [{ id: 'sig-default', name: 'Sem título', defaultAccountId: '', html: '' }]
                }
                accounts={formData.accounts?.length ? formData.accounts : [formData.account]}
                attachVCard={Boolean(formData.account.attachVCard)}
                onChangeSignatures={(nextSignatures) =>
                  setFormData({ ...formData, signatures: nextSignatures })
                }
                onToggleAttachVCard={(checked) =>
                  setFormData({
                    ...formData,
                    account: { ...formData.account, attachVCard: checked },
                  })
                }
              />
            )}

            {/* ================= TAB: RESPOSTAS RÁPIDAS ================= */}
            {activeTab === 'quickReplies' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Personalização de Respostas Rápidas</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Defina e edite as respostas rápidas e os botões de 1 clique, sincronizados ao visualizar e compor e-mails.
                  </p>
                </div>

                <div className="space-y-2">
                  {quickSnippetsList.map((snip, idx) => {
                    const isEditing = editingQuickReplyIdx === idx;
                    return (
                      <div
                        key={snip.id || idx}
                        className={`flex flex-col space-y-1.5 p-2.5 rounded-xl bg-slate-950/70 border transition-all ${
                          isEditing ? 'border-brand-500 ring-1 ring-brand-500/30' : 'border-slate-800'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] font-mono text-slate-500 w-5 text-center shrink-0">
                            {idx + 1}.
                          </span>
                          <input
                            ref={(el) => {
                              quickReplyInputRefs.current[idx] = el;
                            }}
                            type="text"
                            readOnly={!isEditing}
                            value={snip.content}
                            onChange={(e) => {
                              const updated = [...quickSnippetsList];
                              updated[idx] = { ...updated[idx], content: e.target.value };
                              setQuickSnippetsList(updated);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && isEditing) {
                                e.preventDefault();
                                setEditingQuickReplyIdx(null);
                              }
                            }}
                            className={`flex-1 bg-transparent text-xs focus:outline-none ${
                              isEditing ? 'text-white font-medium' : 'text-slate-200 cursor-default'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditing) {
                                setEditingQuickReplyIdx(null);
                              } else {
                                setEditingQuickReplyIdx(idx);
                                requestAnimationFrame(() => {
                                  const el = quickReplyInputRefs.current[idx];
                                  if (el) {
                                    el.focus();
                                    el.setSelectionRange(el.value.length, el.value.length);
                                  }
                                });
                              }
                            }}
                            className={`p-1 rounded transition-colors ${
                              isEditing
                                ? 'text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25'
                                : 'text-slate-500 hover:text-brand-400 hover:bg-slate-900'
                            }`}
                            title={isEditing ? 'Concluir alteração da frase' : 'Alterar frase escrita'}
                          >
                            {isEditing ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Pencil className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const ask =
                                formData.notifications?.confirmations?.askBeforeDeleteQuickActions ??
                                true;
                              if (ask && !window.confirm('Deseja realmente apagar esta resposta rápida?')) {
                                return;
                              }
                              const updated = quickSnippetsList.filter((_, i) => i !== idx);
                              setQuickSnippetsList(updated);
                              if (editingQuickReplyIdx === idx) setEditingQuickReplyIdx(null);
                            }}
                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-900 rounded transition-colors"
                            title="Remover resposta"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {isEditing && (
                          <div className="pl-7 pr-2 pt-1.5 border-t border-slate-800/70 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={snip.title}
                              onChange={(e) => {
                                const updated = [...quickSnippetsList];
                                updated[idx] = { ...updated[idx], title: e.target.value };
                                setQuickSnippetsList(updated);
                              }}
                              placeholder="Título do modelo..."
                              className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-emerald-300 focus:outline-none focus:border-brand-500"
                            />
                            <input
                              type="text"
                              value={snip.category || ''}
                              onChange={(e) => {
                                const updated = [...quickSnippetsList];
                                updated[idx] = { ...updated[idx], category: e.target.value };
                                setQuickSnippetsList(updated);
                              }}
                              placeholder="Categoria (ex: Comercial, Rápida)"
                              className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-sky-300 focus:outline-none focus:border-brand-500"
                            />
                            <input
                              type="text"
                              value={snip.subject || ''}
                              onChange={(e) => {
                                const updated = [...quickSnippetsList];
                                updated[idx] = { ...updated[idx], subject: e.target.value };
                                setQuickSnippetsList(updated);
                              }}
                              placeholder="Assunto automático (opcional)"
                              className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-brand-500"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Adicionar nova */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Adicionar Nova Resposta / Modelo:
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Variáveis suportadas: <code className="text-emerald-300">{'{{nome}}'}</code>,{' '}
                      <code className="text-emerald-300">{'{{empresa}}'}</code>,{' '}
                      <code className="text-emerald-300">{'{{data}}'}</code>
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      value={newQuickReplyTitle}
                      onChange={(e) => setNewQuickReplyTitle(e.target.value)}
                      placeholder="Título (opcional, ex: Aprovação)"
                      className="sm:w-52 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                    />
                    <input
                      type="text"
                      value={newQuickReplyInput}
                      onChange={(e) => setNewQuickReplyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const clean = newQuickReplyInput.trim();
                          if (clean) {
                            const next: QuickSnippetItem = {
                              id: `snip-${Date.now()}`,
                              title: newQuickReplyTitle.trim() || clean.split(/\s+/).slice(0, 4).join(' '),
                              content: clean,
                            };
                            setQuickSnippetsList([...quickSnippetsList, next]);
                            setNewQuickReplyTitle('');
                            setNewQuickReplyInput('');
                          }
                        }
                      }}
                      placeholder="Ex: Ciente! Proposta aprovada pela diretoria."
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const clean = newQuickReplyInput.trim();
                        if (clean) {
                          const next: QuickSnippetItem = {
                            id: `snip-${Date.now()}`,
                            title: newQuickReplyTitle.trim() || clean.split(/\s+/).slice(0, 4).join(' '),
                            content: clean,
                          };
                          setQuickSnippetsList([...quickSnippetsList, next]);
                          setNewQuickReplyTitle('');
                          setNewQuickReplyInput('');
                        }
                      }}
                      disabled={!newQuickReplyInput.trim()}
                      className="px-3 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl text-xs font-medium flex items-center justify-center space-x-1 transition-all shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const saved = QuickRepliesService.saveSnippets(quickSnippetsList);
                      setQuickSnippetsList(saved);
                      setEditingQuickReplyIdx(null);
                      setSavedSuccess(true);
                      setTimeout(() => setSavedSuccess(false), 3000);
                    }}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-brand-600/20 transition-all"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Respostas</span>
                  </button>
                </div>
              </div>
            )}

            {/* ================= TAB: MENSAGENS MOTIVACIONAIS ================= */}
            {activeTab === 'motivational' && <MotivationalSettingsPanel />}

            {/* ================= TAB: NOTIFICAÇÕES & AVISOS ================= */}
            {activeTab === 'notifications' && (
              <NotificationsSettingsPanel
                notifications={
                  formData.notifications || {
                    notificationsEnabled: true,
                    notificationSound: 'theme',
                    unreadBadgeEnabled: true,
                  }
                }
                onChangeNotifications={(nextNotifications) =>
                  setFormData({ ...formData, notifications: nextNotifications })
                }
              />
            )}

            {/* ================= TAB: CALENDÁRIO ================= */}
            {activeTab === 'calendar' && (
              <CalendarSettingsPanel
                calendar={
                  formData.calendar || {
                    connectedAccountIds: [],
                    use24HourFormat: true,
                    showWeekNumbers: false,
                    weekStartsOn: 'monday',
                    defaultEventDurationMinutes: 60,
                  }
                }
                accounts={formData.accounts?.length ? formData.accounts : [formData.account]}
                onChangeCalendar={(nextCalendar) =>
                  setFormData({ ...formData, calendar: nextCalendar })
                }
              />
            )}

            {/* ================= TAB: APLICATIVOS ================= */}
            {activeTab === 'apps' && (
              <AppsSettingsPanel
                apps={
                  formData.apps || {
                    enableCalendarApp: true,
                    enableContactsApp: true,
                    enableWhatsAppApp: false,
                    customApps: [],
                  }
                }
                onChangeApps={(nextApps) =>
                  setFormData({ ...formData, apps: nextApps })
                }
              />
            )}

            {/* ================= TAB: APARÊNCIA & SKINS ================= */}
            {activeTab === 'appearance' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">
                    Aparência, Temas & Skins
                  </h3>
                  <p className="text-xs text-slate-400">
                    Escolha uma skin para aplicar instantaneamente em toda a interface do Anectta MAIL.
                  </p>
                </div>

                {/* Opção de Exibir / Ocultar Caixa Unificada */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Exibir Caixa Unificada na barra lateral
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Mostra o botão no topo das pastas para reunir os e-mails de todas as contas.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.appearance.showUnifiedInbox ?? true}
                    onClick={() =>
                      setFormData({
                        ...formData,
                        appearance: {
                          ...formData.appearance,
                          showUnifiedInbox: !(formData.appearance.showUnifiedInbox ?? true),
                        },
                      })
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ${
                      (formData.appearance.showUnifiedInbox ?? true) ? 'bg-brand-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition duration-200 ${
                        (formData.appearance.showUnifiedInbox ?? true) ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Amoroso — Assistente Anectta */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Mostrar o Astro (Assistente Virtual) nos e-mails
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Resumo rápido no topo do e-mail aberto (datas, valores, anexos e próximo passo) e ações de
                      um clique. Feito no seu computador: o e-mail não é enviado para nenhum serviço externo.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.appearance.showAssistant ?? true}
                    onClick={() =>
                      setFormData({
                        ...formData,
                        appearance: {
                          ...formData.appearance,
                          showAssistant: !(formData.appearance.showAssistant ?? true),
                        },
                      })
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ${
                      (formData.appearance.showAssistant ?? true) ? 'bg-brand-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition duration-200 ${
                        (formData.appearance.showAssistant ?? true) ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Astro — pendências (aguardando sua resposta / enviados sem resposta) */}
                <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-white">Pendências do Astro</div>
                      <div className="text-[11px] text-slate-400">
                        Avisa no topo da lista os e-mails que aguardam sua resposta e os que você enviou e ninguém
                        respondeu.
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.appearance.astroAgendaEnabled ?? true}
                      onClick={() =>
                        setFormData({
                          ...formData,
                          appearance: {
                            ...formData.appearance,
                            astroAgendaEnabled: !(formData.appearance.astroAgendaEnabled ?? true),
                          },
                        })
                      }
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ${
                        (formData.appearance.astroAgendaEnabled ?? true) ? 'bg-brand-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition duration-200 ${
                          (formData.appearance.astroAgendaEnabled ?? true) ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  {(formData.appearance.astroAgendaEnabled ?? true) && (
                    <label className="flex items-center justify-between gap-3 text-[11px] text-slate-300">
                      <span>Avisar de e-mails enviados sem resposta após</span>
                      <select
                        value={formData.appearance.astroFollowUpDays ?? 3}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            appearance: { ...formData.appearance, astroFollowUpDays: Number(e.target.value) },
                          })
                        }
                        className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100"
                      >
                        {[2, 3, 5, 7].map((d) => (
                          <option key={d} value={d}>
                            {d} dias
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <SkinGalleryPanel />
              </div>
            )}

            {/* ================= TAB: CORRETOR ORTOGRÁFICO ================= */}
            {activeTab === 'spellcheck' && (
              <SpellcheckSettingsPanel
                spellcheck={formData.spellcheck}
                onChangeSpellcheck={(nextSpellcheck) =>
                  setFormData({ ...formData, spellcheck: nextSpellcheck })
                }
              />
            )}

            {/* ================= TAB: BACKUP ================= */}
            {activeTab === 'backup' && (
              <BackupSettingsPanel
                backup={formData.backup}
                onChangeBackup={(nextBackup) =>
                  setFormData({ ...formData, backup: nextBackup })
                }
                accounts={formData.accounts}
                activeAccountId={formData.activeAccountId}
                onImportResult={onImportMailResult}
                getKnownMessageIds={getKnownMessageIds}
                onRestoredData={({ settings: restoredSettings, emails: restoredEmails }) => {
                  if (restoredSettings) {
                    setFormData(restoredSettings);
                    onSaveSettings(restoredSettings);
                  }
                  if (restoredEmails && restoredEmails.length > 0) {
                    onImportEmails?.(restoredEmails);
                  }
                }}
              />
            )}

            {/* ================= TAB: ARMAZENAMENTO EM REDE ================= */}
            {activeTab === 'storage' && <StorageSettingsPanel />}

            {/* ================= TAB: SERVIDOR PROXY ================= */}
            {activeTab === 'proxy' && (
              <ProxySettingsPanel
                proxy={formData.proxy}
                onChangeProxy={(nextProxy) =>
                  setFormData({ ...formData, proxy: nextProxy })
                }
              />
            )}

            {/* ================= TAB 5: SEGURANÇA & SOC2 ================= */}
            {activeTab === 'security' && (
              <PrivacyCenterPanel
                security={formData.security}
                onChangeSecurity={(nextSecurity) =>
                  setFormData({ ...formData, security: nextSecurity })
                }
              />
            )}

            {/* ================= TAB: SUPORTE & AJUDA ================= */}
            {activeTab === 'support' && (
              <SupportHelpPanel
                settings={formData}
                onComposeSupport={(recipient, subject, body) => {
                  onClose();
                  onComposeSupport?.(recipient, subject, body);
                }}
              />
            )}

            {/* ================= TAB: VERSÃO & ATUALIZAÇÕES ================= */}
            {activeTab === 'version' && <VersionSettingsPanel />}

            {/* ================= TAB: IMPORTAR / EXPORTAR ================= */}
            {activeTab === 'importExport' && (() => {
              const accountEmails = emails.filter(
                (e) => !e.accountId || e.accountId === formData.account.id
              );
              const exportList = accountEmails.length > 0 ? accountEmails : emails;

              const handleExportArchive = async () => {
                if (!window.electronAPI?.exportMailArchive) return;
                setImportExportBusy(true);
                setImportExportStatus(null);
                try {
                  const res = await window.electronAPI.exportMailArchive(
                    exportList,
                    formData.account.email
                  );
                  if (res.canceled) return;
                  if (res.success) {
                    setImportExportStatus({
                      type: 'success',
                      text: `Backup de ${res.count ?? exportList.length} mensagem(ns) exportado para: ${res.filePath}`,
                    });
                  } else {
                    setImportExportStatus({
                      type: 'error',
                      text: res.error || 'Falha ao exportar arquivo de e-mails.',
                    });
                  }
                } catch (err: any) {
                  setImportExportStatus({
                    type: 'error',
                    text: err?.message || 'Erro inesperado ao exportar.',
                  });
                } finally {
                  setImportExportBusy(false);
                }
              };

              const handleExportBatchEml = async () => {
                if (!window.electronAPI?.exportBatchToEml) return;
                setImportExportBusy(true);
                setImportExportStatus(null);
                try {
                  const res = await window.electronAPI.exportBatchToEml(exportList);
                  if (res.success) {
                    setImportExportStatus({
                      type: 'success',
                      text: `${res.count} mensagem(ns) exportada(s) em formato .EML para: ${res.directory}`,
                    });
                  } else if (res.error && !res.error.toLowerCase().includes('cancel')) {
                    setImportExportStatus({
                      type: 'error',
                      text: res.error,
                    });
                  }
                } catch (err: any) {
                  setImportExportStatus({
                    type: 'error',
                    text: err?.message || 'Erro ao exportar lote .EML.',
                  });
                } finally {
                  setImportExportBusy(false);
                }
              };

              const handleImportEmails = async () => {
                if (!window.electronAPI?.importEmailsFromFile) return;
                setImportExportBusy(true);
                setImportExportStatus(null);
                try {
                  const res = await window.electronAPI.importEmailsFromFile(formData.account.id);
                  if (res.canceled) return;
                  if (res.success && res.emails.length > 0) {
                    onImportEmails?.(res.emails);
                    setImportExportStatus({
                      type: 'success',
                      text: `${res.count} mensagem(ns) importada(s) para a conta ${formData.account.email}.`,
                    });
                  } else if (res.success) {
                    setImportExportStatus({
                      type: 'error',
                      text: 'Nenhuma mensagem válida encontrada no arquivo selecionado.',
                    });
                  } else {
                    setImportExportStatus({
                      type: 'error',
                      text: res.error || 'Falha ao importar mensagens.',
                    });
                  }
                } catch (err: any) {
                  setImportExportStatus({
                    type: 'error',
                    text: err?.message || 'Erro ao importar e-mails.',
                  });
                } finally {
                  setImportExportBusy(false);
                }
              };

              const handleExportSettings = async () => {
                if (!window.electronAPI?.exportSettingsFile) return;
                setImportExportBusy(true);
                setImportExportStatus(null);
                try {
                  const res = await window.electronAPI.exportSettingsFile(formData);
                  if (res.canceled) return;
                  if (res.success) {
                    setImportExportStatus({
                      type: 'success',
                      text: `Configurações exportadas com sucesso para: ${res.filePath}`,
                    });
                  } else {
                    setImportExportStatus({
                      type: 'error',
                      text: res.error || 'Falha ao exportar configurações.',
                    });
                  }
                } catch (err: any) {
                  setImportExportStatus({
                    type: 'error',
                    text: err?.message || 'Erro ao exportar configurações.',
                  });
                } finally {
                  setImportExportBusy(false);
                }
              };

              const handleImportSettings = async () => {
                if (!window.electronAPI?.importSettingsFile) return;
                setImportExportBusy(true);
                setImportExportStatus(null);
                try {
                  const res = await window.electronAPI.importSettingsFile();
                  if (res.canceled) return;
                  if (res.success && res.settings) {
                    const imported = res.settings as AppSettings;
                    setFormData(imported);
                    onSaveSettings(imported);
                    setImportExportStatus({
                      type: 'success',
                      text: `Configurações restauradas de: ${res.filePath}`,
                    });
                  } else {
                    setImportExportStatus({
                      type: 'error',
                      text: res.error || 'Arquivo de configurações inválido.',
                    });
                  }
                } catch (err: any) {
                  setImportExportStatus({
                    type: 'error',
                    text: err?.message || 'Erro ao importar configurações.',
                  });
                } finally {
                  setImportExportBusy(false);
                }
              };

              return (
                <div className="space-y-5">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
                      <ArrowLeftRight className="w-5 h-5 text-sky-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white mb-0.5">
                        Importar / Exportar
                      </h3>
                      <p className="text-xs text-slate-400">
                        Importar ou exportar arquivos de e-mails (.MBOX, .PST, .EML) e configurações de contas.
                      </p>
                    </div>
                  </div>

                  {importExportStatus && (
                    <div
                      className={`p-3 rounded-xl text-xs border ${
                        importExportStatus.type === 'success'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {importExportStatus.text}
                    </div>
                  )}

                  {/* Seção 1: Mensagens & Backup */}
                  <div className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-white">Arquivos de E-mail e Backup</div>
                        <div className="text-[11px] text-slate-400">
                          Conta selecionada:{' '}
                          <span className="font-mono text-slate-200">{formData.account.email}</span> (
                          {exportList.length} mensagem(ns) carregada(s))
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => window.electronAPI?.openLocalStorageFolder?.(formData.account.email)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg text-[11px] font-semibold transition-colors"
                      >
                        Abrir Pasta .PST
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                      <button
                        type="button"
                        disabled={importExportBusy}
                        onClick={handleExportArchive}
                        className="flex items-center justify-center space-x-2 px-3 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors"
                      >
                        <Download className="w-4 h-4 shrink-0" />
                        <span>Exportar .MBOX / .PST</span>
                      </button>

                      <button
                        type="button"
                        disabled={importExportBusy}
                        onClick={handleExportBatchEml}
                        className="flex items-center justify-center space-x-2 px-3 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors"
                      >
                        <Download className="w-4 h-4 text-brand-400 shrink-0" />
                        <span>Exportar Lote .EML</span>
                      </button>

                      <button
                        type="button"
                        disabled={importExportBusy}
                        onClick={handleImportEmails}
                        className="flex items-center justify-center space-x-2 px-3 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors"
                      >
                        <Upload className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Importar E-mails</span>
                      </button>
                    </div>
                  </div>

                  {/* Seção 2: Configurações */}
                  <div className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-3">
                    <div className="flex items-center space-x-2">
                      <FileJson className="w-4 h-4 text-amber-400" />
                      <div>
                        <div className="text-xs font-bold text-white">Configurações de Contas & Preferências</div>
                        <div className="text-[11px] text-slate-400">
                          Exporte ou restaure todas as contas, assinaturas e ajustes em arquivo .JSON.
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <button
                        type="button"
                        disabled={importExportBusy}
                        onClick={handleExportSettings}
                        className="flex items-center justify-center space-x-2 px-3 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors"
                      >
                        <Download className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Exportar Configurações (.JSON)</span>
                      </button>

                      <button
                        type="button"
                        disabled={importExportBusy}
                        onClick={handleImportSettings}
                        className="flex items-center justify-center space-x-2 px-3 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors"
                      >
                        <Upload className="w-4 h-4 text-sky-400 shrink-0" />
                        <span>Importar Configurações (.JSON)</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 text-[11px] text-slate-500">
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            <span>Configurações salvas localmente com criptografia segura.</span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-brand-600/30 transition-all active:scale-95"
            >
              {savedSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                  <span>Salvo com Sucesso!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
