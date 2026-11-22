import React, { useState, useEffect, useRef } from 'react';
import {
  Inbox,
  FileText,
  Trash2,
  AlertOctagon,
  FolderSearch,
  Rss,
  Archive,
  Clock,
  ChevronDown,
  ChevronRight,
  SendHorizontal,
  CheckCircle2,
  Folder,
  FolderPlus,
  FolderInput,
  Copy,
  Edit3,
  MailOpen,
  Star,
  ArrowUpAZ,
  ArrowUp,
  ArrowDown,
  Info,
  Plus,
  Check,
  X,
  Calendar,
  Users,
  Settings,
  Layers,
  BookOpen,
  Tag,
  CheckSquare,
  MessageCircle,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Eye,
  EyeOff,
  GripVertical,
  BarChart3,
} from 'lucide-react';
import { CustomFolder, EmailItem, FavoriteFolder, MailFolder, UserAccount } from '@/types/email';
import { AccountSettings, AppsSettings } from '@/types/settings';
import logoImg from '../assets/logo.png';

const QUICK_NAV_COLLAPSED_KEY = 'anectta_sidebar_quicknav_collapsed';

interface QuickNavItem {
  key: string;
  label: string;
  icon: React.ElementType;
  iconClass: string;
  active: boolean;
  onClick: () => void;
  title?: string;
  hoverClass?: string;
}

