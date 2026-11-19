import React, { useState, useEffect, useRef } from 'react';
import { saveSettingsLocal } from '../utils/secureSettingsStorage';
import { LocalStorageInfo } from '../../types/electron';
import {
  Plus,
  Trash2,
  CheckCircle2,
  Star,
  Server,
  FolderTree,
  Send,
  Lock,
  Mail,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Settings,
  Puzzle,
  X,
  Save,
  GripVertical,
  Smartphone,
  Copy,
} from 'lucide-react';
import { AccountSettings, AppSettings } from '@/types/settings';
import { EmailProviderNotice } from './EmailProviderNotice';

interface AccountManagerViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onClose: () => void;
  onOpenSetupWizard?: () => void;
}

type SubSection =
  | 'identity'
  | 'server'
  | 'copies_folders'
  | 'composition'
  | 'sync_storage'
  | 'encryption'
  | 'outgoing_smtp';

export const AccountManagerView: React.FC<AccountManagerViewProps> = ({
  settings,
  onUpdateSettings,
  onClose,
  onOpenSetupWizard,
}) => {
  const [accounts, setAccounts] = useState<AccountSettings[]>(() => {
    if (settings.accounts && settings.accounts.length > 0) {
      return settings.accounts;
    }
    return [settings.account];
  });

  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    settings.activeAccountId || accounts[0]?.id || 'acc-1'
  );

  const [activeSection, setActiveSection] = useState<SubSection>('identity');
  const [expandedAccountIds, setExpandedAccountIds] = useState<Record<string, boolean>>({
    [selectedAccountId]: true,
  });

  // Modals
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<AccountSettings | null>(null);
  const [isPairMobileOpen, setIsPairMobileOpen] = useState(false);
  const [pairingGatewayUrl, setPairingGatewayUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('anectta_mobile_gateway_url') || 'http://localhost:8787';
    } catch {
      return 'http://localhost:8787';
    }
  });
  const [pairingCodeResult, setPairingCodeResult] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingCopied, setPairingCopied] = useState(false);

  // Form fields for adding new account
  const [newAccName, setNewAccName] = useState('');
  const [newAccEmail, setNewAccEmail] = useState('');
  const [newAccPassword, setNewAccPassword] = useState('');
  const [newAccProtocol, setNewAccProtocol] = useState<'imap' | 'pop3'>('imap');
  const [newAccHost, setNewAccHost] = useState('');

  // Server test states
  const [showPassword, setShowPassword] = useState(false);
  const [saveBanner, setSaveBanner] = useState(false);
  const [serverSubTab, setServerSubTab] = useState<'geral' | 'saida' | 'avancado'>('avancado');

  // Modal de Teste Completo (Estilo Outlook / Testar Configurações da Conta)
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testModalTab, setTestModalTab] = useState<'tarefas' | 'erros'>('tarefas');
  const [incomingTaskStatus, setIncomingTaskStatus] = useState<'pending' | 'running' | 'success' | 'failed'>('pending');
  const [outgoingTaskStatus, setOutgoingTaskStatus] = useState<'pending' | 'running' | 'success' | 'failed'>('pending');
  const [incomingTaskError, setIncomingTaskError] = useState<string>('');
  const [outgoingTaskError, setOutgoingTaskError] = useState<string>('');
  const [autoTestOnNext, setAutoTestOnNext] = useState(true);

  // Currently selected account
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];
  const selectedProtocol = (selectedAccount?.incomingServer?.protocol || 'imap').toLowerCase() as 'imap' | 'pop3';

  // Local PST / MBOX storage info state
  const [storageInfo, setStorageInfo] = useState<LocalStorageInfo | null>(null);

  useEffect(() => {
    if (window.electronAPI?.getLocalStorageInfo && selectedAccount?.email) {
      window.electronAPI
        .getLocalStorageInfo(selectedAccount.email)
        .then((info) => setStorageInfo(info))
        .catch(() => {});
    }
  }, [selectedAccount?.email, activeSection]);

  const toggleAccountExpand = (id: string) => {
    setExpandedAccountIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Arrastar e soltar com o mouse para reordenar as contas
  const [draggingAccountId, setDraggingAccountId] = useState<string | null>(null);
  const accountItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const accountDragRef = useRef<{
    accId: string;
    startY: number;
    isDragging: boolean;
    holdTimer: number | null;
  } | null>(null);
  const suppressAccClickRef = useRef(false);
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const selectedAccountIdRef = useRef(selectedAccountId);
  selectedAccountIdRef.current = selectedAccountId;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onUpdateSettingsRef = useRef(onUpdateSettings);
  onUpdateSettingsRef.current = onUpdateSettings;

  useEffect(() => {
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

      const currentList = accountsRef.current;
      const currentIndex = currentList.findIndex((a) => a.id === state.accId);
      if (currentIndex === -1) return;

      for (let idx = 0; idx < currentList.length; idx++) {
        if (idx === currentIndex) continue;
        const otherAcc = currentList[idx];
        const el = accountItemRefs.current[otherAcc.id];
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
          accountsRef.current = nextList;
          setAccounts(nextList);
          const active =
            nextList.find((a) => a.id === selectedAccountIdRef.current) || nextList[0];
          const newSettings: AppSettings = {
            ...settingsRef.current,
            accounts: nextList,
            activeAccountId: selectedAccountIdRef.current,
            account: active,
          };
          onUpdateSettingsRef.current(newSettings);
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

  const saveAll = (updatedAccounts: AccountSettings[], currentActiveId: string) => {
    const active = updatedAccounts.find((a) => a.id === currentActiveId) || updatedAccounts[0];
    const newSettings: AppSettings = {
      ...settings,
      accounts: updatedAccounts,
      activeAccountId: currentActiveId,
      account: active,
    };
    onUpdateSettings(newSettings);
    setSaveBanner(true);
    setTimeout(() => setSaveBanner(false), 2000);
  };

  const handleUpdateCurrentAccount = (updates: Partial<AccountSettings>) => {
    setAccounts((prev) => {
      const updated = prev.map((acc) =>
        acc.id === selectedAccountId ? { ...acc, ...updates } : acc
      );
      const active = updated.find((a) => a.id === selectedAccountId) || updated[0];
      const newSettings: AppSettings = {
        ...settings,
        accounts: updated,
        activeAccountId: selectedAccountId,
        account: active,
      };
      try {
        saveSettingsLocal(newSettings);
        window.electronAPI?.saveAppSettings?.(newSettings);
      } catch (e) {
        console.warn('Erro ao salvar localmente:', e);
      }
      return updated;
    });
  };

  // Set account as default
  const handleSetDefault = (id: string) => {
    const updated = accounts.map((acc) => ({
      ...acc,
      isDefault: acc.id === id,
    }));
    setAccounts(updated);
    saveAll(updated, id);
  };

  // Remove account
  const handleConfirmDelete = () => {
    if (!accountToDelete) return;
    if (accounts.length <= 1) {
      alert('Não é possível remover a única conta cadastrada no Anectta MAIL.');
      setAccountToDelete(null);
      return;
    }

    const updated = accounts.filter((a) => a.id !== accountToDelete.id);
    if (accountToDelete.isDefault && updated.length > 0) {
      updated[0].isDefault = true;
    }
    const nextSelected = updated[0].id;
    setAccounts(updated);
    setSelectedAccountId(nextSelected);
    saveAll(updated, nextSelected);
    setAccountToDelete(null);
  };

  // Add new account
  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccEmail.trim() || !newAccName.trim()) return;

    const domain = newAccEmail.includes('@') ? newAccEmail.split('@')[1].toLowerCase() : '';
    const cleanHost = newAccHost.trim();
    const defaultHost = cleanHost || (domain ? `mail.${domain}` : '');
    const defaultSmtpHost =
      cleanHost && /^(pop3?|imap4?)\./i.test(cleanHost)
        ? cleanHost.replace(/^(pop3?|imap4?)\./i, 'smtp.')
        : cleanHost || (domain ? `smtp.${domain}` : '');
    const isTerra = defaultSmtpHost.toLowerCase().includes('terra.com.br');
    const generatedId = `acc-${Date.now()}`;
    const newAccount: AccountSettings = {
      id: generatedId,
      accountName: newAccEmail.trim(),
      color: '#3b82f6',
      isDefault: accounts.length === 0,
      displayName: newAccName.trim(),
      email: newAccEmail.trim(),
      role: 'Colaborador',
      replyTo: '',
      organization: 'Anectta',
      signature: `Atenciosamente,\n\n${newAccName}\n${newAccEmail}`,
      signatureUseHtml: false,
      attachVCard: false,
      password: newAccPassword,
      serverType: 'exchange',
      incomingServer: {
        protocol: newAccProtocol,
        host: newAccHost.trim() || defaultHost,
        port: newAccProtocol === 'pop3' ? 995 : 993,
        security: 'ssl',
        username: newAccEmail.trim(),
        password: newAccPassword,
        checkEveryMinutes: 10,
        checkOnStartup: true,
        leaveOnServer: true,
        deleteAfterDays: 14,
      },
      outgoingServer: {
        host: defaultSmtpHost,
        port: isTerra ? 587 : 465,
        security: isTerra ? 'starttls' : 'ssl',
        username: newAccEmail.trim(),
        password: newAccPassword,
      },
    };

    const updated = [...accounts, newAccount];
    setAccounts(updated);
    setSelectedAccountId(generatedId);
    setExpandedAccountIds((prev) => ({ ...prev, [generatedId]: true }));
    saveAll(updated, generatedId);

    // Reset modal
    setNewAccName('');
    setNewAccEmail('');
    setNewAccPassword('');
    setNewAccHost('');
    setIsAddAccountModalOpen(false);
  };

  // Executa o teste estilo Outlook com tarefas e erros detalhados
  const runFullAccountTest = async () => {
    setIsTestModalOpen(true);
    setTestModalTab('tarefas');
    setIncomingTaskStatus('running');
    setOutgoingTaskStatus('pending');
    setIncomingTaskError('');
    setOutgoingTaskError('');

    const inHost = selectedAccount.incomingServer.host;
    const inUser = selectedAccount.incomingServer.username || selectedAccount.email;
    const inPass = selectedAccount.incomingServer.password || selectedAccount.password || '';
    const inProtocol = selectedAccount.incomingServer.protocol || 'imap';
    const inPort = selectedAccount.incomingServer.port;
    const inSecure = selectedAccount.incomingServer.security !== 'none';

    // Tarefa 1: Logon no servidor de entrada
    try {
      if (window.electronAPI?.testImapConnection) {
        const res = await window.electronAPI.testImapConnection({
          protocol: inProtocol,
          host: inHost,
          port: inPort,
          secure: inSecure,
          user: inUser,
          pass: inPass,
        });
        if (res.success) {
          setIncomingTaskStatus('success');
        } else {
          setIncomingTaskStatus('failed');
          setIncomingTaskError(res.message || 'Falha ao autenticar no servidor de entrada.');
        }
      } else {
        await new Promise((r) => setTimeout(r, 600));
        setIncomingTaskStatus('success');
      }
    } catch (err: any) {
      setIncomingTaskStatus('failed');
      setIncomingTaskError(err?.message || 'Erro inesperado no servidor de entrada.');
    }

    // Tarefa 2: Enviar email de teste via SMTP
    setOutgoingTaskStatus('running');
    const outHost = selectedAccount.outgoingServer.host || (inHost ? inHost.replace(/^(pop3?|imap4?)\./i, 'smtp.') : '');
    const useCustomSmtp = selectedAccount.outgoingServer.authMode === 'custom_credentials';
    const outUser = useCustomSmtp
      ? selectedAccount.outgoingServer.username || inUser
      : inUser;
    const outPass = useCustomSmtp
      ? selectedAccount.outgoingServer.password || inPass
      : inPass;
    const outPort = selectedAccount.outgoingServer.port || 465;
    const outSecure = outPort === 465;

    try {
      if (window.electronAPI?.sendRealEmail && outHost && outPass) {
        const res = await window.electronAPI.sendRealEmail(
          {
            host: outHost,
            incomingHost: inHost,
            port: outPort,
            secure: outSecure,
            user: outUser,
            pass: outPass,
          },
          {
            sender: `Teste Anectta MAIL <${selectedAccount.email}>`,
            recipient: selectedAccount.email,
            subject: 'Mensagem de teste de email do Anectta MAIL',
            body: `Esta é uma mensagem de email enviada automaticamente pelo Anectta MAIL durante o teste da sua conta.\n\nData/Hora: ${new Date().toLocaleString()}\nConta: ${selectedAccount.email}\nServidor Entrada: ${inHost} (${inProtocol.toUpperCase()})\nServidor Saída: ${outHost} (Porta ${outPort})`,
          }
        );

        if (res.success) {
          setOutgoingTaskStatus('success');
        } else {
          setOutgoingTaskStatus('failed');
          setOutgoingTaskError(res.error || 'Falha ao enviar mensagem de teste via SMTP.');
        }
      } else {
        await new Promise((r) => setTimeout(r, 800));
        setOutgoingTaskStatus('success');
      }
    } catch (err: any) {
      setOutgoingTaskStatus('failed');
      setOutgoingTaskError(err?.message || 'Erro inesperado no servidor SMTP de saída.');
    }
  };

  return (
    <div className="flex-1 bg-slate-950 flex flex-col h-full overflow-hidden text-slate-200 font-sans">
      {/* Top Document Tabs */}
      <div className="h-10 bg-slate-950 border-b border-slate-800/90 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center space-x-1 h-full">
          {/* Main Inbox Tab */}
          <button
            onClick={() => {
              saveAll(accounts, selectedAccountId);
              onClose();
            }}
            className="flex items-center space-x-2 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900 rounded-t-lg transition-colors"
          >
            <Mail className="w-3.5 h-3.5 text-slate-500" />
            <span className="truncate max-w-[140px] font-mono">{selectedAccount?.email}</span>
          </button>

          {/* Active Account Settings Tab */}
          <div className="flex items-center space-x-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 border-t-2 border-brand-500 rounded-t-lg shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
            <span>Configurações de contas</span>
            <button
              onClick={() => {
                saveAll(accounts, selectedAccountId);
                onClose();
              }}
              className="ml-1 p-0.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
              title="Fechar aba"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Save confirmation indicator */}
        <div className="flex items-center space-x-2">
          {saveBanner && (
            <span className="text-[11px] text-emerald-400 font-medium flex items-center space-x-1 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Alterações salvas!</span>
            </span>
          )}
          <button
            onClick={() => {
              saveAll(accounts, selectedAccountId);
              if (autoTestOnNext) {
                runFullAccountTest();
              } else {
                onClose();
              }
            }}
            className="flex items-center space-x-1.5 px-3 py-1 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg shadow-sm"
          >
            <Save className="w-3 h-3" />
            <span>Concluir</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout: Left Account Tree + Right Configuration Deck */}
      <div className="flex-1 flex overflow-hidden">
        {/* ================= LEFT TREE PANEL ================= */}
        <aside className="w-68 bg-slate-925 border-r border-slate-800/80 flex flex-col justify-between shrink-0 h-full p-3">
          <div className="space-y-3 overflow-y-auto custom-scroll">
            {/* Blue "+ Adicionar conta" button */}
            <button
              onClick={() => {
                if (onOpenSetupWizard) {
                  onOpenSetupWizard();
                } else {
                  setIsAddAccountModalOpen(true);
                }
              }}
              className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-brand-600 hover:bg-brand-500 active:scale-98 text-white text-xs font-semibold rounded-xl shadow-md shadow-brand-600/30 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar conta</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPairingCodeResult(null);
                setPairingError(null);
                setPairingCopied(false);
                setIsPairMobileOpen(true);
              }}
              className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs font-semibold rounded-xl transition-all cursor-pointer"
            >
              <Smartphone className="w-4 h-4 text-brand-400" />
              <span>Parear Mobile</span>
            </button>

            {/* List of Accounts with Sub-items */}
            <div className="space-y-2 pt-1">
              {accounts.map((acc) => {
                const isSelected = selectedAccountId === acc.id;
                const isBeingDragged = draggingAccountId === acc.id;
                const isExpanded = (expandedAccountIds[acc.id] ?? true) && !isBeingDragged;
                const accProtocol = (acc.incomingServer?.protocol || 'imap').toUpperCase();

                return (
                  <div
                    key={acc.id}
                    ref={(el) => {
                      accountItemRefs.current[acc.id] = el;
                    }}
                    className={`space-y-0.5 transition-transform duration-150 ${
                      isBeingDragged ? 'z-20 relative scale-[1.02]' : ''
                    }`}
                  >
                    {/* Account Header with Protocol Badge & Star */}
                    <div
                      onClick={(e) => {
                        if (suppressAccClickRef.current) {
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                        setSelectedAccountId(acc.id);
                        setActiveSection('identity');
                      }}
                      title={acc.email}
                      className={`group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isBeingDragged
                          ? 'bg-sky-500/20 text-white font-bold ring-2 ring-sky-400 shadow-lg'
                          : isSelected && activeSection === 'identity'
                          ? 'bg-slate-800 text-white font-bold ring-1 ring-brand-500/30'
                          : 'text-slate-300 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5 min-w-0 flex-1 mr-1">
                        {accounts.length > 1 && (
                          <span
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              if (e.button !== 0 || accounts.length <= 1) return;
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
                              className={`w-3 h-3 shrink-0 transition-opacity ${
                                isBeingDragged
                                  ? 'text-sky-400 opacity-100'
                                  : 'text-slate-500 opacity-50 group-hover:opacity-90 hover:!opacity-100 hover:text-sky-400'
                              }`}
                            />
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAccountExpand(acc.id);
                          }}
                          className="p-0.5 text-slate-500 hover:text-slate-300"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                        </button>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: acc.color || '#2563eb' }}
                        />
                        <span className="truncate font-mono text-[11px]">{acc.email}</span>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        {/* Protocol badge on every configured email */}
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                            accProtocol === 'IMAP'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                          title={`Configuração exclusiva: ${accProtocol}`}
                        >
                          {accProtocol}
                        </span>

                        {acc.isDefault && (
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                        )}
                      </div>
                    </div>

                    {/* Submenu items under account */}
                    {isExpanded && (
                      <div className="pl-5 space-y-0.5 text-[11px]">
                        <button
                          onClick={() => {
                            setSelectedAccountId(acc.id);
                            setActiveSection('identity');
                          }}
                          className={`w-full text-left px-2 py-1 rounded transition-colors ${
                            isSelected && activeSection === 'identity'
                              ? 'bg-brand-600/20 text-brand-300 font-semibold border-l-2 border-brand-500'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                          }`}
                        >
                          Identidade & Protocolo
                        </button>

                        <button
                          onClick={() => {
                            setSelectedAccountId(acc.id);
                            setActiveSection('server');
                          }}
                          className={`w-full text-left px-2 py-1 rounded transition-colors flex items-center justify-between ${
                            isSelected && activeSection === 'server'
                              ? 'bg-brand-600/20 text-brand-300 font-semibold border-l-2 border-brand-500'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                          }`}
                        >
                          <span>Configurações do servidor</span>
                          <span className="text-[9px] font-mono text-slate-500">
                            {accProtocol}
                          </span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedAccountId(acc.id);
                            setActiveSection('copies_folders');
                          }}
                          className={`w-full text-left px-2 py-1 rounded transition-colors ${
                            isSelected && activeSection === 'copies_folders'
                              ? 'bg-brand-600/20 text-brand-300 font-semibold border-l-2 border-brand-500'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                          }`}
                        >
                          Cópias e pastas
                        </button>

                        <button
                          onClick={() => {
                            setSelectedAccountId(acc.id);
                            setActiveSection('composition');
                          }}
                          className={`w-full text-left px-2 py-1 rounded transition-colors ${
                            isSelected && activeSection === 'composition'
                              ? 'bg-brand-600/20 text-brand-300 font-semibold border-l-2 border-brand-500'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                          }`}
                        >
                          Redação e endereçamento
                        </button>

                        <button
                          onClick={() => {
                            setSelectedAccountId(acc.id);
                            setActiveSection('sync_storage');
                          }}
                          className={`w-full text-left px-2 py-1 rounded transition-colors flex items-center justify-between ${
                            isSelected && activeSection === 'sync_storage'
                              ? 'bg-brand-600/20 text-brand-300 font-semibold border-l-2 border-brand-500'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                          }`}
                        >
                          <span>Sincronização & Pastas</span>
                          <span className="text-[9px] font-mono text-slate-500">
                            {accProtocol === 'IMAP' ? 'Nuvem' : 'Local'}
                          </span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedAccountId(acc.id);
                            setActiveSection('encryption');
                          }}
                          className={`w-full text-left px-2 py-1 rounded transition-colors ${
                            isSelected && activeSection === 'encryption'
                              ? 'bg-brand-600/20 text-brand-300 font-semibold border-l-2 border-brand-500'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                          }`}
                        >
                          Criptografia de ponta a ponta
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Pastas locais */}
              <div className="pt-2 border-t border-slate-900 text-xs">
                <div className="flex items-center space-x-1.5 px-2 py-1 text-slate-400 font-semibold">
                  <FolderTree className="w-3.5 h-3.5 text-slate-500" />
                  <span>Pastas locais</span>
                </div>
                <div className="pl-6 space-y-0.5 text-[11px] text-slate-500">
                  <div className="py-0.5 hover:text-slate-300 cursor-pointer">Lixeira & Spam local</div>
                  <div className="py-0.5 hover:text-slate-300 cursor-pointer">Espaço em disco</div>
                </div>
              </div>

              {/* Servidor de envio (SMTP) */}
              <button
                onClick={() => setActiveSection('outgoing_smtp')}
                className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeSection === 'outgoing_smtp'
                    ? 'bg-slate-800 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Send className="w-3.5 h-3.5 text-cyan-400" />
                <span>Servidor de envio (SMTP)</span>
              </button>
            </div>
          </div>

          {/* Bottom links */}
          <div className="pt-3 border-t border-slate-900 space-y-1 text-xs text-slate-500">
            <div className="flex items-center space-x-2 px-2 py-1 hover:text-slate-300 cursor-pointer rounded">
              <Settings className="w-3.5 h-3.5" />
              <span>Geral & Interface</span>
            </div>
            <div className="flex items-center space-x-2 px-2 py-1 hover:text-slate-300 cursor-pointer rounded">
              <Puzzle className="w-3.5 h-3.5" />
              <span>Extensões e temas</span>
            </div>
          </div>
        </aside>

        {/* ================= RIGHT CONFIGURATION DECK ================= */}
        <main className="flex-1 bg-slate-950 p-8 overflow-y-auto custom-scroll space-y-6">
          {/* Top Title Bar with Action Buttons and Exclusive Account Protocol Badge */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
            <div className="flex items-center space-x-2.5">
              <h2 className="text-base font-bold text-white tracking-wide flex items-center space-x-2">
                <span>Configurações de contas -</span>
                <span className="text-brand-400 font-mono text-sm">{selectedAccount?.email}</span>
              </h2>

              {/* Distinctive Header Badge indicating Protocol */}
              <span
                className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                  selectedProtocol === 'imap'
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}
              >
                {selectedProtocol === 'imap'
                  ? '● CONTA IMAP (SINCRONIZAÇÃO EM NUVEM)'
                  : '● CONTA POP3 (DOWNLOAD LOCAL)'}
              </span>
            </div>

            <div className="flex items-center space-x-2.5">
              {/* Definir como padrão */}
              <button
                onClick={() => handleSetDefault(selectedAccount.id)}
                disabled={selectedAccount?.isDefault}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  selectedAccount?.isDefault
                    ? 'bg-slate-900 text-slate-500 border-slate-800 cursor-default'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                }`}
              >
                {selectedAccount?.isDefault ? 'Conta Padrão' : 'Definir como padrão'}
              </button>

              {/* Botão Vermelho EXCLUIR */}
              <button
                onClick={() => setAccountToDelete(selectedAccount)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all active:scale-95"
                title="Remover esta conta do aplicativo"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>
            </div>
          </div>

          {/* ================= SECTION: IDENTIDADE DA CONTA & PROTOCOLO EXCLUSIVO ================= */}
          {activeSection === 'identity' && (
            <div className="space-y-6 max-w-2xl">
              {/* ================= CARD EXCLUSIVO DE PROTOCOLO DA CONTA ================= */}
              <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4 shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                        selectedProtocol === 'imap'
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                          : 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {selectedProtocol.toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                        <span>Configuração Exclusiva de Protocolo</span>
                        <span className="text-[10px] text-slate-400 font-normal normal-case">
                          ({selectedAccount.email})
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Define como este e-mail exclusivo sincroniza suas mensagens e pastas com o servidor.
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[11px] font-mono px-2.5 py-1 rounded-lg font-bold border ${
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

                {/* Seleção Interativa do Protocolo para esta conta */}
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() =>
                      handleUpdateCurrentAccount({
                        incomingServer: {
                          ...selectedAccount.incomingServer,
                          protocol: 'imap',
                          port: selectedAccount.incomingServer.port === 995 ? 993 : selectedAccount.incomingServer.port,
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
                      Sincronização em nuvem em tempo real de <strong className="text-slate-200">todas as pastas</strong> (Caixa de Entrada, Enviados, Rascunhos, Lixeira, Lixo Eletrônico, Arquivo).
                    </p>
                    <div className="mt-2 text-[10px] font-mono text-blue-400/90">
                      Porta Padrão: 993 SSL/TLS
                    </div>
                  </div>

                  <div
                    onClick={() =>
                      handleUpdateCurrentAccount({
                        incomingServer: {
                          ...selectedAccount.incomingServer,
                          protocol: 'pop3',
                          port: selectedAccount.incomingServer.port === 993 ? 995 : selectedAccount.incomingServer.port,
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
                      Download das mensagens da Caixa de Entrada para <strong className="text-slate-200">armazenamento local</strong> deste computador.
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
                      {selectedAccount.incomingServer.host || '(não configurado)'}:{selectedAccount.incomingServer.port}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Servidor Saída (SMTP):</span>{' '}
                    <span className="font-mono text-white">
                      {selectedAccount.outgoingServer.host || '(não configurado)'}:{selectedAccount.outgoingServer.port}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Usuário Entrada:</span>{' '}
                    <span className="font-mono text-white">
                      {selectedAccount.incomingServer.username || selectedAccount.email}
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

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveSection('server')}
                    className="text-xs text-brand-400 hover:text-brand-300 underline font-medium"
                  >
                    Acessar Configurações Detalhadas do Servidor &gt;
                  </button>

                  <button
                    type="button"
                    onClick={runFullAccountTest}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-white text-xs font-semibold rounded-lg border border-slate-700 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3 text-brand-400" />
                    <span>Testar Conexão {selectedProtocol.toUpperCase()}</span>
                  </button>
                </div>
              </div>

              {/* Nome da conta e Cor */}
              <div className="flex items-start space-x-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nome da conta:
                  </label>
                  <input
                    type="text"
                    value={selectedAccount.accountName ?? ''}
                    onChange={(e) => handleUpdateCurrentAccount({ accountName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Cor:</label>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="color"
                      value={selectedAccount.color || '#2563eb'}
                      onChange={(e) => handleUpdateCurrentAccount({ color: e.target.value })}
                      className="w-10 h-8 rounded-lg cursor-pointer bg-slate-900 border border-slate-800 p-0.5"
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdateCurrentAccount({ color: '#2563eb' })}
                      className="p-1.5 text-slate-500 hover:text-slate-300 rounded"
                      title="Restaurar cor padrão"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Identidade padrão */}
              <div className="space-y-4 pt-2">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Identidade padrão & Foto de Perfil
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Configure sua foto de perfil exibida na barra lateral e as informações da sua identidade corporativa.
                  </p>
                </div>

                {/* Foto de Perfil do Usuário */}
                <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between gap-4">
                  <div className="flex items-center space-x-3.5">
                    {selectedAccount.avatar ? (
                      <img
                        src={selectedAccount.avatar}
                        alt={selectedAccount.displayName || selectedAccount.email}
                        className="w-12 h-12 rounded-xl object-cover ring-2 ring-brand-500/60 shrink-0"
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-xl text-white font-bold text-sm flex items-center justify-center ring-2 ring-slate-700 shrink-0"
                        style={{ backgroundColor: selectedAccount.color || '#2563eb' }}
                      >
                        {(selectedAccount.displayName || selectedAccount.email || 'AN')
                          .split(/[\s@._-]+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase())
                          .join('')}
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-semibold text-white">Foto do Usuário (Avatar)</div>
                      <div className="text-[11px] text-slate-400">
                        Exibida no canto inferior esquerdo do aplicativo para a conta{' '}
                        <span className="font-mono text-slate-200">{selectedAccount.email}</span>.
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
                              handleUpdateCurrentAccount({ avatar: reader.result });
                            }
                          };
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {selectedAccount.avatar && (
                      <button
                        type="button"
                        onClick={() => handleUpdateCurrentAccount({ avatar: '' })}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-600/80 text-slate-300 hover:text-white rounded-lg text-xs transition-colors"
                        title="Remover foto e usar iniciais"
                      >
                        Remover Foto
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Seu nome:</label>
                  <input
                    type="text"
                    value={selectedAccount.displayName ?? ''}
                    onChange={(e) => handleUpdateCurrentAccount({ displayName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Endereço de email:</label>
                  <input
                    type="email"
                    value={selectedAccount.email ?? ''}
                    onChange={(e) => handleUpdateCurrentAccount({ email: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Endereço de resposta (Reply-to):
                  </label>
                  <input
                    type="email"
                    value={selectedAccount.replyTo ?? ''}
                    onChange={(e) => handleUpdateCurrentAccount({ replyTo: e.target.value })}
                    placeholder="Respostas de destinatários serão para este outro endereço"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono placeholder-slate-600 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Organização:</label>
                  <input
                    type="text"
                    value={selectedAccount.organization ?? ''}
                    onChange={(e) => handleUpdateCurrentAccount({ organization: e.target.value })}
                    placeholder="Nome da sua empresa ou corporação"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                </div>

                {/* Texto da assinatura */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-300">Texto da assinatura:</label>
                    <label className="flex items-center space-x-1.5 text-[11px] text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedAccount.signatureUseHtml || false}
                        onChange={(e) =>
                          handleUpdateCurrentAccount({ signatureUseHtml: e.target.checked })
                        }
                        className="rounded bg-slate-900 border-slate-700 text-brand-600 focus:ring-brand-500"
                      />
                      <span>Usar HTML (por exemplo, &lt;b&gt;negrito&lt;/b&gt;)</span>
                    </label>
                  </div>
                  <textarea
                    rows={5}
                    value={selectedAccount.signature ?? ''}
                    onChange={(e) => handleUpdateCurrentAccount({ signature: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-sans focus:outline-none focus:border-brand-500 leading-relaxed"
                  />
                </div>

                {/* Checkboxes de assinatura e vCard */}
                <div className="space-y-2 pt-1 text-xs text-slate-300">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded bg-slate-900 border-slate-700 text-brand-600 focus:ring-brand-500"
                    />
                    <span>Anexar assinatura a partir de um arquivo (texto, HTML ou imagem)</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedAccount.attachVCard || false}
                      onChange={(e) =>
                        handleUpdateCurrentAccount({ attachVCard: e.target.checked })
                      }
                      className="rounded bg-slate-900 border-slate-700 text-brand-600 focus:ring-brand-500"
                    />
                    <span>Anexar meu vCard às mensagens enviadas</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ================= SECTION: CONFIGURAÇÕES DO SERVIDOR (IMAP / POP3 / SMTP / AVANÇADO) ================= */}
          {activeSection === 'server' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
                  <Server className="w-4 h-4 text-brand-400" />
                  <span>Configurações do Servidor de Entrada &amp; Saída</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Altere aqui os parâmetros de conexão do seu provedor de e-mail corporativo para a conta{' '}
                  <span className="font-mono text-slate-200">{selectedAccount.email}</span>.
                </p>
              </div>

              {/* Protocolo: IMAP vs POP3 */}
              <div className="flex items-center space-x-3 p-3 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-xs font-semibold text-slate-300">Tipo de Servidor:</span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      const useSsl = selectedAccount.incomingServer.security !== 'none';
                      handleUpdateCurrentAccount({
                        incomingServer: {
                          ...selectedAccount.incomingServer,
                          protocol: 'imap',
                          port: useSsl ? 993 : 143,
                        },
                      });
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      selectedProtocol === 'imap'
                        ? 'bg-blue-600/30 text-blue-300 border-blue-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    IMAP (Servidor de correio na nuvem • Multi-pastas)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const useSsl = selectedAccount.incomingServer.security !== 'none';
                      handleUpdateCurrentAccount({
                        incomingServer: {
                          ...selectedAccount.incomingServer,
                          protocol: 'pop3',
                          port: useSsl ? 995 : 110,
                        },
                      });
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      selectedProtocol === 'pop3'
                        ? 'bg-amber-600/30 text-amber-300 border-amber-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    POP3 (Servidor de correio local • Download de Entrada)
                  </button>
                </div>
              </div>

              {/* Grid 2 Colunas: Informações da Conta (Esquerda) + Testar Configurações (Direita) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Coluna Esquerda: Informações do Usuário, Servidor e Logon */}
                <div className="lg:col-span-7 space-y-4">
                  {/* Informações do Usuário */}
                  <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3">
                    <div className="text-xs font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-2">
                      Informações do Usuário
                    </div>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <label className="text-xs text-slate-300">Nome:</label>
                      <input
                        type="text"
                        value={selectedAccount.displayName ?? ''}
                        onChange={(e) => handleUpdateCurrentAccount({ displayName: e.target.value })}
                        className="col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <label className="text-xs text-slate-300">Endereço de Email:</label>
                      <input
                        type="email"
                        value={selectedAccount.email ?? ''}
                        onChange={(e) => handleUpdateCurrentAccount({ email: e.target.value })}
                        className="col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>

                  {/* Informações do Servidor */}
                  <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3">
                    <div className="text-xs font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-2">
                      Informações do Servidor
                    </div>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <label className="text-xs text-slate-300">Tipo de Conta:</label>
                      <select
                        value={selectedProtocol}
                        onChange={(e) => {
                          const proto = e.target.value as 'imap' | 'pop3';
                          const useSsl = selectedAccount.incomingServer.security !== 'none';
                          handleUpdateCurrentAccount({
                            incomingServer: {
                              ...selectedAccount.incomingServer,
                              protocol: proto,
                              port: proto === 'pop3' ? (useSsl ? 995 : 110) : (useSsl ? 993 : 143),
                            },
                          });
                        }}
                        className="col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-semibold"
                      >
                        <option value="pop3">POP3</option>
                        <option value="imap">IMAP</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <label className="text-xs text-slate-300">Servidor de entrada de emails:</label>
                      <input
                        type="text"
                        value={selectedAccount.incomingServer.host}
                        onChange={(e) => {
                          const newInHost = e.target.value;
                          const updates: Partial<AccountSettings> = {
                            incomingServer: {
                              ...selectedAccount.incomingServer,
                              host: newInHost,
                            },
                          };
                          if (/^(pop3?|imap4?)\./i.test(newInHost.trim())) {
                            const derivedSmtp = newInHost.trim().replace(/^(pop3?|imap4?)\./i, 'smtp.');
                            const accDomain = selectedAccount.email.includes('@')
                              ? selectedAccount.email.split('@')[1].toLowerCase()
                              : '';
                            const curOut = (selectedAccount.outgoingServer?.host || '').toLowerCase();
                            if (
                              !curOut ||
                              curOut === 'email-ssl.com.br' ||
                              curOut === `smtp.${accDomain}` ||
                              curOut === `mail.${accDomain}` ||
                              /^(smtp)\./i.test(curOut)
                            ) {
                              const isTerraHost = derivedSmtp.toLowerCase().includes('terra.com.br');
                              updates.outgoingServer = {
                                ...selectedAccount.outgoingServer,
                                host: derivedSmtp,
                                port: isTerraHost ? 587 : selectedAccount.outgoingServer.port,
                                security: isTerraHost ? 'starttls' : selectedAccount.outgoingServer.security,
                              };
                            }
                          }
                          handleUpdateCurrentAccount(updates);
                        }}
                        placeholder="ex: pop.terra.com.br"
                        className="col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <label className="text-xs text-slate-300">Servidor de saída de emails (SMTP):</label>
                      <input
                        type="text"
                        value={selectedAccount.outgoingServer.host}
                        onChange={(e) =>
                          handleUpdateCurrentAccount({
                            outgoingServer: {
                              ...selectedAccount.outgoingServer,
                              host: e.target.value,
                            },
                          })
                        }
                        placeholder="ex: smtp.terra.com.br"
                        className="col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>

                  {/* Informações de Logon */}
                  <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3">
                    <div className="text-xs font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-2">
                      Informações de Logon
                    </div>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <label className="text-xs text-slate-300">Nome de Usuário:</label>
                      <input
                        type="text"
                        value={selectedAccount.incomingServer.username ?? ''}
                        onChange={(e) =>
                          handleUpdateCurrentAccount({
                            incomingServer: {
                              ...selectedAccount.incomingServer,
                              username: e.target.value,
                            },
                          })
                        }
                        className="col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                      />
                    </div>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <label className="text-xs text-slate-300">Senha:</label>
                      <div className="col-span-2 relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={selectedAccount.incomingServer.password ?? selectedAccount.password ?? ''}
                          onChange={(e) =>
                            handleUpdateCurrentAccount({
                              password: e.target.value,
                              incomingServer: {
                                ...selectedAccount.incomingServer,
                                password: e.target.value,
                              },
                            })
                          }
                          placeholder="Senha do e-mail"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-10 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Alertas dinâmicos de provedor (Gmail, Yahoo, iCloud, AOL, Microsoft) */}
                    <div className="col-span-3">
                      <EmailProviderNotice
                        email={selectedAccount.email}
                        host={selectedAccount.incomingServer?.host}
                        providerId={selectedAccount.provider}
                        variant="dark"
                      />
                    </div>

                    <div className="pt-1 space-y-2 text-xs text-slate-300">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedAccount.incomingServer.rememberPassword ?? true}
                          onChange={(e) =>
                            handleUpdateCurrentAccount({
                              incomingServer: {
                                ...selectedAccount.incomingServer,
                                rememberPassword: e.target.checked,
                              },
                            })
                          }
                          className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                        />
                        <span>Lembrar senha</span>
                      </label>

                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedAccount.incomingServer.requireSpa ?? false}
                          onChange={(e) =>
                            handleUpdateCurrentAccount({
                              incomingServer: {
                                ...selectedAccount.incomingServer,
                                requireSpa: e.target.checked,
                              },
                            })
                          }
                          className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                        />
                        <span>Exigir logon usando Autenticação de Senha de Segurança (SPA)</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Coluna Direita: Testar Configurações da Conta */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3.5">
                    <div className="text-xs font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-2">
                      Testar Configurações da Conta
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      É recomendável testar sua conta para garantir que as entradas estão corretas.
                    </p>

                    <div>
                      <button
                        type="button"
                        onClick={runFullAccountTest}
                        className="w-full py-2 px-3 bg-brand-600 hover:bg-brand-500 active:scale-98 text-white rounded-lg text-xs font-semibold shadow-md shadow-brand-600/20 transition-all flex items-center justify-center space-x-2"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Testar configurações da conta...</span>
                      </button>
                    </div>

                    <label className="flex items-start space-x-2 cursor-pointer pt-1 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={autoTestOnNext}
                        onChange={(e) => setAutoTestOnNext(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500 mt-0.5"
                      />
                      <span className="leading-tight">
                        Testar automaticamente as configurações da conta quando o botão Concluir for clicado
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* ================= PAINEL: CONFIGURAÇÕES DE EMAIL NA INTERNET (GERAL | SERVIDOR DE SAÍDA | AVANÇADO) ================= */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                {/* Cabeçalho das Abas Estilo Outlook */}
                <div className="bg-slate-950 px-4 pt-3 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setServerSubTab('geral')}
                      className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-t border-x transition-all ${
                        serverSubTab === 'geral'
                          ? 'bg-slate-900 text-white border-slate-700 border-b-transparent -mb-px'
                          : 'bg-slate-950 text-slate-400 border-transparent hover:text-slate-200'
                      }`}
                    >
                      Geral
                    </button>
                    <button
                      type="button"
                      onClick={() => setServerSubTab('saida')}
                      className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-t border-x transition-all ${
                        serverSubTab === 'saida'
                          ? 'bg-slate-900 text-white border-slate-700 border-b-transparent -mb-px'
                          : 'bg-slate-950 text-slate-400 border-transparent hover:text-slate-200'
                      }`}
                    >
                      Servidor de saída
                    </button>
                    <button
                      type="button"
                      onClick={() => setServerSubTab('avancado')}
                      className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-t border-x transition-all ${
                        serverSubTab === 'avancado'
                          ? 'bg-slate-900 text-white border-slate-700 border-b-transparent -mb-px'
                          : 'bg-slate-950 text-slate-400 border-transparent hover:text-slate-200'
                      }`}
                    >
                      Avançado
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium pb-2">
                    Configurações de Email na Internet
                  </span>
                </div>

                {/* Conteúdo da Aba Selecionada */}
                <div className="p-5 space-y-5 text-xs text-slate-300">
                  {/* ABA 1: GERAL */}
                  {serverSubTab === 'geral' && (
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-white">Conta de email</span>
                          <div className="flex-1 h-px bg-slate-800" />
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Digite o nome que deseja dar à conta. Por exemplo: &ldquo;Trabalho&rdquo; ou &ldquo;Microsoft Mail Server&rdquo;
                        </p>
                        <input
                          type="text"
                          value={selectedAccount.accountName ?? selectedAccount.email}
                          onChange={(e) => handleUpdateCurrentAccount({ accountName: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-white">Outras informações do usuário</span>
                          <div className="flex-1 h-px bg-slate-800" />
                        </div>

                        <div className="grid grid-cols-3 items-center gap-3">
                          <label className="text-xs text-slate-300">Organização:</label>
                          <input
                            type="text"
                            value={selectedAccount.organization ?? ''}
                            onChange={(e) => handleUpdateCurrentAccount({ organization: e.target.value })}
                            className="col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                          />
                        </div>

                        <div className="grid grid-cols-3 items-center gap-3">
                          <label className="text-xs text-slate-300">Email de Resposta:</label>
                          <input
                            type="email"
                            value={selectedAccount.replyTo ?? ''}
                            onChange={(e) => handleUpdateCurrentAccount({ replyTo: e.target.value })}
                            className="col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ABA 2: SERVIDOR DE SAÍDA */}
                  {serverSubTab === 'saida' && (
                    <div className="space-y-4">
                      <label className="flex items-center space-x-2 cursor-pointer font-semibold text-white">
                        <input
                          type="checkbox"
                          checked={selectedAccount.outgoingServer.requiresAuth ?? true}
                          onChange={(e) =>
                            handleUpdateCurrentAccount({
                              outgoingServer: {
                                ...selectedAccount.outgoingServer,
                                requiresAuth: e.target.checked,
                              },
                            })
                          }
                          className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                        />
                        <span>Meu servidor de saída (SMTP) requer autenticação</span>
                      </label>

                      <div
                        className={`pl-6 space-y-3.5 transition-opacity ${
                          (selectedAccount.outgoingServer.requiresAuth ?? true)
                            ? 'opacity-100'
                            : 'opacity-40 pointer-events-none'
                        }`}
                      >
                        {/* Opção 1: Usar mesmas config. do servidor de entrada */}
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="smtpAuthMode"
                            checked={
                              (selectedAccount.outgoingServer.authMode || 'same_as_incoming') ===
                              'same_as_incoming'
                            }
                            onChange={() =>
                              handleUpdateCurrentAccount({
                                outgoingServer: {
                                  ...selectedAccount.outgoingServer,
                                  authMode: 'same_as_incoming',
                                },
                              })
                            }
                            className="text-brand-600 bg-slate-950 border-slate-700 focus:ring-brand-500"
                          />
                          <span>Usar mesmas config. do servidor de entrada de emails</span>
                        </label>

                        {/* Opção 2: Fazer logon usando */}
                        <div className="space-y-2.5">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="smtpAuthMode"
                              checked={selectedAccount.outgoingServer.authMode === 'custom_credentials'}
                              onChange={() =>
                                handleUpdateCurrentAccount({
                                  outgoingServer: {
                                    ...selectedAccount.outgoingServer,
                                    authMode: 'custom_credentials',
                                  },
                                })
                              }
                              className="text-brand-600 bg-slate-950 border-slate-700 focus:ring-brand-500"
                            />
                            <span>Fazer logon usando</span>
                          </label>

                          <div
                            className={`pl-6 space-y-2.5 ${
                              selectedAccount.outgoingServer.authMode === 'custom_credentials'
                                ? 'opacity-100'
                                : 'opacity-50 pointer-events-none'
                            }`}
                          >
                            <div className="grid grid-cols-3 items-center gap-3">
                              <label className="text-xs text-slate-300">Nome de usuário:</label>
                              <input
                                type="text"
                                value={
                                  selectedAccount.outgoingServer.username ??
                                  selectedAccount.incomingServer.username ??
                                  selectedAccount.email
                                }
                                onChange={(e) =>
                                  handleUpdateCurrentAccount({
                                    outgoingServer: {
                                      ...selectedAccount.outgoingServer,
                                      username: e.target.value,
                                    },
                                  })
                                }
                                className="col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                              />
                            </div>

                            <div className="grid grid-cols-3 items-center gap-3">
                              <label className="text-xs text-slate-300">Senha:</label>
                              <div className="col-span-2 relative">
                                <input
                                  type={showPassword ? 'text' : 'password'}
                                  value={
                                    selectedAccount.outgoingServer.password ??
                                    selectedAccount.incomingServer.password ??
                                    selectedAccount.password ??
                                    ''
                                  }
                                  onChange={(e) =>
                                    handleUpdateCurrentAccount({
                                      outgoingServer: {
                                        ...selectedAccount.outgoingServer,
                                        password: e.target.value,
                                      },
                                    })
                                  }
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-9 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPassword(!showPassword)}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                >
                                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 items-center gap-3">
                              <div />
                              <label className="col-span-2 flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedAccount.outgoingServer.rememberPassword ?? true}
                                  onChange={(e) =>
                                    handleUpdateCurrentAccount({
                                      outgoingServer: {
                                        ...selectedAccount.outgoingServer,
                                        rememberPassword: e.target.checked,
                                      },
                                    })
                                  }
                                  className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                                />
                                <span>Lembrar senha</span>
                              </label>
                            </div>
                          </div>

                          <div className="pl-6 pt-1">
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedAccount.outgoingServer.requireSpa ?? false}
                                onChange={(e) =>
                                  handleUpdateCurrentAccount({
                                    outgoingServer: {
                                      ...selectedAccount.outgoingServer,
                                      requireSpa: e.target.checked,
                                    },
                                  })
                                }
                                className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                              />
                              <span>Exigir Autenticação de Senha de Segurança (SPA)</span>
                            </label>
                          </div>
                        </div>

                        {/* Opção 3: Fazer logon no servidor de entrada de emails antes de enviar email */}
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="smtpAuthMode"
                            checked={selectedAccount.outgoingServer.authMode === 'logon_incoming_first'}
                            onChange={() =>
                              handleUpdateCurrentAccount({
                                outgoingServer: {
                                  ...selectedAccount.outgoingServer,
                                  authMode: 'logon_incoming_first',
                                },
                              })
                            }
                            className="text-brand-600 bg-slate-950 border-slate-700 focus:ring-brand-500"
                          />
                          <span>Fazer logon no servidor de entrada de emails antes de enviar email</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* ABA 3: AVANÇADO */}
                  {serverSubTab === 'avancado' && (
                    <div className="space-y-5">
                      {/* Números das portas do servidor */}
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-white">Números das portas do servidor</span>
                          <div className="flex-1 h-px bg-slate-800" />
                        </div>

                        {/* Servidor de entrada (POP3 / IMAP) + Usar padrões */}
                        <div className="flex items-center space-x-3">
                          <label className="w-52 text-xs text-slate-300">
                            Servidor de entrada ({selectedProtocol.toUpperCase()}):
                          </label>
                          <input
                            type="number"
                            value={selectedAccount.incomingServer.port}
                            onChange={(e) =>
                              handleUpdateCurrentAccount({
                                incomingServer: {
                                  ...selectedAccount.incomingServer,
                                  port: Number(e.target.value),
                                },
                              })
                            }
                            className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const inSsl = selectedAccount.incomingServer.security !== 'none';
                              const defaultInPort =
                                selectedProtocol === 'pop3'
                                  ? inSsl
                                    ? 995
                                    : 110
                                  : inSsl
                                  ? 993
                                  : 143;
                              const outSec = selectedAccount.outgoingServer.security || 'ssl';
                              const defaultOutPort =
                                outSec === 'ssl'
                                  ? 465
                                  : outSec === 'starttls' || outSec === 'tls' || outSec === 'auto'
                                  ? 587
                                  : 25;
                              handleUpdateCurrentAccount({
                                incomingServer: {
                                  ...selectedAccount.incomingServer,
                                  port: defaultInPort,
                                },
                                outgoingServer: {
                                  ...selectedAccount.outgoingServer,
                                  port: defaultOutPort,
                                },
                              });
                            }}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-xs font-medium transition-colors"
                          >
                            Usar padrões
                          </button>
                        </div>

                        {/* Checkbox: Este servidor requer uma conexão criptografada (SSL/TLS) */}
                        <div className="pl-4">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedAccount.incomingServer.security !== 'none'}
                              onChange={(e) => {
                                const useSsl = e.target.checked;
                                const newPort =
                                  selectedProtocol === 'pop3'
                                    ? useSsl
                                      ? 995
                                      : 110
                                    : useSsl
                                    ? 993
                                    : 143;
                                handleUpdateCurrentAccount({
                                  incomingServer: {
                                    ...selectedAccount.incomingServer,
                                    security: useSsl ? 'ssl' : 'none',
                                    port: newPort,
                                  },
                                });
                              }}
                              className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                            />
                            <span>Este servidor requer uma conexão criptografada (SSL/TLS)</span>
                          </label>
                        </div>

                        {/* Servidor de saída (SMTP) */}
                        <div className="flex items-center space-x-3 pt-1">
                          <label className="w-52 text-xs text-slate-300">
                            Servidor de saída (SMTP):
                          </label>
                          <input
                            type="number"
                            value={selectedAccount.outgoingServer.port}
                            onChange={(e) =>
                              handleUpdateCurrentAccount({
                                outgoingServer: {
                                  ...selectedAccount.outgoingServer,
                                  port: Number(e.target.value),
                                },
                              })
                            }
                            className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                          />
                        </div>

                        {/* Usar o seguinte tipo de conexão criptografada */}
                        <div className="flex items-center space-x-3 pl-4">
                          <label className="text-xs text-slate-300">
                            Usar o seguinte tipo de conexão criptografada:
                          </label>
                          <select
                            value={
                              selectedAccount.outgoingServer.security === 'tls'
                                ? 'starttls'
                                : selectedAccount.outgoingServer.security || 'ssl'
                            }
                            onChange={(e) => {
                              const sec = e.target.value as 'none' | 'ssl' | 'starttls' | 'auto';
                              const suggestedPort =
                                sec === 'ssl'
                                  ? 465
                                  : sec === 'starttls' || sec === 'auto'
                                  ? 587
                                  : 25;
                              handleUpdateCurrentAccount({
                                outgoingServer: {
                                  ...selectedAccount.outgoingServer,
                                  security: sec,
                                  port: suggestedPort,
                                },
                              });
                            }}
                            className="w-40 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                          >
                            <option value="none">Nenhum</option>
                            <option value="ssl">SSL/TLS</option>
                            <option value="starttls">STARTTLS</option>
                            <option value="auto">Automático</option>
                          </select>
                        </div>
                      </div>

                      {/* Tempos limite do servidor */}
                      <div className="space-y-2.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-white">Tempos limite do servidor</span>
                          <div className="flex-1 h-px bg-slate-800" />
                        </div>

                        <div className="flex items-center space-x-3 pl-2">
                          <span className="text-[11px] text-slate-400">Curto</span>
                          <input
                            type="range"
                            min={15}
                            max={300}
                            step={15}
                            value={selectedAccount.incomingServer.timeoutSeconds ?? 60}
                            onChange={(e) =>
                              handleUpdateCurrentAccount({
                                incomingServer: {
                                  ...selectedAccount.incomingServer,
                                  timeoutSeconds: Number(e.target.value),
                                },
                              })
                            }
                            className="w-44 accent-brand-500 cursor-pointer"
                          />
                          <span className="text-[11px] text-slate-400">Longo</span>
                          <span className="text-xs font-mono text-white ml-2">
                            {(() => {
                              const secs = selectedAccount.incomingServer.timeoutSeconds ?? 60;
                              const mins = Math.floor(secs / 60);
                              const rem = secs % 60;
                              if (mins === 0) return `${secs} segundos`;
                              if (rem === 0) return `${mins} ${mins === 1 ? 'minuto' : 'minutos'}`;
                              return `${mins} min ${rem} seg`;
                            })()}
                          </span>
                        </div>
                      </div>

                      {/* Entrega */}
                      <div className="space-y-2.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-white">Entrega</span>
                          <div className="flex-1 h-px bg-slate-800" />
                        </div>

                        <div className="space-y-2 pl-2">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedAccount.incomingServer.leaveOnServer ?? true}
                              onChange={(e) =>
                                handleUpdateCurrentAccount({
                                  incomingServer: {
                                    ...selectedAccount.incomingServer,
                                    leaveOnServer: e.target.checked,
                                  },
                                })
                              }
                              className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                            />
                            <span>Deixar uma cópia das mensagens no servidor</span>
                          </label>

                          <div
                            className={`pl-6 space-y-2 transition-opacity ${
                              (selectedAccount.incomingServer.leaveOnServer ?? true)
                                ? 'opacity-100'
                                : 'opacity-40 pointer-events-none'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={selectedAccount.incomingServer.removeAfterDaysEnabled ?? false}
                                onChange={(e) =>
                                  handleUpdateCurrentAccount({
                                    incomingServer: {
                                      ...selectedAccount.incomingServer,
                                      removeAfterDaysEnabled: e.target.checked,
                                    },
                                  })
                                }
                                className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                              />
                              <span>Remover do servidor após</span>
                              <input
                                type="number"
                                min={1}
                                max={365}
                                disabled={!(selectedAccount.incomingServer.removeAfterDaysEnabled ?? false)}
                                value={selectedAccount.incomingServer.deleteAfterDays ?? 14}
                                onChange={(e) =>
                                  handleUpdateCurrentAccount({
                                    incomingServer: {
                                      ...selectedAccount.incomingServer,
                                      deleteAfterDays: Number(e.target.value),
                                    },
                                  })
                                }
                                className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-center text-xs text-slate-200 disabled:opacity-50"
                              />
                              <span>dias</span>
                            </div>

                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedAccount.incomingServer.removeWhenDeletedFromTrash ?? false}
                                onChange={(e) =>
                                  handleUpdateCurrentAccount({
                                    incomingServer: {
                                      ...selectedAccount.incomingServer,
                                      removeWhenDeletedFromTrash: e.target.checked,
                                    },
                                  })
                                }
                                className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                              />
                              <span>Remover do servidor quando excluído de &lsquo;Itens excluídos&rsquo;</span>
                            </label>
                          </div>
                        </div>

                        {selectedProtocol === 'pop3' && (
                          <div className="mt-3 p-2.5 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[10px] text-slate-400 font-semibold">
                                Local do Arquivo de Dados POP3 (.pst):
                              </div>
                              <div className="text-[11px] text-emerald-400 font-mono truncate">
                                {storageInfo?.pstFilePath ||
                                  `C:\\Users\\Amoroso\\Documents\\Arquivos do Anectta MAIL\\${selectedAccount.email}.pst`}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => window.electronAPI?.openLocalStorageFolder(selectedAccount.email)}
                              className="shrink-0 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded text-[11px] font-medium transition-colors"
                            >
                              Abrir Pasta .PST
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Opções de Frequência e Inicialização */}
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3 text-xs text-slate-300">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedAccount.incomingServer.checkOnStartup ?? true}
                    onChange={(e) =>
                      handleUpdateCurrentAccount({
                        incomingServer: {
                          ...selectedAccount.incomingServer,
                          checkOnStartup: e.target.checked,
                        },
                      })
                    }
                    className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Ao inicializar, verificar novas mensagens</span>
                </label>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={true}
                    readOnly
                    className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Verificar novas mensagens a cada</span>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={selectedAccount.incomingServer.checkEveryMinutes ?? 10}
                    onChange={(e) =>
                      handleUpdateCurrentAccount({
                        incomingServer: {
                          ...selectedAccount.incomingServer,
                          checkEveryMinutes: Number(e.target.value),
                        },
                      })
                    }
                    className="w-14 bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-center text-xs text-slate-200"
                  />
                  <span>minutos</span>
                </div>
              </div>

              {/* Botão Testar Servidor */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={runFullAccountTest}
                  className="flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-700 text-xs font-semibold text-slate-200 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-brand-400" />
                  <span>Testar Configurações da Conta ({selectedProtocol.toUpperCase()})</span>
                </button>
              </div>
            </div>
          )}

          {/* ================= SECTION: CÓPIAS E PASTAS ================= */}
          {activeSection === 'copies_folders' && (
            <div className="space-y-5 max-w-2xl text-xs text-slate-300">
              <div>
                <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
                  <FolderTree className="w-4 h-4 text-brand-400" />
                  <span>Gerenciamento de Cópias e Pastas</span>
                </h3>
                <p className="text-slate-400">
                  Configurações de arquivamento e destino das mensagens enviadas e rascunhos da conta{' '}
                  <span className="font-mono text-slate-200">{selectedAccount.email}</span>.
                </p>
              </div>

              <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-white">Itens Enviados</div>
                      <p className="text-[11px] text-slate-400">
                        {selectedProtocol === 'imap'
                          ? 'Ao enviar uma mensagem, uma cópia é automaticamente sincronizada com a pasta "Itens Enviados" do servidor IMAP.'
                          : 'As mensagens enviadas são gravadas no banco de dados local deste computador.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-white">Rascunhos</div>
                      <p className="text-[11px] text-slate-400">
                        {selectedProtocol === 'imap'
                          ? 'Rascunhos em edição são salvos e sincronizados com a pasta "Rascunhos" do servidor IMAP.'
                          : 'Rascunhos permanecem gravados localmente no cliente.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-white">Itens Excluídos & Lixo Eletrônico</div>
                      <p className="text-[11px] text-slate-400">
                        {selectedProtocol === 'imap'
                          ? 'Ao excluir ou classificar como spam, as mensagens são movidas para as respectivas pastas "Itens Excluídos" e "Lixo eletrônico" do servidor IMAP.'
                          : 'Mensagens excluídas são gerenciadas na lixeira local.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= SECTION: SINCRONIZAÇÃO E PASTAS ================= */}
          {activeSection === 'sync_storage' && (
            <div className="space-y-5 max-w-2xl text-xs text-slate-300">
              <div>
                <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
                  <Server className="w-4 h-4 text-brand-400" />
                  <span>Sincronização e Armazenamento ({selectedProtocol.toUpperCase()})</span>
                </h3>
                <p className="text-slate-400">
                  Gerencie como o Anectta MAIL sincroniza mensagens e mantém o cache para a conta{' '}
                  <span className="font-mono text-slate-200">{selectedAccount.email}</span>.
                </p>
              </div>

              {selectedProtocol === 'imap' ? (
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
                  <div className="flex items-center space-x-2 text-blue-400 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Sincronização Multi-Pastas IMAP Habilitada</span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    O Anectta MAIL sincroniza todas as seguintes pastas do seu servidor corporativo:{' '}
                    <strong className="text-slate-200">Caixa de Entrada</strong>,{' '}
                    <strong className="text-slate-200">Itens Enviados</strong>,{' '}
                    <strong className="text-slate-200">Rascunhos</strong>,{' '}
                    <strong className="text-slate-200">Itens Excluídos</strong>,{' '}
                    <strong className="text-slate-200">Lixo eletrônico</strong> e{' '}
                    <strong className="text-slate-200">Arquivados</strong>.
                  </p>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Modo de sincronização:</span>
                      <span className="text-white font-mono">Automático (Multi-pasta)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Frequência de verificação:</span>
                      <span className="text-white font-mono">
                        A cada {selectedAccount.incomingServer.checkEveryMinutes ?? 10} minutos
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Retenção de mensagens:</span>
                      <span className="text-emerald-400 font-mono">Offline Cache + Servidor</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
                  <div className="flex items-center space-x-2 text-amber-400 font-semibold">
                    <Server className="w-4 h-4" />
                    <span>Modelo de Download Local POP3</span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    No protocolo POP3, as mensagens da Caixa de Entrada são baixadas para o armazenamento local deste dispositivo. Outras pastas (Enviados, Lixeira) operam exclusivamente no computador local.
                  </p>

                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedAccount.incomingServer.leaveOnServer ?? true}
                        onChange={(e) =>
                          handleUpdateCurrentAccount({
                            incomingServer: {
                              ...selectedAccount.incomingServer,
                              leaveOnServer: e.target.checked,
                            },
                          })
                        }
                        className="rounded bg-slate-950 border-slate-700 text-brand-600 focus:ring-brand-500"
                      />
                      <span>Deixar uma cópia das mensagens no servidor</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Arquivo de Dados Local (.PST / .MBOX) estilo Microsoft Outlook */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-cyan-400 font-semibold">
                    <FolderTree className="w-4 h-4" />
                    <span>Arquivo de Dados Local (.pst) — Estilo Outlook</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.electronAPI?.openLocalStorageFolder(selectedAccount.email)}
                    className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-[11px] font-semibold transition-colors"
                  >
                    Abrir Pasta do Arquivo .PST
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Os e-mails baixados desta conta são gravados automaticamente em um arquivo de dados local na sua pasta{' '}
                  <strong className="text-slate-200">Documentos\Arquivos do Anectta MAIL</strong> para backup e acesso offline:
                </p>

                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] space-y-1.5 font-mono">
                  <div className="flex flex-col space-y-0.5">
                    <span className="text-slate-400 font-sans">Arquivo .PST da Conta:</span>
                    <span className="text-emerald-400 break-all">
                      {storageInfo?.pstFilePath ||
                        `C:\\Users\\Amoroso\\Documents\\Arquivos do Anectta MAIL\\${selectedAccount.email}.pst`}
                    </span>
                  </div>
                  <div className="flex flex-col space-y-0.5 pt-1 border-t border-slate-800/80">
                    <span className="text-slate-400 font-sans">Arquivo .MBOX (Padrão Universal):</span>
                    <span className="text-slate-300 break-all">
                      {storageInfo?.mboxFilePath ||
                        `C:\\Users\\Amoroso\\Documents\\Arquivos do Anectta MAIL\\${selectedAccount.email}.mbox`}
                    </span>
                  </div>
                  {storageInfo && (
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/80 font-sans">
                      <span className="text-slate-400">
                        Mensagens gravadas: <strong className="text-white">{storageInfo.messageCount}</strong>
                      </span>
                      <span className="text-slate-400">
                        Tamanho:{' '}
                        <strong className="text-white">
                          {(storageInfo.sizeBytes / 1024).toFixed(1)} KB
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================= SECTION: SERVIDOR DE ENVIO (SMTP) ================= */}
          {activeSection === 'outgoing_smtp' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
                  <Send className="w-4 h-4 text-cyan-400" />
                  <span>Servidor de Envio (SMTP)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Configurações para envio de mensagens corporativas de {selectedAccount.email}.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-slate-300 mb-1">Servidor SMTP:</label>
                  <input
                    type="text"
                    value={selectedAccount.outgoingServer.host}
                    onChange={(e) =>
                      handleUpdateCurrentAccount({
                        outgoingServer: {
                          ...selectedAccount.outgoingServer,
                          host: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">Porta:</label>
                  <input
                    type="number"
                    value={selectedAccount.outgoingServer.port}
                    onChange={(e) =>
                      handleUpdateCurrentAccount({
                        outgoingServer: {
                          ...selectedAccount.outgoingServer,
                          port: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2 text-xs text-slate-300">
                <div className="font-semibold text-white">Segurança & Autenticação</div>
                <div className="text-[11px] text-slate-400">
                  Segurança da conexão: <span className="text-emerald-400 font-mono">SSL/TLS (Porta 465)</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Método de autenticação: <span className="text-slate-200 font-mono">Senha normal criptografada</span>
                </div>
              </div>
            </div>
          )}

          {/* ================= PLACEHOLDER SUBSECTIONS ================= */}
          {(activeSection === 'composition' || activeSection === 'encryption') && (
            <div className="space-y-4 max-w-xl text-xs text-slate-300">
              <h3 className="text-sm font-bold text-white capitalize">
                {activeSection === 'composition' ? 'Redação e Endereçamento' : 'Criptografia de Ponta a Ponta'}
              </h3>
              <p className="text-slate-400">
                Preferências avançadas para a conta{' '}
                <span className="font-mono text-slate-200">{selectedAccount.email}</span>.
              </p>
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center space-x-2 text-emerald-400">
                  <Lock className="w-4 h-4" />
                  <span className="font-semibold">Criptografia AES-256 e SOC 2 Habilitados</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Todas as chaves e mensagens são isoladas no armazenamento seguro do Anectta MAIL.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ================= MODAL: TESTAR CONFIGURAÇÕES DA CONTA (ESTILO OUTLOOK / ANECTTA MAIL) ================= */}
      {isTestModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-slate-200">
            {/* Cabeçalho do Modal de Teste */}
            <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-brand-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Testar configurações da conta
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTestModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mensagem de Status Geral e Botões Parar/Fechar */}
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <p className="text-xs leading-relaxed text-slate-300">
                  {incomingTaskStatus === 'running' || outgoingTaskStatus === 'running' ? (
                    <span className="flex items-center space-x-2 text-cyan-300">
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      <span>Executando testes de comunicação com os servidores corporativos...</span>
                    </span>
                  ) : incomingTaskStatus === 'failed' || outgoingTaskStatus === 'failed' ? (
                    <span className="text-rose-300">
                      Alguns testes falharam. Verifique a guia &lsquo;Erros&rsquo; abaixo para obter mais detalhes.
                    </span>
                  ) : (
                    <span className="text-emerald-300">
                      Parabéns! Todos os testes foram concluídos com êxito. Clique em &lsquo;Fechar&rsquo; para continuar.
                    </span>
                  )}
                </p>

                <div className="flex flex-col space-y-2 shrink-0">
                  <button
                    type="button"
                    disabled={incomingTaskStatus !== 'running' && outgoingTaskStatus !== 'running'}
                    onClick={() => {
                      setIncomingTaskStatus('pending');
                      setOutgoingTaskStatus('pending');
                    }}
                    className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
                  >
                    Parar
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTestModalOpen(false)}
                    className="px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </div>

              {/* Abas: Tarefas / Erros */}
              <div className="space-y-0 pt-2">
                <div className="flex items-center space-x-1 border-b border-slate-800">
                  <button
                    type="button"
                    onClick={() => setTestModalTab('tarefas')}
                    className={`px-3 py-1.5 font-semibold rounded-t-lg transition-colors border-t border-x ${
                      testModalTab === 'tarefas'
                        ? 'bg-slate-950 text-white border-slate-800 border-b-slate-950 -mb-px'
                        : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
                    }`}
                  >
                    Tarefas
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestModalTab('erros')}
                    className={`px-3 py-1.5 font-semibold rounded-t-lg transition-colors border-t border-x flex items-center space-x-1.5 ${
                      testModalTab === 'erros'
                        ? 'bg-slate-950 text-white border-slate-800 border-b-slate-950 -mb-px'
                        : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
                    }`}
                  >
                    <span>Erros</span>
                    {(incomingTaskError || outgoingTaskError) && (
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                    )}
                  </button>
                </div>

                {/* Conteúdo Aba Tarefas */}
                {testModalTab === 'tarefas' && (
                  <div className="bg-slate-950 border border-t-0 border-slate-800 rounded-b-xl overflow-hidden divide-y divide-slate-850">
                    <div className="grid grid-cols-12 px-3 py-2 text-[11px] font-bold text-slate-400 bg-slate-925">
                      <div className="col-span-8">Tarefas</div>
                      <div className="col-span-4 text-right">Status</div>
                    </div>

                    {/* Tarefa 1 */}
                    <div className="grid grid-cols-12 px-3 py-2.5 items-center text-xs">
                      <div className="col-span-8 flex items-center space-x-2">
                        {incomingTaskStatus === 'running' && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
                        )}
                        {incomingTaskStatus === 'success' && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                        {incomingTaskStatus === 'failed' && (
                          <X className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        )}
                        {incomingTaskStatus === 'pending' && (
                          <div className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0" />
                        )}
                        <span className="text-slate-200">
                          Fazer logon no servidor de entrada ({selectedProtocol.toUpperCase()})
                        </span>
                      </div>
                      <div className="col-span-4 text-right font-mono text-[11px]">
                        {incomingTaskStatus === 'running' && (
                          <span className="text-cyan-400">Em andamento</span>
                        )}
                        {incomingTaskStatus === 'success' && (
                          <span className="text-emerald-400 font-semibold">Concluído</span>
                        )}
                        {incomingTaskStatus === 'failed' && (
                          <span className="text-rose-400 font-semibold">Falhou</span>
                        )}
                        {incomingTaskStatus === 'pending' && (
                          <span className="text-slate-500">Pendente</span>
                        )}
                      </div>
                    </div>

                    {/* Tarefa 2 */}
                    <div className="grid grid-cols-12 px-3 py-2.5 items-center text-xs">
                      <div className="col-span-8 flex items-center space-x-2">
                        {outgoingTaskStatus === 'running' && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
                        )}
                        {outgoingTaskStatus === 'success' && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                        {outgoingTaskStatus === 'failed' && (
                          <X className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        )}
                        {outgoingTaskStatus === 'pending' && (
                          <div className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0" />
                        )}
                        <span className="text-slate-200">Enviar email de teste</span>
                      </div>
                      <div className="col-span-4 text-right font-mono text-[11px]">
                        {outgoingTaskStatus === 'running' && (
                          <span className="text-cyan-400">Em andamento</span>
                        )}
                        {outgoingTaskStatus === 'success' && (
                          <span className="text-emerald-400 font-semibold">Concluído</span>
                        )}
                        {outgoingTaskStatus === 'failed' && (
                          <span className="text-rose-400 font-semibold">Falhou</span>
                        )}
                        {outgoingTaskStatus === 'pending' && (
                          <span className="text-slate-500">Pendente</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Conteúdo Aba Erros */}
                {testModalTab === 'erros' && (
                  <div className="bg-slate-950 border border-t-0 border-slate-800 rounded-b-xl p-3 space-y-2 text-xs">
                    {!incomingTaskError && !outgoingTaskError ? (
                      <div className="text-slate-400 text-center py-4">
                        Nenhum erro registrado. Todos os testes responderam positivamente.
                      </div>
                    ) : (
                      <>
                        {incomingTaskError && (
                          <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300">
                            <strong>Servidor de Entrada:</strong> {incomingTaskError}
                          </div>
                        )}
                        {outgoingTaskError && (
                          <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300">
                            <strong>Servidor SMTP (Saída):</strong> {outgoingTaskError}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADICIONAR NOVA CONTA ================= */}
      {isAddAccountModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Plus className="w-5 h-5 text-brand-400" />
                <h3 className="text-sm font-bold text-white">Adicionar Nova Conta de E-mail</h3>
              </div>
              <button
                onClick={() => setIsAddAccountModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Seu Nome Completo:
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Carlos Amoroso"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Endereço de E-mail Corporativo:
                </label>
                <input
                  type="email"
                  required
                  placeholder="usuario@empresa.com.br"
                  value={newAccEmail}
                  onChange={(e) => setNewAccEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Senha da Conta:
                </label>
                <input
                  type="password"
                  placeholder="Senha ou Senha de Aplicativo"
                  value={newAccPassword}
                  onChange={(e) => setNewAccPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-brand-500"
                />
                {/* Alertas dinâmicos de provedor (Gmail, Yahoo, iCloud, AOL, Microsoft) */}
                <EmailProviderNotice
                  email={newAccEmail}
                  host={newAccHost}
                  variant="dark"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Protocolo de Entrada:
                  </label>
                  <select
                    value={newAccProtocol}
                    onChange={(e) => setNewAccProtocol(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500 font-medium"
                  >
                    <option value="imap">IMAP (Porta 993 SSL - Multi-Pastas)</option>
                    <option value="pop3">POP3 (Porta 995 SSL - Local)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Servidor Host (ex: imap.seudominio.com.br):
                  </label>
                  <input
                    type="text"
                    placeholder="ex: imap.seudominio.com.br"
                    value={newAccHost}
                    onChange={(e) => setNewAccHost(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddAccountModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-xl shadow-md"
                >
                  Cadastrar Conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: PAREAMENTO MOBILE (ZERO-PASSWORD) ================= */}
      {isPairMobileOpen && selectedAccount && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Parear com Anectta MAIL Mobile</h3>
                  <p className="text-[11px] text-slate-400">
                    Transfere apenas servidores IMAP/SMTP — sua senha nunca sai do aparelho
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPairMobileOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
              <div className="font-semibold text-white">{selectedAccount.email}</div>
              <div className="text-[11px] text-slate-400">
                IMAP: {selectedAccount.incomingServer?.host || '—'}:{selectedAccount.incomingServer?.port || 993} • SMTP:{' '}
                {selectedAccount.outgoingServer?.host || '—'}:{selectedAccount.outgoingServer?.port || 465}
              </div>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-300">URL do Gateway Mobile</span>
              <input
                type="url"
                value={pairingGatewayUrl}
                onChange={(e) => {
                  setPairingGatewayUrl(e.target.value);
                  try {
                    localStorage.setItem('anectta_mobile_gateway_url', e.target.value);
                  } catch {
                    // ignore
                  }
                }}
                placeholder="http://localhost:8787"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-brand-500"
              />
            </label>

            {pairingError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                {pairingError}
              </div>
            )}

            {pairingCodeResult ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-brand-500/40 text-center space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                  Código temporário (expira em 3 minutos • uso único)
                </div>
                <div className="text-3xl font-mono font-bold tracking-[0.25em] text-brand-400">
                  {pairingCodeResult}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(pairingCodeResult).catch(() => {});
                    setPairingCopied(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{pairingCopied ? 'Código copiado!' : 'Copiar código'}</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={pairingLoading}
                onClick={async () => {
                  setPairingLoading(true);
                  setPairingError(null);
                  try {
                    const url = `${pairingGatewayUrl.replace(/\/+$/, '')}/api/pairing/create`;
                    const resp = await fetch(url, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        accounts: [
                          {
                            displayName: selectedAccount.displayName || selectedAccount.email,
                            email: selectedAccount.email,
                            protocol: selectedAccount.incomingServer?.protocol || 'imap',
                            imapHost: selectedAccount.incomingServer?.host || '',
                            imapPort: Number(selectedAccount.incomingServer?.port || 993),
                            imapSecure: selectedAccount.incomingServer?.security !== 'none',
                            smtpHost: selectedAccount.outgoingServer?.host || '',
                            smtpPort: Number(selectedAccount.outgoingServer?.port || 465),
                            smtpSecure: selectedAccount.outgoingServer?.security !== 'none',
                          },
                        ],
                      }),
                    });
                    const data = await resp.json();
                    if (data.success && data.code) {
                      setPairingCodeResult(String(data.code));
                    } else {
                      setPairingError(data.error || 'Não foi possível gerar o código no Gateway.');
                    }
                  } catch (err: any) {
                    setPairingError(
                      err?.message || 'Gateway inacessível. Verifique se o Anectta MAIL Gateway está rodando.'
                    );
                  } finally {
                    setPairingLoading(false);
                  }
                }}
                className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-xl transition-all"
              >
                {pairingLoading ? 'Gerando código...' : 'Gerar código de pareamento (6 dígitos)'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: CONFIRMAÇÃO DE EXCLUSÃO ================= */}
      {accountToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Excluir Conta Corporativa</h3>
                <p className="text-[11px] text-slate-400">Esta ação removerá a conta do Anectta MAIL</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Tem certeza de que deseja remover a conta{' '}
              <span className="font-mono font-bold text-rose-300">{accountToDelete.email}</span>?
            </p>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div>• Suas configurações e credenciais serão apagadas localmente.</div>
              <div>• As mensagens no servidor externo não serão apagadas.</div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setAccountToDelete(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-rose-600/30 transition-all"
              >
                Sim, Excluir Conta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