interface SidebarProps {
  currentFolder: MailFolder;
  onSelectFolder: (folder: MailFolder, accountId?: string) => void;
  onCompose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenSetupWizard?: () => void;
  unreadCounts: Record<string, number>;
  folderCounts?: Record<string, number>;
  activeAccount: UserAccount;
  accountProtocol?: 'imap' | 'pop3';
  accounts?: AccountSettings[];
  activeAccountId?: string;
  onSelectAccount?: (id: string) => void;
  emails?: EmailItem[];
  cloudQuota?: { usedBytes: number; limitBytes: number };
  width?: number;
  customFolders?: CustomFolder[];
  favoriteFolders?: FavoriteFolder[];
  onCreateFolder?: (name: string, accountId: string, parentFolder?: MailFolder) => void;
  onRenameFolder?: (folderId: string, newName: string) => void;
  onCopyFolder?: (folderId: string) => void;
  onMoveFolder?: (folderId: string, newParentFolder?: MailFolder) => void;
  onDeleteFolder?: (folderId: string) => void;
  onMarkAllAsRead?: (accountId: string, folderId: MailFolder) => void;
  onEmptyFolder?: (accountId: string, folderId: MailFolder) => void;
  onSortSubfolders?: (accountId: string, parentFolder?: MailFolder) => void;
  onReorderFolder?: (folderId: string, direction: 'up' | 'down') => void;
  onToggleFavoriteFolder?: (accountId: string, folderId: MailFolder, label: string) => void;
  folderCreateRequest?: number;
  activeModule?: 'mail' | 'calendar' | 'contacts' | 'tasks' | 'stats' | 'webapp';
  onSelectModule?: (mod: 'mail' | 'calendar' | 'contacts' | 'tasks' | 'stats' | 'webapp') => void;
  onOpenSettings?: () => void;
  onOpenPrivacyCenter?: () => void;
  appsSettings?: AppsSettings;
  activeWebAppId?: string | null;
  onSelectWebApp?: (app: { id: string; name: string; url: string }) => void;
  isWhatsAppOpen?: boolean;
  onToggleWhatsApp?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  showUnifiedInbox?: boolean;
  onToggleUnifiedInbox?: (show: boolean) => void;
  onReorderAccounts?: (reorderedAccounts: AccountSettings[]) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentFolder,
  onSelectFolder,
  activeAccount,
  accountProtocol = 'imap',
  accounts = [],
  activeAccountId,
  onSelectAccount,
  emails = [],
  cloudQuota,
  width,
  customFolders = [],
  favoriteFolders = [],
  onCreateFolder,
  onRenameFolder,
  onCopyFolder,
  onMoveFolder,
  onDeleteFolder,
  onMarkAllAsRead,
  onEmptyFolder,
  onSortSubfolders,
  onReorderFolder,
  onToggleFavoriteFolder,
  folderCreateRequest = 0,
  activeModule = 'mail',
  onSelectModule,
  onOpenSettings,
  onOpenPrivacyCenter,
  appsSettings,
  activeWebAppId,
  onSelectWebApp,
  isWhatsAppOpen = false,
  onToggleWhatsApp,
  isCollapsed = false,
  onToggleCollapse,
  showUnifiedInbox = true,
  onToggleUnifiedInbox,
  onReorderAccounts,
}) => {
  // Todas as contas começam expandidas individualmente uma embaixo da outra
  // Bloco "Aplicativos" (E-mails, Calendário, Contatos...) recolhível; estado salvo entre sessões
  const [isQuickNavCollapsed, setIsQuickNavCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(QUICK_NAV_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const toggleQuickNav = () => {
    setIsQuickNavCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(QUICK_NAV_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  };
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});
  const [expandedCustomFolders, setExpandedCustomFolders] = useState<Record<string, boolean>>({});
  const [creatingForAccId, setCreatingForAccId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState<MailFolder | undefined>(undefined);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveModalFolder, setMoveModalFolder] = useState<CustomFolder | null>(null);
  const [propertiesData, setPropertiesData] = useState<{
    name: string;
    accountEmail: string;
    isCustom: boolean;
    total: number;
    unread: number;
    createdAt?: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    accountId: string;
    folderId: MailFolder;
    folderName: string;
    isCustom: boolean;
    parentFolder?: MailFolder;
  } | null>(null);

  const isAccExpanded = (accId: string) => {
    return expandedAccounts[accId] !== undefined ? expandedAccounts[accId] : true;
  };

  const toggleAccountExpanded = (accId: string) => {
    setExpandedAccounts((prev) => ({
      ...prev,
      [accId]: !isAccExpanded(accId),
    }));
  };

  const startCreateFolder = (accId: string, parentFolder?: MailFolder) => {
    setExpandedAccounts((prev) => ({ ...prev, [accId]: true }));
    if (parentFolder) {
      setExpandedCustomFolders((prev) => ({ ...prev, [`${accId}:${parentFolder}`]: true }));
    }
    setCreatingForAccId(accId);
    setNewFolderParent(parentFolder);
    setNewFolderName('');
  };

  const confirmCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed && creatingForAccId) {
      onCreateFolder?.(trimmed, creatingForAccId, newFolderParent);
    }
    setCreatingForAccId(null);
    setNewFolderName('');
    setNewFolderParent(undefined);
  };

  const cancelCreateFolder = () => {
    setCreatingForAccId(null);
    setNewFolderName('');
    setNewFolderParent(undefined);
  };

  useEffect(() => {
    if (folderCreateRequest > 0) {
      const targetId = activeAccountId || accounts[0]?.id || 'acc-default';
      startCreateFolder(targetId);
    }
  }, [folderCreateRequest]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const openFolderContextMenu = (
    e: React.MouseEvent,
    accountId: string,
    folderId: MailFolder,
    folderName: string,
    isCustom: boolean,
    parentFolder?: MailFolder
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 240;
    const menuHeight = 410;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8);
    setContextMenu({
      x: Math.max(8, x),
      y: Math.max(8, y),
      accountId,
      folderId,
      folderName,
      isCustom,
      parentFolder,
    });
  };

  const isFolderNodeExpanded = (accId: string, folderId: string) => {
    const key = `${accId}:${folderId}`;
    return expandedCustomFolders[key] !== undefined ? expandedCustomFolders[key] : true;
  };

  const toggleFolderNodeExpanded = (accId: string, folderId: string) => {
    const key = `${accId}:${folderId}`;
    setExpandedCustomFolders((prev) => ({ ...prev, [key]: !isFolderNodeExpanded(accId, folderId) }));
  };

  const hasSubfoldersForNode = (accId: string, folderId: string) =>
    customFolders.some((cf) => cf.accountId === accId && cf.parentFolder === folderId);

  // Lista de contas a exibir individualmente (se accounts estiver vazio, monta a partir de activeAccount)
  const accountList: AccountSettings[] =
    accounts.length > 0
      ? accounts
      : [
          {
            id: activeAccountId || 'acc-default',
            accountName: activeAccount.email,
            displayName: activeAccount.name,
            email: activeAccount.email,
            role: activeAccount.role,
            color: '#2563eb',
            isDefault: true,
            serverType: 'imap_smtp',
            signature: '',
            incomingServer: {
              protocol: accountProtocol,
              host: activeAccount.email?.includes('@') ? `mail.${activeAccount.email.split('@')[1]}` : '',
              port: accountProtocol === 'pop3' ? 995 : 993,
              security: 'ssl',
              username: activeAccount.email,
            },
            outgoingServer: {
              host: activeAccount.email?.includes('@') ? `smtp.${activeAccount.email.split('@')[1]}` : '',
              port: 465,
              security: 'ssl',
              username: activeAccount.email,
            },
          },
        ];

  // Calcula contadores individuais por conta + pasta com isolamento estrito
  const getAccountCounts = (acc: AccountSettings) => {
    const unread: Record<string, number> = {
      inbox: 0,
      favorites: 0,
      tasks: 0,
      reading_list: 0,
      important: 0,
      sent: 0,
      drafts: 0,
      archive: 0,
      snooze: 0,
      trash: 0,
      junk: 0,
      outbox: 0,
      search_folders: 0,
    };
    const total: Record<string, number> = {
      inbox: 0,
      favorites: 0,
      tasks: 0,
      reading_list: 0,
      important: 0,
      sent: 0,
      drafts: 0,
      archive: 0,
      snooze: 0,
      trash: 0,
      junk: 0,
      outbox: 0,
      search_folders: 0,
    };

    const accEmailLower = (acc.email || '').toLowerCase().trim();

    emails.forEach((m) => {
      let belongsToAcc = false;

      if (m.accountId) {
        if (m.accountId === acc.id) {
          const rec = (m.recipient || '').toLowerCase().trim();
          const snd = (m.senderEmail || '').toLowerCase().trim();
          const belongsToOther = accountList.some(
            (other) =>
              other.id !== acc.id &&
              other.email &&
              (rec.includes(other.email.toLowerCase().trim()) ||
                snd === other.email.toLowerCase().trim())
          );
          if (!belongsToOther || rec.includes(accEmailLower) || snd === accEmailLower) {
            belongsToAcc = true;
          }
        }
      } else if (accEmailLower) {
        const rec = (m.recipient || '').toLowerCase().trim();
        const snd = (m.senderEmail || '').toLowerCase().trim();
        belongsToAcc = rec.includes(accEmailLower) || snd === accEmailLower;
      }

      if (belongsToAcc && total[m.folder] !== undefined) {
        total[m.folder] += 1;
        if (!m.isRead) {
          unread[m.folder] += 1;
        }
      }

      if (belongsToAcc && m.folder !== 'trash' && m.folder !== 'junk') {
        if (m.isStarred) {
          total.favorites += 1;
          if (!m.isRead) unread.favorites += 1;
        }
        if (m.isTask) {
          total.tasks += 1;
          if (!m.isRead) unread.tasks += 1;
        }
        if (m.isReadingList) {
          total.reading_list += 1;
          if (!m.isRead) unread.reading_list += 1;
        }
        if (m.isImportant) {
          total.important += 1;
          if (!m.isRead) unread.important += 1;
        }
      }
    });

    return { unread, total };
  };

  const handleFolderClick = (accId: string, folder: MailFolder) => {
    if (onSelectAccount && accId !== activeAccountId) {
      onSelectAccount(accId);
    }
    onSelectFolder(folder, accId);
  };

  // Arrastar e soltar (clicar e segurar com o mouse) para reordenar as contas na barra lateral
  const [draggingAccountId, setDraggingAccountId] = useState<string | null>(null);
  const accountItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const accountDragRef = useRef<{
    accId: string;
    startY: number;
    isDragging: boolean;
    holdTimer: number | null;
  } | null>(null);
  const suppressAccountClickRef = useRef<boolean>(false);
  const accountListRef = useRef<AccountSettings[]>(accountList);
  accountListRef.current = accountList;
  const onReorderAccountsRef = useRef(onReorderAccounts);
  onReorderAccountsRef.current = onReorderAccounts;

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
          suppressAccountClickRef.current = true;
          setDraggingAccountId(state.accId);
          document.body.style.cursor = 'grabbing';
        } else {
          return;
        }
      }

      // Auto-scroll suave caso o mouse se aproxime do topo ou rodapé da área rolável
      const scrollEl = scrollContainerRef.current;
      if (scrollEl) {
        const scrollRect = scrollEl.getBoundingClientRect();
        const edgeThreshold = 40;
        if (e.clientY < scrollRect.top + edgeThreshold) {
          scrollEl.scrollTop -= 8;
        } else if (e.clientY > scrollRect.bottom - edgeThreshold) {
          scrollEl.scrollTop += 8;
        }
      }

      const currentList = accountListRef.current;
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
          accountListRef.current = nextList;
          onReorderAccountsRef.current?.(nextList);
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
          suppressAccountClickRef.current = false;
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

  const handleAccountHeaderMouseDown = (e: React.MouseEvent, accId: string) => {
    if (e.button !== 0 || accountList.length <= 1) return;
    const holdTimer = window.setTimeout(() => {
      if (accountDragRef.current && accountDragRef.current.accId === accId && !accountDragRef.current.isDragging) {
        accountDragRef.current.isDragging = true;
        suppressAccountClickRef.current = true;
        setDraggingAccountId(accId);
        document.body.style.cursor = 'grabbing';
      }
    }, 180);

    accountDragRef.current = {
      accId,
      startY: e.clientY,
      isDragging: false,
      holdTimer,
    };
  };

  if (isCollapsed) {
    const primaryAcc =
      accountList.find((a) => a.id === activeAccountId) || accountList[0];
    const primaryAccId = primaryAcc?.id || 'default';
    const { unread: primaryUnread } = primaryAcc
      ? getAccountCounts(primaryAcc)
      : { unread: {} as Record<string, number> };
    const unifiedUnread = accountList.reduce(
      (sum, acc) => sum + (getAccountCounts(acc).unread.inbox || 0),
      0
    );

    const collapsedFolders: Array<{
      id: MailFolder;
      label: string;
      icon: React.ReactNode;
      badge?: number;
    }> = [
      {
        id: 'inbox',
        label: 'Caixa de Entrada',
        icon: <Inbox className="w-4 h-4 text-sky-400" />,
        badge: primaryUnread['inbox'],
      },
      {
        id: 'favorites',
        label: 'Favoritos',
        icon: <Star className="w-4 h-4 text-amber-400" />,
      },
      {
        id: 'tasks',
        label: 'Tarefas',
        icon: <CheckSquare className="w-4 h-4 text-emerald-400" />,
      },
      {
        id: 'reading_list',
        label: 'Lista de leitura',
        icon: <BookOpen className="w-4 h-4 text-sky-400" />,
      },
      {
        id: 'important',
        label: 'Importante',
        icon: <Tag className="w-4 h-4 text-amber-300" />,
      },
      {
        id: 'sent',
        label: 'Itens Enviados',
        icon: <SendHorizontal className="w-4 h-4 text-indigo-400" />,
      },
      {
        id: 'junk',
        label: 'Lixo eletrônico',
        icon: <AlertOctagon className="w-4 h-4 text-orange-400" />,
        badge: primaryUnread['junk'],
      },
      {
        id: 'outbox',
        label: 'Caixa de Saída',
        icon: <SendHorizontal className="w-4 h-4 text-cyan-400" />,
      },
      {
        id: 'trash',
        label: 'Itens Excluídos',
        icon: <Trash2 className="w-4 h-4 text-rose-400" />,
      },
      {
        id: 'drafts',
        label: 'Rascunhos',
        icon: <FileText className="w-4 h-4 text-violet-400" />,
      },
      {
        id: 'archive',
        label: 'Arquivados',
        icon: <Archive className="w-4 h-4 text-teal-400" />,
      },
      {
        id: 'snooze',
        label: 'Snoozed (Adiados)',
        icon: <Clock className="w-4 h-4 text-amber-400" />,
      },
      {
        id: 'search_folders',
        label: 'Pastas de Pesquisa',
        icon: <FolderSearch className="w-4 h-4 text-blue-400" />,
      },
    ];

    return (
      <aside
        style={{ width: '56px', backgroundColor: '#162231' }}
        className="sidebar-navy border-r border-slate-800/80 flex flex-col justify-between shrink-0 h-full text-xs text-slate-200"
      >
        {/* Topo recolhido: Logo + Botão Expandir + Configurações */}
        <div className="shrink-0 py-2.5 px-1.5 flex flex-col items-center gap-1.5 border-b border-white/10">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expandir barra lateral"
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <img
              src={logoImg}
              alt="Anectta Mail"
              className="w-7 h-7 object-contain drop-shadow-[0_0_8px_rgba(0,168,255,0.45)]"
            />
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expandir barra lateral"
            aria-label="Expandir barra lateral"
            className="w-9 h-8 rounded-lg flex items-center justify-center text-sky-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
          {onOpenPrivacyCenter && (
            <button
              type="button"
              onClick={onOpenPrivacyCenter}
              title="Escudo de Privacidade Anectta"
              aria-label="Escudo de Privacidade Anectta"
              className="w-9 h-8 rounded-lg flex items-center justify-center text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15 transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
            </button>
          )}
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              title="Configurações"
              aria-label="Configurações"
              className="w-9 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Lista de Pastas apenas com ícones */}
        <div className="flex-1 py-2 px-1.5 space-y-1 overflow-y-auto custom-scroll flex flex-col items-center">
          {accountList.length > 0 && showUnifiedInbox && (
            <button
              type="button"
              onClick={() => {
                onSelectAccount?.('__unified__');
                onSelectFolder('inbox', '__unified__');
              }}
              title="Caixa Unificada"
              className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                activeAccountId === '__unified__'
                  ? 'bg-sky-500/20 border border-sky-400/50 text-white'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4 text-sky-400" />
              {unifiedUnread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-sky-500 text-[9px] font-bold text-white flex items-center justify-center">
                  {unifiedUnread > 99 ? '99+' : unifiedUnread}
                </span>
              )}
            </button>
          )}

          {collapsedFolders.map((item) => {
            const active =
              activeAccountId !== '__unified__' && currentFolder === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleFolderClick(primaryAccId, item.id)}
                title={item.label}
                className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  active
                    ? 'bg-slate-800 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {item.icon}
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-brand-600 text-[9px] font-bold text-white flex items-center justify-center">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Módulos inferiores apenas com ícones */}
        <div className="py-2 px-1.5 border-t border-white/10 space-y-1 flex flex-col items-center shrink-0">
          {onSelectModule && (
            <>
              <button
                type="button"
                onClick={() => onSelectModule('mail')}
                title="E-mails"
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  activeModule === 'mail'
                    ? 'bg-white/10 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Inbox className="w-4 h-4 text-sky-400" />
              </button>
              {(appsSettings?.enableCalendarApp ?? true) && (
                <button
                  type="button"
                  onClick={() => onSelectModule('calendar')}
                  title="Calendário"
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    activeModule === 'calendar'
                      ? 'bg-white/10 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Calendar className="w-4 h-4 text-sky-400" />
                </button>
              )}
              {(appsSettings?.enableContactsApp ?? true) && (
                <button
                  type="button"
                  onClick={() => onSelectModule('contacts')}
                  title="Contatos"
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    activeModule === 'contacts'
                      ? 'bg-white/10 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Users className="w-4 h-4 text-sky-400" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onSelectModule('tasks')}
                title="Tarefas"
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  activeModule === 'tasks'
                    ? 'bg-white/10 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <CheckSquare className="w-4 h-4 text-emerald-400" />
              </button>
              <button
                type="button"
                onClick={() => onSelectModule('stats')}
                title="Estatísticas & Produtividade"
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  activeModule === 'stats'
                    ? 'bg-white/10 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <BarChart3 className="w-4 h-4 text-violet-400" />
              </button>
              {appsSettings?.enableWhatsAppApp && (
                <button
                  type="button"
                  onClick={() => onToggleWhatsApp?.()}
                  title="WhatsApp Web"
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    isWhatsAppOpen
                      ? 'bg-white/10 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <MessageCircle className="w-4 h-4 text-emerald-400" />
                </button>
              )}
              {(appsSettings?.customApps || [])
                .filter((app) => app.enabled)
                .map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() =>
                      onSelectWebApp?.({
                        id: app.id,
                        name: app.name,
                        url: app.url,
                      })
                    }
                    title={app.name}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                      activeModule === 'webapp' && activeWebAppId === app.id
                        ? 'bg-white/10 text-white'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Globe className="w-4 h-4 text-brand-400" />
                  </button>
                ))}
            </>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={width ? { width: `${width}px`, backgroundColor: '#162231' } : { backgroundColor: '#162231' }}
      className="sidebar-navy w-60 border-r border-slate-800/80 flex flex-col justify-between shrink-0 h-full text-xs text-slate-200"
    >
      {/* Top Brand Header */}
      <div className="shrink-0">
        <div className="relative py-3 px-3 flex flex-col items-center justify-center border-b border-white/10 app-drag-region">
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Recolher barra lateral (somente ícones)"
              aria-label="Recolher barra lateral"
              className="app-no-drag absolute left-2.5 top-2.5 p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
          <img
            src={logoImg}
            alt="Anectta Mail"
            className="w-11 h-11 object-contain shrink-0 anectta-logo-spin drop-shadow-[0_0_10px_rgba(0,168,255,0.45)]"
          />
          <span className="mt-1.5 text-[20px] font-light tracking-[0.06em] text-white leading-tight select-none">
            &#923;NECTT&#923; M@il
          </span>
          <div className="mt-1 flex items-center justify-center gap-2 text-[11px] font-normal tracking-wide text-slate-300">
            <span>Ágil</span>
            <span
              style={{ backgroundColor: '#00a8ff' }}
              className="w-1.5 h-1.5 rounded-full shadow-[0_0_6px_rgba(0,168,255,0.9)] shrink-0"
              aria-hidden="true"
            />
            <span>Seguro</span>
            <span
              style={{ backgroundColor: '#00a8ff' }}
              className="w-1.5 h-1.5 rounded-full shadow-[0_0_6px_rgba(0,168,255,0.9)] shrink-0"
              aria-hidden="true"
            />
            <span>Conectado</span>
          </div>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              title="Configurações"
              aria-label="Configurações"
              className="app-no-drag absolute right-2.5 top-2.5 p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Top Folder Area */}
      <div ref={scrollContainerRef} className="flex-1 p-2 space-y-3 overflow-y-auto custom-scroll">
        {/* Lista de Contas Individuais (uma embaixo da outra, estilo Outlook / Thunderbird) */}
        <div className="space-y-3">
          {accountList.length > 0 &&
            (showUnifiedInbox ? (
              <div
                className={`group w-full flex items-center justify-between px-2.5 py-2 rounded-xl border transition-all ${
                  activeAccountId === '__unified__'
                    ? 'bg-sky-500/20 border-sky-400/50 text-white shadow-sm'
                    : 'bg-slate-900/50 border-slate-800/80 text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectAccount?.('__unified__');
                    onSelectFolder('inbox', '__unified__');
                  }}
                  className="flex-1 flex items-center space-x-2 min-w-0 text-left"
                  title="Visualizar mensagens de todas as contas em uma única caixa de entrada"
                >
                  <Layers className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="text-xs font-bold truncate">Caixa Unificada</span>
                </button>
                <div className="flex items-center space-x-1.5 shrink-0">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                    {accountList.reduce((sum, acc) => sum + (getAccountCounts(acc).unread.inbox || 0), 0)}
                  </span>
                  {onToggleUnifiedInbox && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleUnifiedInbox(false);
                      }}
                      title="Ocultar Caixa Unificada"
                      aria-label="Ocultar Caixa Unificada"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              onToggleUnifiedInbox && (
                <div className="flex justify-end px-1 -mb-1">
                  <button
                    type="button"
                    onClick={() => onToggleUnifiedInbox(true)}
                    title="Exibir Caixa Unificada"
                    className="flex items-center space-x-1 text-[10px] text-slate-500 hover:text-sky-400 transition-colors"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Exibir Caixa Unificada</span>
                  </button>
                </div>
              )
            ))}
          {accountList.map((acc) => {
            const accId = acc.id;
            const isBeingDragged = draggingAccountId === accId;
            const expanded = isAccExpanded(accId) && !isBeingDragged;
            const isCurrentAcc = accId === activeAccountId || accountList.length === 1;
            const accProto = (acc.incomingServer?.protocol || 'imap').toLowerCase();
            const accProtoUpper = accProto.toUpperCase();
            const { unread: accUnread, total: accTotal } = getAccountCounts(acc);

            const isFolderActive = (folder: MailFolder) =>
              isCurrentAcc && currentFolder === folder;

            const renderInlineCreateInput = (parentKey?: MailFolder) => {
              const targetParent = parentKey || 'root';
              const currentParent = newFolderParent || 'root';
              if (creatingForAccId !== accId || currentParent !== targetParent) return null;
              return (
                <div className="flex items-center space-x-1 px-1.5 py-1 bg-slate-900 border border-brand-500/50 rounded-md ml-3">
                  <Folder className="w-3 h-3 text-brand-400 shrink-0" />
                  <input
                    type="text"
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        confirmCreateFolder();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelCreateFolder();
                      }
                    }}
                    placeholder="Nome da pasta..."
                    className="flex-1 min-w-0 bg-transparent text-[11px] text-white placeholder-slate-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={confirmCreateFolder}
                    title="Confirmar"
                    className="p-0.5 text-emerald-400 hover:text-emerald-300"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={cancelCreateFolder}
                    title="Cancelar"
                    className="p-0.5 text-slate-400 hover:text-red-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            };

            const renderCustomSubfolders = (parentKey: MailFolder | 'root', depth: number): React.ReactNode => {
              const children = customFolders
                .filter(
                  (cf) =>
                    cf.accountId === accId &&
                    (cf.parentFolder || 'root') === parentKey
                )
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

              return (
                <>
                  {children.map((cf) => {
                    const hasKids = hasSubfoldersForNode(accId, cf.id);
                    const isSubExpanded = isFolderNodeExpanded(accId, cf.id);
                    const isRenaming = renamingFolderId === cf.id;

                    return (
                      <div key={cf.id} style={{ paddingLeft: depth > 0 ? `${Math.min(depth * 10, 30)}px` : undefined }}>
                        {isRenaming ? (
                          <div className="flex items-center space-x-1 px-1.5 py-1 bg-slate-900 border border-brand-500/50 rounded-md">
                            <Folder className="w-3 h-3 text-brand-400 shrink-0" />
                            <input
                              type="text"
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (renameValue.trim()) {
                                    onRenameFolder?.(cf.id, renameValue.trim());
                                  }
                                  setRenamingFolderId(null);
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setRenamingFolderId(null);
                                }
                              }}
                              className="flex-1 min-w-0 bg-transparent text-[11px] text-white focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (renameValue.trim()) onRenameFolder?.(cf.id, renameValue.trim());
                                setRenamingFolderId(null);
                              }}
                              className="p-0.5 text-emerald-400 hover:text-emerald-300"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingFolderId(null)}
                              className="p-0.5 text-slate-400 hover:text-red-400"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div
                            className="group/cf flex items-center"
                            onContextMenu={(e) =>
                              openFolderContextMenu(e, accId, cf.id, cf.name, true, cf.parentFolder)
                            }
                          >
                            {hasKids ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFolderNodeExpanded(accId, cf.id);
                                }}
                                className="p-0.5 text-slate-500 hover:text-slate-300 shrink-0"
                              >
                                {isSubExpanded ? (
                                  <ChevronDown className="w-3 h-3" />
                                ) : (
                                  <ChevronRight className="w-3 h-3" />
                                )}
                              </button>
                            ) : (
                              <span className="w-4 shrink-0" />
                            )}
                            <button
                              onClick={() => {
                                if (hasKids) {
                                  toggleFolderNodeExpanded(accId, cf.id);
                                }
                                handleFolderClick(accId, cf.id);
                              }}
                              className={`flex-1 flex items-center justify-between px-1.5 py-1.5 rounded-md transition-colors min-w-0 ${
                                isFolderActive(cf.id)
                                  ? 'bg-slate-800 text-white font-bold'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                              }`}
                            >
                              <div className="flex items-center space-x-2 min-w-0">
                                <Folder className="w-3 h-3 text-brand-400 shrink-0" />
                                <span className="truncate">{cf.name}</span>
                              </div>
                              {(accUnread[cf.id] ?? 0) > 0 ? (
                                <span className="font-bold text-white text-[11px] bg-brand-600/60 px-1.5 rounded-full">
                                  {accUnread[cf.id]}
                                </span>
                              ) : (accTotal[cf.id] ?? 0) > 0 ? (
                                <span className="text-slate-500 text-[10px] font-mono">
                                  {accTotal[cf.id]}
                                </span>
                              ) : null}
                            </button>
                            {onCreateFolder && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startCreateFolder(accId, cf.id);
                                }}
                                title={`Nova subpasta em "${cf.name}"`}
                                className="opacity-0 group-hover/cf:opacity-100 p-1 text-slate-500 hover:text-brand-400 rounded transition-opacity shrink-0"
                              >
                                <FolderPlus className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                        {(hasKids && isSubExpanded) && renderCustomSubfolders(cf.id, depth + 1)}
                        {renderInlineCreateInput(cf.id)}
                      </div>
                    );
                  })}
                </>
              );
            };

            return (
              <div
                key={accId}
                ref={(el) => {
                  accountItemRefs.current[accId] = el;
                }}
                className={`pt-1.5 border-t border-slate-900 space-y-0.5 transition-transform duration-150 ${
                  isBeingDragged ? 'z-20 relative scale-[1.02]' : ''
                }`}
              >
                {/* Cabeçalho da Conta Individual (Clique e segure no ícone de grip para arrastar e mudar posição) */}
                <div
                  className={`flex items-center justify-between px-2 py-1 rounded-md font-semibold group transition-all cursor-pointer ${
                    isBeingDragged
                      ? 'text-white bg-sky-500/20 ring-2 ring-sky-400 shadow-lg shadow-sky-500/20'
                      : isCurrentAcc
                      ? 'text-white bg-slate-900/60'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/40'
                  }`}
                >
                  <div
                    onClick={(e) => {
                      if (suppressAccountClickRef.current) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      if (onSelectAccount && accId !== activeAccountId) {
                        onSelectAccount(accId);
                      }
                      toggleAccountExpanded(accId);
                    }}
                    className="flex items-center space-x-1.5 min-w-0 flex-1"
                    title={acc.email}
                  >
                    {accountList.length > 1 && (
                      <span
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleAccountHeaderMouseDown(e, accId);
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
                    {expanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    )}
                    <CheckCircle2
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isCurrentAcc ? 'text-emerald-400' : 'text-teal-400'
                      }`}
                    />
                    <span className="truncate text-[11px] font-mono group-hover:text-brand-300">
                      {acc.email}
                    </span>
                  </div>

                  {/* Protocol Badge (IMAP / POP3) - Somente informativo */}
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 ml-1 ${
                      accProto === 'imap'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                    title={`Conta configurada em modo ${accProtoUpper}`}
                  >
                    {accProtoUpper}
                  </span>
                </div>

                {/* Árvore de Pastas exclusiva desta Conta */}
                {expanded && (
                  <div className="pl-3 space-y-0.5 pt-0.5">
                    {/* Caixa de Entrada */}
                    <div
                      className="group/inbox flex items-center"
                      onContextMenu={(e) =>
                        openFolderContextMenu(e, accId, 'inbox', 'Caixa de Entrada', false)
                      }
                    >
                      <button
                        onClick={() => {
                          if (hasSubfoldersForNode(accId, 'inbox')) {
                            toggleFolderNodeExpanded(accId, 'inbox');
                          }
                          handleFolderClick(accId, 'inbox');
                        }}
                        className={`flex-1 flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                          isFolderActive('inbox')
                            ? 'bg-slate-800 text-white font-bold'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {hasSubfoldersForNode(accId, 'inbox') && isFolderNodeExpanded(accId, 'inbox') ? (
                            <ChevronDown className="w-3 h-3 text-sky-400" />
                          ) : (
                            <Inbox className="w-3 h-3 text-sky-400" />
                          )}
                          <span>Caixa de Entrada</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {accUnread['inbox'] > 0 ? (
                            <span className="font-bold text-white text-[11px] bg-brand-600/60 px-1.5 rounded-full">
                              {accUnread['inbox']}
                            </span>
                          ) : accTotal['inbox'] > 0 ? (
                            <span className="text-slate-500 text-[10px] font-mono">
                              {accTotal['inbox']}
                            </span>
                          ) : null}
                        </div>
                      </button>
                      {onCreateFolder && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startCreateFolder(accId, 'inbox');
                          }}
                          title="Criar subpasta em Caixa de Entrada"
                          className="opacity-0 group-hover/inbox:opacity-100 p-1 text-slate-500 hover:text-brand-400 rounded transition-opacity"
                        >
                          <FolderPlus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {isFolderNodeExpanded(accId, 'inbox') && renderCustomSubfolders('inbox', 1)}
                    {renderInlineCreateInput('inbox')}

                    {/* Favoritos (mensagens com estrela) */}
                    <button
                      onClick={() => handleFolderClick(accId, 'favorites')}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                        isFolderActive('favorites')
                          ? 'bg-slate-800 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Star className="w-3 h-3 text-amber-400" />
                        <span>Favoritos</span>
                      </div>
                      {accTotal['favorites'] > 0 && (
                        <span className="text-slate-400 text-[10px] font-mono bg-slate-800/80 px-1.5 rounded">
                          {accTotal['favorites']}
                        </span>
                      )}
                    </button>

                    {/* Tarefas */}
                    <button
                      onClick={() => handleFolderClick(accId, 'tasks')}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                        isFolderActive('tasks')
                          ? 'bg-slate-800 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <CheckSquare className="w-3 h-3 text-emerald-400" />
                        <span>Tarefas</span>
                      </div>
                      {accTotal['tasks'] > 0 && (
                        <span className="font-bold text-white text-[11px] bg-brand-600/60 px-1.5 rounded">
                          {accTotal['tasks']}
                        </span>
                      )}
                    </button>

                    {/* Lista de leitura */}
                    <button
                      onClick={() => handleFolderClick(accId, 'reading_list')}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                        isFolderActive('reading_list')
                          ? 'bg-slate-800 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <BookOpen className="w-3 h-3 text-sky-400" />
                        <span>Lista de leitura</span>
                      </div>
                      {accTotal['reading_list'] > 0 && (
                        <span className="font-bold text-white text-[11px] bg-brand-600/60 px-1.5 rounded">
                          {accTotal['reading_list']}
                        </span>
                      )}
                    </button>

                    {/* Importante */}
                    <button
                      onClick={() => handleFolderClick(accId, 'important')}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                        isFolderActive('important')
                          ? 'bg-slate-800 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Tag className="w-3 h-3 text-amber-300" />
                        <span>Importante</span>
                      </div>
                      {accTotal['important'] > 0 && (
                        <span className="text-slate-400 text-[10px] font-mono bg-slate-800/80 px-1.5 rounded">
                          {accTotal['important']}
                        </span>
                      )}
                    </button>

                    {/* Itens Enviados */}
                    <button
                      onClick={() => {
                        if (hasSubfoldersForNode(accId, 'sent')) {
                          toggleFolderNodeExpanded(accId, 'sent');
                        }
                        handleFolderClick(accId, 'sent');
                      }}
                      onContextMenu={(e) =>
                        openFolderContextMenu(e, accId, 'sent', 'Itens Enviados', false)
                      }
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                        isFolderActive('sent')
                          ? 'bg-slate-800 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <SendHorizontal className="w-3 h-3 text-indigo-400" />
                        <span>Itens Enviados</span>
                      </div>
                      {accTotal['sent'] > 0 && (
                        <span className="text-slate-500 text-[10px] font-mono">
                          {accTotal['sent']}
                        </span>
                      )}
                    </button>
                    {isFolderNodeExpanded(accId, 'sent') && renderCustomSubfolders('sent', 1)}
                    {renderInlineCreateInput('sent')}

                    {/* Lixo Eletrônico */}
                    <button
                      onClick={() => {
                        if (hasSubfoldersForNode(accId, 'junk')) {
                          toggleFolderNodeExpanded(accId, 'junk');
                        }
                        handleFolderClick(accId, 'junk');
                      }}
                      onContextMenu={(e) =>
                        openFolderContextMenu(e, accId, 'junk', 'Lixo eletrônico', false)
                      }
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                        isFolderActive('junk')
                          ? 'bg-slate-800 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <AlertOctagon className="w-3 h-3 text-orange-400" />
                        <span>Lixo eletrônico</span>
                      </div>
                      {accUnread['junk'] > 0 ? (
                        <span className="font-bold text-amber-400 text-[10px] bg-amber-500/20 px-1.5 rounded-full">
                          {accUnread['junk']}
                        </span>
                      ) : accTotal['junk'] > 0 ? (
                        <span className="text-slate-500 text-[10px] font-mono">
                          {accTotal['junk']}
                        </span>
                      ) : null}
                    </button>
                    {isFolderNodeExpanded(accId, 'junk') && renderCustomSubfolders('junk', 1)}
                    {renderInlineCreateInput('junk')}

                    {/* Caixa de Saída */}
                    <button
                      onClick={() => {
                        if (hasSubfoldersForNode(accId, 'outbox')) {
                          toggleFolderNodeExpanded(accId, 'outbox');
                        }
                        handleFolderClick(accId, 'outbox');
                      }}
                      onContextMenu={(e) =>
                        openFolderContextMenu(e, accId, 'outbox', 'Caixa de Saída', false)
                      }
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                        isFolderActive('outbox')
                          ? 'bg-slate-800 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <SendHorizontal className="w-3 h-3 text-cyan-400" />
                        <span>Caixa de Saída</span>
                      </div>
                      {accTotal['outbox'] > 0 && (
                        <span className="text-slate-500 text-[10px] font-mono">
                          {accTotal['outbox']}
                        </span>
                      )}
                    </button>
                    {isFolderNodeExpanded(accId, 'outbox') && renderCustomSubfolders('outbox', 1)}
                    {renderInlineCreateInput('outbox')}

                    {/* Itens Excluídos */}
                    <button
                      onClick={() => {
                        if (hasSubfoldersForNode(accId, 'trash')) {
                          toggleFolderNodeExpanded(accId, 'trash');
                        }
                        handleFolderClick(accId, 'trash');
                      }}
                      onContextMenu={(e) =>
                        openFolderContextMenu(e, accId, 'trash', 'Itens Excluídos', false)
                      }
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                        isFolderActive('trash')
                          ? 'bg-slate-800 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Trash2 className="w-3 h-3 text-rose-400" />
                        <span>Itens Excluídos</span>
                      </div>
                      {accTotal['trash'] > 0 && (
                        <span className="text-slate-500 text-[10px] font-mono">
                          {accTotal['trash']}
                        </span>
                      )}
                    </button>
                    {isFolderNodeExpanded(accId, 'trash') && renderCustomSubfolders('trash', 1)}
                    {renderInlineCreateInput('trash')}

                    {/* Rascunhos */}
                    <button
                      onClick={() => {
                        if (hasSubfoldersForNode(accId, 'drafts')) {
                          toggleFolderNodeExpanded(accId, 'drafts');
                        }
                        handleFolderClick(accId, 'drafts');
                      }}
                      onContextMenu={(e) =>
                        openFolderContextMenu(e, accId, 'drafts', 'Rascunhos', false)
                      }
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                        isFolderActive('drafts')
                          ? 'bg-slate-800 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <FileText className="w-3 h-3 text-violet-400" />
                        <span>Rascunhos</span>
                      </div>
                      {accTotal['drafts'] > 0 && (
                        <span className="text-slate-500 text-[10px] font-mono">
                          {accTotal['drafts']}
                        </span>
                      )}
                    </button>
                    {isFolderNodeExpanded(accId, 'drafts') && renderCustomSubfolders('drafts', 1)}
                    {renderInlineCreateInput('drafts')}

                    {/* Arquivados */}
                    <button
                      onClick={() => {
                        if (hasSubfoldersForNode(accId, 'archive')) {
                          toggleFolderNodeExpanded(accId, 'archive');
                        }
                        handleFolderClick(accId, 'archive');
                      }}
                      onContextMenu={(e) =>
                        openFolderContextMenu(e, accId, 'archive', 'Arquivados', false)
                      }
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                        isFolderActive('archive')
                          ? 'bg-slate-800 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Archive className="w-3 h-3 text-teal-400" />
                        <span>Arquivados</span>
                      </div>
                      {accTotal['archive'] > 0 && (
                        <span className="text-slate-500 text-[10px] font-mono">
                          {accTotal['archive']}
                        </span>
                      )}
                    </button>
                    {isFolderNodeExpanded(accId, 'archive') && renderCustomSubfolders('archive', 1)}
                    {renderInlineCreateInput('archive')}

                    {/* Snoozed (Adiados) */}
                    <button
                      onClick={() => {
                        if (hasSubfoldersForNode(accId, 'snooze')) {
                          toggleFolderNodeExpanded(accId, 'snooze');
                        }
                        handleFolderClick(accId, 'snooze');
                      }}
                      onContextMenu={(e) =>
                        openFolderContextMenu(e, accId, 'snooze', 'Snoozed (Adiados)', false)
                      }
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                        isFolderActive('snooze')
                          ? 'bg-slate-800 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>Snoozed (Adiados)</span>
                      </div>
                      {accTotal['snooze'] > 0 && (
                        <span className="text-slate-500 text-[10px] font-mono">
                          {accTotal['snooze']}
                        </span>
                      )}
                    </button>
                    {isFolderNodeExpanded(accId, 'snooze') && renderCustomSubfolders('snooze', 1)}
                    {renderInlineCreateInput('snooze')}

                    {/* RSS Feeds */}
                    <button
                      onClick={() => handleFolderClick(accId, 'inbox')}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                    >
                      <div className="flex items-center space-x-2">
                        <Rss className="w-3 h-3 text-orange-500" />
                        <span>RSS Feeds</span>
                      </div>
                    </button>

                    {/* Pastas de Pesquisa */}
                    <button
                      onClick={() => handleFolderClick(accId, 'search_folders')}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors ${
                        isFolderActive('search_folders')
                          ? 'bg-slate-800 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <FolderSearch className="w-3 h-3 text-blue-400" />
                        <span>Pastas de Pesquisa</span>
                      </div>
                    </button>

                    {/* Pastas Personalizadas na Raiz da Conta */}
                    {renderCustomSubfolders('root', 0)}
                    {renderInlineCreateInput(undefined) || (
                      onCreateFolder && (
                        <button
                          type="button"
                          onClick={() => startCreateFolder(accId)}
                          className="w-full flex items-center space-x-2 px-2 py-1 rounded-md text-[11px] text-brand-400/90 hover:text-brand-300 hover:bg-slate-900 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Nova Pasta</span>
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Navegação Rápida (E-mails, Calendário, Contatos, Tarefas...) — recolhível */}
      {onSelectModule && (() => {
        const navItems: QuickNavItem[] = [
          {
            key: 'mail',
            label: 'E-mails',
            icon: Inbox,
            iconClass: 'text-sky-400',
            active: activeModule === 'mail',
            onClick: () => onSelectModule('mail'),
          },
          ...((appsSettings?.enableCalendarApp ?? true)
            ? [{
                key: 'calendar',
                label: 'Calendário',
                icon: Calendar,
                iconClass: 'text-sky-400',
                active: activeModule === 'calendar',
                onClick: () => onSelectModule('calendar'),
              }]
            : []),
          ...((appsSettings?.enableContactsApp ?? true)
            ? [{
                key: 'contacts',
                label: 'Contatos',
                icon: Users,
                iconClass: 'text-sky-400',
                active: activeModule === 'contacts',
                onClick: () => onSelectModule('contacts'),
              }]
            : []),
          {
            key: 'tasks',
            label: 'Tarefas',
            icon: CheckSquare,
            iconClass: 'text-emerald-400',
            active: activeModule === 'tasks',
            onClick: () => onSelectModule('tasks'),
          },
          {
            key: 'stats',
            label: 'Estatísticas',
            icon: BarChart3,
            iconClass: 'text-violet-400',
            active: activeModule === 'stats',
            onClick: () => onSelectModule('stats'),
          },
          ...(appsSettings?.enableWhatsAppApp
            ? [{
                key: 'whatsapp',
                label: 'WhatsApp Web',
                icon: MessageCircle,
                iconClass: 'text-emerald-400',
                active: !!isWhatsAppOpen,
                onClick: () => onToggleWhatsApp?.(),
              }]
            : []),
          ...(appsSettings?.customApps || [])
            .filter((app) => app.enabled)
            .map((app) => ({
              key: `webapp-${app.id}`,
              label: app.name,
              icon: Globe,
              iconClass: 'text-brand-400',
              active: activeModule === 'webapp' && activeWebAppId === app.id,
              onClick: () => onSelectWebApp?.({ id: app.id, name: app.name, url: app.url }),
            })),
          ...(onOpenPrivacyCenter
            ? [{
                key: 'privacy',
                label: 'Escudo de Privacidade',
                icon: ShieldCheck,
                iconClass: 'text-emerald-400',
                active: false,
                onClick: onOpenPrivacyCenter,
                title: 'Abrir Central de Privacidade & Segurança',
                hoverClass: 'hover:bg-emerald-500/10',
              }]
            : []),
        ];

        return (
          <div className="px-2 py-2 border-t border-white/10 shrink-0">
            <button
              type="button"
              onClick={toggleQuickNav}
              aria-expanded={!isQuickNavCollapsed}
              title={isQuickNavCollapsed ? 'Expandir aplicativos' : 'Recolher aplicativos'}
              className="w-full flex items-center justify-between px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            >
              <span>Aplicativos</span>
              {isQuickNavCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {isQuickNavCollapsed ? (
              /* Recolhido: linha compacta só com ícones (mantém o acesso rápido) */
              <div className="mt-1 flex flex-wrap items-center gap-0.5 px-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={item.onClick}
                      title={item.title || item.label}
                      aria-label={item.label}
                      className={`p-1.5 rounded-lg transition-colors ${
                        item.active ? 'bg-white/10' : item.hoverClass || 'hover:bg-white/5'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${item.iconClass}`} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-1 space-y-0.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={item.onClick}
                      title={item.title}
                      className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg transition-colors ${
                        item.active
                          ? 'bg-white/10 text-white font-semibold'
                          : `text-slate-300 hover:text-white ${item.hoverClass || 'hover:bg-white/5'}`
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${item.iconClass}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Rodapé da Sidebar: Espaço em Disco */}
      {accountProtocol === 'imap' && (() => {
        const formatBytes = (bytes: number) => {
          if (!bytes || bytes <= 0) return '0 MB';
          const gb = bytes / (1024 * 1024 * 1024);
          if (gb >= 1) return `${gb.toFixed(2)} GB`;
          const mb = bytes / (1024 * 1024);
          if (mb >= 1) return `${mb.toFixed(1)} MB`;
          const kb = bytes / 1024;
          return `${Math.max(1, Math.round(kb))} KB`;
        };

        const usedBytes = cloudQuota?.usedBytes ?? 0;
        const limitBytes = cloudQuota?.limitBytes ?? 0;
        const pct =
          limitBytes > 0
            ? Math.min(100, Math.max(usedBytes > 0 ? 2 : 0, Math.round((usedBytes / limitBytes) * 100)))
            : usedBytes > 0
            ? 8
            : 0;

        return (
          <div className="p-3 border-t border-white/10 bg-[#121c29] space-y-1.5 shrink-0">
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>Armazenamento</span>
              <span className="font-mono text-slate-400">
                {limitBytes > 0
                  ? `${formatBytes(usedBytes)} / ${formatBytes(limitBytes)} (${Math.round((usedBytes / limitBytes) * 100)}%)`
                  : usedBytes > 0
                  ? `${formatBytes(usedBytes)} em nuvem`
                  : 'Sincronizando cota...'}
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-brand-500 to-indigo-500 h-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })()}
      {/* Menu de Contexto (Botão Direito estilo Outlook) */}
      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          className="fixed z-50 w-60 bg-slate-900 border border-slate-700/90 rounded-lg shadow-2xl py-1.5 text-xs text-slate-200"
        >
          {(() => {
            const selectedText = window.getSelection()?.toString()?.trim() || '';
            if (!selectedText) return null;
            return (
              <>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(selectedText).catch(() => {});
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-brand-600/25 hover:text-white text-left"
                >
                  <Copy className="w-3.5 h-3.5 text-brand-400" />
                  <span className="truncate">Copiar texto selecionado</span>
                </button>
                <div className="my-1 border-t border-slate-800" />
              </>
            );
          })()}

          <button
            type="button"
            onClick={() => {
              const { accountId, folderId } = contextMenu;
              setContextMenu(null);
              if (folderId !== 'root') {
                setExpandedCustomFolders((p) => ({ ...p, [`${accountId}:${folderId}`]: true }));
              }
              startCreateFolder(accountId, folderId === 'root' ? undefined : folderId);
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-brand-600/25 hover:text-white text-left"
          >
            <FolderPlus className="w-3.5 h-3.5 text-brand-400" />
            <span>Nova Pasta...</span>
          </button>

          <button
            type="button"
            disabled={!contextMenu.isCustom}
            onClick={() => {
              const { folderId, folderName } = contextMenu;
              setContextMenu(null);
              setRenamingFolderId(folderId);
              setRenameValue(folderName);
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-brand-600/25 hover:text-white text-left disabled:opacity-40 disabled:pointer-events-none"
          >
            <Edit3 className="w-3.5 h-3.5 text-slate-400" />
            <span>Renomear Pasta</span>
          </button>

          <button
            type="button"
            disabled={!contextMenu.isCustom}
            onClick={() => {
              const { folderId } = contextMenu;
              setContextMenu(null);
              onCopyFolder?.(folderId);
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-brand-600/25 hover:text-white text-left disabled:opacity-40 disabled:pointer-events-none"
          >
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span>Copiar Pasta</span>
          </button>

          <button
            type="button"
            disabled={!contextMenu.isCustom}
            onClick={() => {
              const cf = customFolders.find((f) => f.id === contextMenu.folderId);
              setContextMenu(null);
              if (cf) setMoveModalFolder(cf);
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-brand-600/25 hover:text-white text-left disabled:opacity-40 disabled:pointer-events-none"
          >
            <FolderInput className="w-3.5 h-3.5 text-slate-400" />
            <span>Mover Pasta</span>
          </button>

          <button
            type="button"
            disabled={!contextMenu.isCustom}
            onClick={() => {
              const { folderId } = contextMenu;
              setContextMenu(null);
              onDeleteFolder?.(folderId);
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-rose-500/20 hover:text-rose-300 text-left disabled:opacity-40 disabled:pointer-events-none"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Excluir Pasta</span>
          </button>

          <div className="my-1 border-t border-slate-800" />

          <button
            type="button"
            onClick={() => {
              const { accountId, folderId } = contextMenu;
              setContextMenu(null);
              onMarkAllAsRead?.(accountId, folderId);
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-brand-600/25 hover:text-white text-left"
          >
            <MailOpen className="w-3.5 h-3.5 text-slate-400" />
            <span>Marcar Todas como Lidas</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const { accountId, folderId } = contextMenu;
              setContextMenu(null);
              onEmptyFolder?.(accountId, folderId);
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-brand-600/25 hover:text-white text-left"
          >
            <Trash2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Limpar Pasta / Excluir Tudo</span>
          </button>

          <div className="my-1 border-t border-slate-800" />

          <button
            type="button"
            onClick={() => {
              const { accountId, folderId, folderName } = contextMenu;
              setContextMenu(null);
              onToggleFavoriteFolder?.(accountId, folderId, folderName);
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-brand-600/25 hover:text-white text-left"
          >
            <Star className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {favoriteFolders.some(
                (f) => f.accountId === contextMenu.accountId && f.folderId === contextMenu.folderId
              )
                ? 'Remover dos Favoritos'
                : 'Adicionar a Favoritos'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              const { accountId, folderId } = contextMenu;
              setContextMenu(null);
              onSortSubfolders?.(accountId, folderId === 'root' ? undefined : folderId);
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-brand-600/25 hover:text-white text-left"
          >
            <ArrowUpAZ className="w-3.5 h-3.5 text-slate-400" />
            <span>Classificar Subpastas A a Z</span>
          </button>

          <button
            type="button"
            disabled={!contextMenu.isCustom}
            onClick={() => {
              const { folderId } = contextMenu;
              setContextMenu(null);
              onReorderFolder?.(folderId, 'up');
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-brand-600/25 hover:text-white text-left disabled:opacity-40 disabled:pointer-events-none"
          >
            <ArrowUp className="w-3.5 h-3.5 text-slate-400" />
            <span>Mover para Cima</span>
          </button>

          <button
            type="button"
            disabled={!contextMenu.isCustom}
            onClick={() => {
              const { folderId } = contextMenu;
              setContextMenu(null);
              onReorderFolder?.(folderId, 'down');
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-brand-600/25 hover:text-white text-left disabled:opacity-40 disabled:pointer-events-none"
          >
            <ArrowDown className="w-3.5 h-3.5 text-slate-400" />
            <span>Mover para Baixo</span>
          </button>

          <div className="my-1 border-t border-slate-800" />

          <button
            type="button"
            onClick={() => {
              const { accountId, folderId, folderName, isCustom } = contextMenu;
              setContextMenu(null);
              const acc = accountList.find((a) => a.id === accountId) || accountList[0];
              const counts = getAccountCounts(acc);
              const cf = customFolders.find((f) => f.id === folderId);
              setPropertiesData({
                name: folderName,
                accountEmail: acc.email,
                isCustom,
                total: counts.total[folderId] ?? 0,
                unread: counts.unread[folderId] ?? 0,
                createdAt: cf?.createdAt,
              });
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-1.5 hover:bg-brand-600/25 hover:text-white text-left"
          >
            <Info className="w-3.5 h-3.5 text-brand-400" />
            <span>Propriedades...</span>
          </button>
        </div>
      )}

      {/* Modal: Mover Pasta */}
      {moveModalFolder && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setMoveModalFolder(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Mover "{moveModalFolder.name}" para:
              </h3>
              <button
                type="button"
                onClick={() => setMoveModalFolder(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1 custom-scroll">
              <button
                type="button"
                onClick={() => {
                  onMoveFolder?.(moveModalFolder.id, undefined);
                  setMoveModalFolder(null);
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-slate-800/70 hover:bg-brand-600/25 text-slate-200 text-xs"
              >
                Raiz da Conta
              </button>
              <button
                type="button"
                onClick={() => {
                  onMoveFolder?.(moveModalFolder.id, 'inbox');
                  setMoveModalFolder(null);
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-slate-800/70 hover:bg-brand-600/25 text-slate-200 text-xs"
              >
                Caixa de Entrada
              </button>
              <button
                type="button"
                onClick={() => {
                  onMoveFolder?.(moveModalFolder.id, 'sent');
                  setMoveModalFolder(null);
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-slate-800/70 hover:bg-brand-600/25 text-slate-200 text-xs"
              >
                Itens Enviados
              </button>
              {customFolders
                .filter(
                  (cf) =>
                    cf.accountId === moveModalFolder.accountId && cf.id !== moveModalFolder.id
                )
                .map((cf) => (
                  <button
                    key={cf.id}
                    type="button"
                    onClick={() => {
                      onMoveFolder?.(moveModalFolder.id, cf.id);
                      setMoveModalFolder(null);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-slate-800/70 hover:bg-brand-600/25 text-slate-200 text-xs flex items-center space-x-2"
                  >
                    <Folder className="w-3.5 h-3.5 text-brand-400" />
                    <span>{cf.name}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Propriedades da Pasta */}
      {propertiesData && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setPropertiesData(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <Info className="w-4 h-4 text-brand-400" />
                <h3 className="text-sm font-bold text-white">Propriedades da Pasta</h3>
              </div>
              <button
                type="button"
                onClick={() => setPropertiesData(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Nome:</span>
                <span className="font-semibold text-white">{propertiesData.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Conta:</span>
                <span className="font-mono text-[11px]">{propertiesData.accountEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tipo:</span>
                <span>{propertiesData.isCustom ? 'Pasta Personalizada' : 'Pasta do Sistema'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total de mensagens:</span>
                <span className="font-mono font-bold text-white">{propertiesData.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Não lidas:</span>
                <span className="font-mono font-bold text-brand-400">{propertiesData.unread}</span>
              </div>
              {propertiesData.createdAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Criada em:</span>
                  <span>{new Date(propertiesData.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
