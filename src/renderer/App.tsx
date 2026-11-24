import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { RotateCw, MailPlus, SlidersHorizontal, Minus, Square, X } from 'lucide-react';
import { ActiveModule } from '@/components/AppRail';
import { Sidebar } from '@/components/Sidebar';
import { EmailList, EmailListRef, EmailLayoutMode } from '@/components/EmailList';
import { EmailView } from '@/components/EmailView';
import { EmailTabsBar } from '@/components/EmailTabsBar';
import { CommandPalette } from '@/components/CommandPalette';
import { WebAppPanel } from '@/components/WebAppPanel';
import { WhatsAppPanel } from '@/components/WhatsAppPanel';
import type { CorporateContact } from '@/components/ContactsView';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useImapServerSync } from '@/hooks/useImapServerSync';
import { useMailBackfill } from '@/hooks/useMailBackfill';
import { useMailPersistence, isMailStoreAvailable } from '@/hooks/useMailPersistence';
import { ensureEmailBody, useHydratedEmails } from '@/services/emailBodyCache';
import { isBodyStripped } from './utils/emailBodyStrip';
import { removeServerDuplicates } from './utils/emailDedupe';
import { pickNewArrivals, buildNewMailNotice } from './utils/newMailDetect';
import { findFoldersDeletedOnServer } from './utils/serverFolderSync';
import { getImapLocation, imapServerKey, parseImapLocationFromId } from './utils/imapLocation';
import { CustomFolder, EmailItem, FavoriteFolder, MailFolder, UserAccount, PriorityLevel, TaskItem } from '@/types/email';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  AccountSettings,
  DEFAULT_CONFIRMATION_SETTINGS,
} from '@/types/settings';
import { EmailAnimationPreviewModal } from './components/animated-icons';
import { MotivationalBanner } from './components/MotivationalBanner';
import { ForceUpdateModal } from './components/ForceUpdateModal';
import { RescueUpdateBanner } from './components/RescueUpdateBanner';

// Code-Splitting (React.lazy): módulos pesados carregados sob demanda para abertura instantânea
const CalendarView = lazy(() =>
  import('@/components/CalendarView').then((m) => ({ default: m.CalendarView }))
);
const ContactsView = lazy(() =>
  import('@/components/ContactsView').then((m) => ({ default: m.ContactsView }))
);
const TasksView = lazy(() =>
  import('@/components/TasksView').then((m) => ({ default: m.TasksView }))
);
const ProductivityDashboardView = lazy(() =>
  import('@/components/ProductivityDashboardView').then((m) => ({
    default: m.ProductivityDashboardView,
  }))
);
const SettingsModal = lazy(() =>
  import('@/components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const ComposeModal = lazy(() =>
  import('@/components/ComposeModal').then((m) => ({ default: m.ComposeModal }))
);
const RulesModal = lazy(() =>
  import('./components/RulesModal').then((m) => ({ default: m.RulesModal }))
);
const EmailReaderModal = lazy(() =>
  import('@/components/EmailReaderModal').then((m) => ({ default: m.EmailReaderModal }))
);
const AccountSetupWizardView = lazy(() =>
  import('./components/AccountSetupWizardView').then((m) => ({
    default: m.AccountSetupWizardView,
  }))
);
const ContactContextSidebar = lazy(() =>
  import('@/components/ContactContextSidebar').then((m) => ({
    default: m.ContactContextSidebar,
  }))
);

const LazyModuleFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-500 text-xs gap-2">
    <div className="w-4 h-4 rounded-full border-2 border-brand-500/30 border-t-brand-600 animate-spin" />
    <span>Carregando módulo...</span>
  </div>
);
import { soundService } from './services/soundService';
import { saveSettingsLocal, loadSettingsLocal } from './utils/secureSettingsStorage';
import { themeService } from './services/themeService';
import { applyRulesToEmails, loadMailRules, MailRule, saveMailRules } from './services/rulesService';
import { getEmailTimestampMs } from './utils/dateSortUtils';
import { getThreadMessagesForEmail } from './utils/threadUtils';
import {
  buildIcsRsvpReply,
  getRsvpLabel,
  RsvpStatus,
  syncInviteToLocalCalendar,
} from './utils/icsRsvpUtils';
import { parseUnsubscribeInfo } from './utils/triageAndTemplates';

/**
 * localStorage: IDs de e-mails do servidor apagados DEFINITIVAMENTE no app. A exclusão é local,
 * então a mensagem continua no servidor; estes IDs entram como "já conhecidos" na sincronização
 * e no "Baixar todas" para o e-mail não ser baixado de novo.
 */
const DELETED_EMAIL_IDS_KEY = 'anectta_deleted_email_ids';
const MAX_DELETED_EMAIL_IDS = 20000;

const loadDeletedEmailIds = (): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(DELETED_EMAIL_IDS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const rememberDeletedEmailIds = (ids: string[]): void => {
  const serverIds = ids.filter((id) => id.includes('-imap-') || id.includes('pop3-'));
  if (serverIds.length === 0) return;
  try {
    const merged = new Set(loadDeletedEmailIds());
    for (const id of serverIds) merged.add(id);
    const list = Array.from(merged);
    localStorage.setItem(
      DELETED_EMAIL_IDS_KEY,
      JSON.stringify(list.length > MAX_DELETED_EMAIL_IDS ? list.slice(-MAX_DELETED_EMAIL_IDS) : list)
    );
  } catch {}
};

/** Esquece IDs da lista de excluídos que o servidor já confirmou não ter mais (nada a evitar). */
const forgetDeletedEmailIds = (ids: string[]): void => {
  if (ids.length === 0) return;
  try {
    const drop = new Set(ids);
    const current = loadDeletedEmailIds();
    const next = current.filter((id) => !drop.has(id));
    if (next.length !== current.length) localStorage.setItem(DELETED_EMAIL_IDS_KEY, JSON.stringify(next));
  } catch {}
};

const INITIAL_EMAILS: EmailItem[] = [
  {
    id: 'msg-coworking-1',
    sender: 'COWORKING SMART',
    senderEmail: 'faturamento@coworkingsmart.conexa.app',
    avatar: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=120&auto=format&fit=crop&q=80',
    recipient: 'carlosamoroso@anectta.com.br',
    subject: 'Sua nota fiscal está pronta - ANECTTA TECNOLOGIA DA INFORMAÇÃO',
    snippet: '<https://coworkingsmart.conexa.app/index.php/faturamento/nfe/visualizar/849201>',
    body: `Prezado(a) Carlos Amoroso,\nANECTTA TECNOLOGIA DA INFORMAÇÃO LTDA\n\nInformamos que a Nota Fiscal de Serviços Eletrônica (NFS-e) referente à locação corporativa das salas executivas e estações dedicadas do mês vigente já está disponível para consulta e download.\n\nLink direto para a emissão:\nhttps://coworkingsmart.conexa.app/index.php/faturamento/nfe/visualizar/849201\n\nValor total: R$ 4.850,00\nVencimento: 15/11/2026\nCódigo de Verificação: A9F2-C3B1-94E0\n\nQualquer dúvida, estamos à disposição no setor de faturamento.\n\nAtenciosamente,\nEquipe Coworking Smart Gestão de Espaços`,
    timestamp: '11:43',
    period: 'today',
    folder: 'inbox',
    priority: 'medium',
    isRead: false,
    isStarred: true,
    hasAttachment: true,
    category: 'Finanças',
    tags: ['Nota Fiscal', 'Faturamento'],
  },
  {
    id: 'msg-marco-trinity',
    sender: 'Marco Aurélio Moreira',
    senderEmail: 'marco.moreira@trinityti.com.br',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    recipient: 'carlosamoroso@anectta.com.br',
    subject: 'Eu quero me conectar com você - Parceria Tecnológica TrinityTI & Anectta',
    snippet: 'Marco Aurélio, CEO da TrinityTI - Gestão de TI Corporativa e Serviços Cloud...',
    body: `Olá Carlos Amoroso, tudo bem?\n\nAqui é o Marco Aurélio, CEO da TrinityTI.\n\nAcompanho o crescimento consistente da infraestrutura corporativa da Anectta Tecnologia e o lançamento dos novos produtos White Label voltados para governança e segurança de dados.\n\nGostaria de propor uma breve conversa de 15 minutos nesta semana para avaliarmos uma sinergia direta entre nossa operação de outsourcing de TI e as soluções da Anectta para clientes corporativos de grande porte.\n\nQual o melhor dia e horário na sua agenda?\n\nForte abraço,\nMarco Aurélio Moreira\nCEO & Founder | TrinityTI Gestão de TI`,
    timestamp: 'sáb 07/11',
    period: 'last_week',
    folder: 'inbox',
    priority: 'high',
    isRead: true,
    isStarred: true,
    hasAttachment: false,
    category: 'Clientes',
    tags: ['Parceria', 'Networking'],
  },
  {
    id: 'msg-anectta-soc2',
    sender: 'Carlos Eduardo Mendes',
    senderEmail: 'carlos.mendes@cyberdefense.io',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    recipient: 'carlosamoroso@anectta.com.br',
    subject: 'Auditoria de Segurança SOC 2 Tipo II & Relatório Pentest Q3',
    snippet: 'Carlos, os testes de penetração externa e conformidade foram aprovados sem apontamentos críticos...',
    body: `Prezado Carlos Amoroso,\n\nConcluímos a avaliação técnica dos servidores de borda e do isolamento de processos do client desktop Anectta MAIL.\n\nResultado:\n- Certificação de conformidade SOC 2 Tipo II e controles LGPD auditados.\n- Zero vulnerabilidades críticas encontradas no Electron runtime isolado.\n\nO certificado oficial já se encontra pronto para publicação.\n\nAtenciosamente,\nCarlos E. Mendes\nLead Security Engineer`,
    timestamp: 'qui 05/11',
    period: 'last_week',
    folder: 'inbox',
    priority: 'medium',
    isRead: true,
    isStarred: false,
    hasAttachment: true,
    category: 'DevOps',
    tags: ['Segurança', 'SOC2'],
  },
];

const hasConfiguredAccounts = (s?: AppSettings | null): boolean => {
  if (!s) return false;
  const hasInList = Array.isArray(s.accounts) && s.accounts.some((a) => Boolean(a?.email?.trim()));
  const hasMain = Boolean(s.account?.email?.trim());
  return hasInList || hasMain;
};

const persistSettings = (nextSettings: AppSettings) => {
  saveSettingsLocal(nextSettings);
  try {
    window.electronAPI?.saveAppSettings?.(nextSettings);
  } catch {}
};

export const App: React.FC = () => {
  // Saved Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = loadSettingsLocal<AppSettings>();
      if (saved) {
        return saved;
      }
      return DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Tema Clean White vs Dark Mode (sincronizado com o ThemeService)
  const [themeMode, setThemeMode] = useState<'dark' | 'clean'>(() => {
    try {
      const active = themeService.getActiveSkin();
      return active.category === 'light' ? 'clean' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [peopleOnly, setPeopleOnly] = useState(false);
  const [domainOnly, setDomainOnly] = useState(false);
  const [attachmentsOnly, setAttachmentsOnly] = useState(false);

  useEffect(() => {
    window.electronAPI?.setMinimizeToTray?.(settings.appearance?.minimizeToTray ?? true);
  }, [settings.appearance?.minimizeToTray]);

  useEffect(() => {
    const sc = settings.spellcheck;
    void window.electronAPI?.configureSpellcheck?.({
      enabled: sc?.enabled ?? true,
      languages: sc?.languages && sc.languages.length > 0 ? sc.languages : ['pt-BR', 'en-US'],
    });
  }, [settings.spellcheck]);

  // Backup periódico automático quando habilitado em Configurações
  useEffect(() => {
    const b = settings.backup;
    if (!b?.enabled || !window.electronAPI?.runBackupNow) return;

    const checkAndRun = async () => {
      const freqMs = (b.frequencyDays || 14) * 24 * 60 * 60 * 1000;
      const lastMs = b.lastBackupAt ? new Date(b.lastBackupAt).getTime() : 0;
      if (Date.now() - lastMs < freqMs) return;

      const res = await window.electronAPI?.runBackupNow?.({
        destinationDir: b.destinationDir,
        keepLastCount: b.keepLastCount || 3,
      });
      if (res?.success) {
        setSettings((prev) => ({
          ...prev,
          backup: {
            ...(prev.backup || b),
            lastBackupAt: res.createdAt || new Date().toISOString(),
            lastBackupFile: res.fileName,
            lastBackupSizeBytes: res.sizeBytes,
          },
        }));
      }
    };

    const initTimer = setTimeout(() => void checkAndRun(), 15000);
    const interval = setInterval(() => void checkAndRun(), 60 * 60 * 1000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [settings.backup?.enabled, settings.backup?.frequencyDays, settings.backup?.destinationDir, settings.backup?.keepLastCount, settings.backup?.lastBackupAt]);

  // Bloqueia zoom acidental via Ctrl + Roda do Mouse (ex.: ao usar Ctrl+Clique para selecionar e-mails)
  useEffect(() => {
    const preventWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', preventWheelZoom, { passive: false });
    return () => window.removeEventListener('wheel', preventWheelZoom);
  }, []);

  useEffect(() => {
    // Aplica a skin salva (respeitando todas as skins, inclusive Graphite, Pistachio, Glacier, Pine, etc.)
    themeService.init();

    const onSkinChange = (e: Event) => {
      const skin = (e as CustomEvent)?.detail?.skin;
      if (skin) {
        setThemeMode(skin.category === 'light' ? 'clean' : 'dark');
      }
    };
    window.addEventListener('anectta:skin-change', onSkinChange);
    return () => window.removeEventListener('anectta:skin-change', onSkinChange);
  }, []);

  const [activeModule, setActiveModule] = useState<ActiveModule>('mail');
  const [activeWebApp, setActiveWebApp] = useState<{ id: string; name: string; url: string } | null>(null);
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);
  const [isReaderModalOpen, setIsReaderModalOpen] = useState(false);

  // Larguras redimensionáveis das colunas (Sidebar e Lista de E-mails)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('anectta_sidebar_width'));
      if (!isNaN(saved) && saved >= 160 && saved <= 460) return saved;
    } catch {}
    return 240;
  });

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('anectta_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [emailListWidth, setEmailListWidth] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('anectta_emaillist_width'));
      if (!isNaN(saved) && saved >= 240 && saved <= 720) return saved;
    } catch {}
    return 360;
  });

  const [emailLayoutMode, setEmailLayoutMode] = useState<EmailLayoutMode>(() => {
    try {
      const saved = localStorage.getItem('anectta_email_layout_mode');
      if (saved === 'compact' || saved === 'horizontal' || saved === 'fullscreen') {
        return saved;
      }
    } catch {}
    return 'compact';
  });

  const [isMinimalLayout, setIsMinimalLayout] = useState<boolean>(() => {
    try {
      return localStorage.getItem('anectta_minimal_layout') === 'true';
    } catch {
      return false;
    }
  });

  const [isFullscreenReading, setIsFullscreenReading] = useState<boolean>(false);

  const handleChangeLayoutMode = useCallback((mode: EmailLayoutMode) => {
    setEmailLayoutMode(mode);
    setIsFullscreenReading(false);
    try {
      localStorage.setItem('anectta_email_layout_mode', mode);
    } catch {}
  }, []);

  const handleToggleMinimalLayout = useCallback(() => {
    setIsMinimalLayout((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('anectta_minimal_layout', String(next));
      } catch {}
      soundService.play('pop');
      showToast(
        next
          ? '✓ Layout mínimo ativado (Ctrl+Shift+F para restaurar).'
          : '✓ Layout padrão restaurado.'
      );
      return next;
    });
  }, []);

  const [resizingPane, setResizingPane] = useState<'sidebar' | 'emaillist' | null>(null);
  const dragStartRef = useRef<{ startX: number; startWidth: number }>({ startX: 0, startWidth: 0 });

  const startResize = (pane: 'sidebar' | 'emaillist', e: React.MouseEvent) => {
    e.preventDefault();
    dragStartRef.current = {
      startX: e.clientX,
      startWidth: pane === 'sidebar' ? (isSidebarCollapsed ? 56 : sidebarWidth) : emailListWidth,
    };
    setResizingPane(pane);
  };

  useEffect(() => {
    if (!resizingPane) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.startX;
      if (resizingPane === 'sidebar') {
        const rawWidth = dragStartRef.current.startWidth + deltaX;
        if (rawWidth < 115) {
          setIsSidebarCollapsed(true);
        } else {
          setIsSidebarCollapsed(false);
          const next = Math.min(460, Math.max(160, rawWidth));
          setSidebarWidth(next);
        }
      } else if (resizingPane === 'emaillist') {
        const next = Math.min(720, Math.max(240, dragStartRef.current.startWidth + deltaX));
        setEmailListWidth(next);
      }
    };

    const handleMouseUp = () => {
      setResizingPane(null);
    };

    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingPane]);

  useEffect(() => {
    try {
      localStorage.setItem('anectta_sidebar_width', String(sidebarWidth));
    } catch {}
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('anectta_sidebar_collapsed', String(isSidebarCollapsed));
    } catch {}
  }, [isSidebarCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem('anectta_emaillist_width', String(emailListWidth));
    } catch {}
  }, [emailListWidth]);
  const [emails, setEmails] = useState<EmailItem[]>(() => {
    try {
      // 0) Banco local (SQLite): carrega só os resumos — o conteúdo vem ao abrir cada e-mail
      if (isMailStoreAvailable()) {
        const json = window.electronAPI?.loadMailStoreSync?.();
        if (typeof json === 'string') {
          const fromStore = JSON.parse(json);
          if (Array.isArray(fromStore) && fromStore.length > 0) {
            // E-mails excluídos definitivamente no app não voltam (e saem do banco)
            const deleted = new Set(loadDeletedEmailIds());
            const kept = (fromStore as EmailItem[]).filter((e) => !deleted.has(e.id));
            if (kept.length < fromStore.length) {
              const removedIds = (fromStore as EmailItem[]).filter((e) => deleted.has(e.id)).map((e) => e.id);
              void window.electronAPI?.storeRemoveEmails?.(removedIds);
            }
            // Duplicados de uma mesma mensagem do servidor (só no app — nada é apagado no servidor)
            const dedup = removeServerDuplicates(kept);
            if (dedup.removedIds.length > 0) {
              void window.electronAPI?.storeRemoveEmails?.(dedup.removedIds);
            }
            if (dedup.linked.length > 0) {
              void window.electronAPI?.storeUpsertEmails?.(dedup.linked.map((e) => ({ meta: e, hasBody: false })));
            }
            return dedup.emails;
          }
          return INITIAL_EMAILS;
        }
      }
      // 1) Cache em disco antigo (só se o banco não estiver disponível)
      const diskCache = window.electronAPI?.loadMessageCacheSync?.();
      if (Array.isArray(diskCache) && diskCache.length > 0) {
        return diskCache as EmailItem[];
      }
      // 2) Migração: cache antigo no localStorage
      const cached = localStorage.getItem('anectta_mail_messages');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar mensagens em cache local:', e);
    }
    return INITIAL_EMAILS;
  });

  const emailsRef = useRef<EmailItem[]>(emails);
  emailsRef.current = emails;

  // A gravação dos e-mails em disco (cache, índice de pesquisa e cópias .pst/.mbox) fica no hook
  // useMailPersistence, mais abaixo, agrupando as mudanças para não travar o app.
  // Fallback: se o carregamento síncrono do cache não trouxe mensagens reais, tenta de forma assíncrona
  useEffect(() => {
    if (isMailStoreAvailable()) return; // com o banco, o carregamento inicial já é completo
    const isPlaceholder = (e: EmailItem) =>
      e.id.startsWith('msg-coworking-') || e.id.startsWith('msg-marco-') || e.id.startsWith('msg-anectta-');
    if (emails.some((e) => !isPlaceholder(e))) return;
    let cancelled = false;
    window.electronAPI?.loadMessageCache?.().then((cached) => {
      if (cancelled || !Array.isArray(cached) || cached.length === 0) return;
      setEmails((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev.filter((p) => !isPlaceholder(p)), ...(cached as EmailItem[]).filter((c) => !ids.has(c.id))];
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [currentFolder, setCurrentFolder] = useState<MailFolder>('inbox');
  const [folderCreateRequest] = useState(0);
  const [customFolders, setCustomFolders] = useState<CustomFolder[]>(() => {
    try {
      const saved = localStorage.getItem('anectta_mail_custom_folders_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('anectta_mail_custom_folders_v1', JSON.stringify(customFolders));
    } catch {
      // ignore
    }
  }, [customFolders]);

  // Versão sempre atual das pastas (para rotinas assíncronas como a sincronização)
  const customFoldersRef = useRef(customFolders);
  customFoldersRef.current = customFolders;

  const [favoriteFolders, setFavoriteFolders] = useState<FavoriteFolder[]>(() => {
    try {
      const saved = localStorage.getItem('anectta_mail_favorite_folders_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('anectta_mail_favorite_folders_v1', JSON.stringify(favoriteFolders));
    } catch {
      // ignore
    }
  }, [favoriteFolders]);

  const [spamSenders, setSpamSenders] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('anectta_mail_spam_senders_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('anectta_mail_spam_senders_v1', JSON.stringify(spamSenders));
    } catch {
      // ignore
    }
  }, [spamSenders]);

  // Regra automática: sempre que chegarem e-mails de remetentes marcados como Spam, move direto para Lixo Eletrônico ('junk')
  useEffect(() => {
    if (spamSenders.length === 0) return;
    const spamSet = new Set(spamSenders);
    const hasMatch = emails.some(
      (e) =>
        e.folder !== 'junk' &&
        e.folder !== 'trash' &&
        e.senderEmail &&
        spamSet.has(e.senderEmail.trim().toLowerCase())
    );
    if (!hasMatch) return;
    setEmails((prev) =>
      prev.map((e) =>
        e.folder !== 'junk' &&
        e.folder !== 'trash' &&
        e.senderEmail &&
        spamSet.has(e.senderEmail.trim().toLowerCase())
          ? { ...e, folder: 'junk' }
          : e
      )
    );
  }, [emails, spamSenders]);

  const [contacts, setContacts] = useState<CorporateContact[]>(() => {
    try {
      // Limpeza geral única: remove todos os contatos existentes (inclusive os de demonstração)
      const PURGE_FLAG = 'anectta_mail_contacts_purged_v2';
      if (!localStorage.getItem(PURGE_FLAG)) {
        localStorage.removeItem('anectta_mail_contacts_v1');
        localStorage.setItem(PURGE_FLAG, '1');
        return [];
      }
      const saved = localStorage.getItem('anectta_mail_contacts_v1');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('anectta_mail_contacts_v1', JSON.stringify(contacts));
    } catch {
      // ignore
    }
  }, [contacts]);

  const extractCleanEmail = (raw: string) => {
    const match = raw.match(/<([^>]+)>/);
    return (match ? match[1] : raw).trim().toLowerCase();
  };

  const handleAddContact = useCallback(
    (contact: Omit<CorporateContact, 'id'>) => {
      const cleanEmail = extractCleanEmail(contact.email);
      if (!cleanEmail || !cleanEmail.includes('@')) {
        showToast('Endereço de e-mail inválido para contato.');
        return;
      }
      const cleanName =
        (contact.name || '').replace(/["<>]/g, '').trim() || cleanEmail.split('@')[0];

      setContacts((prev) => {
        if (prev.some((c) => c.email.trim().toLowerCase() === cleanEmail)) {
          showToast(`ℹ️ ${cleanEmail} já está cadastrado nos Contatos.`);
          return prev;
        }
        soundService.play('pop');
        showToast(`✓ "${cleanName}" (${cleanEmail}) incluído nos Contatos!`);
        return [
          {
            ...contact,
            id: `contact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: cleanName,
            email: cleanEmail,
          },
          ...prev,
        ];
      });
    },
    []
  );

  const handleImportContacts = useCallback(
    (incoming: Array<Omit<CorporateContact, 'id'>>): number => {
      if (!incoming || incoming.length === 0) return 0;
      const existingSet = new Set(contacts.map((c) => c.email.trim().toLowerCase()));
      const additions: CorporateContact[] = [];

      for (let i = 0; i < incoming.length; i++) {
        const item = incoming[i];
        const cleanEmail = extractCleanEmail(item.email);
        if (!cleanEmail || !cleanEmail.includes('@') || existingSet.has(cleanEmail)) continue;
        existingSet.add(cleanEmail);
        additions.push({
          ...item,
          id: `contact-imp-${Date.now()}-${i}`,
          name: (item.name || '').trim() || cleanEmail.split('@')[0],
          email: cleanEmail,
        });
      }

      if (additions.length > 0) {
        setContacts((prev) => [...additions, ...prev]);
        soundService.play('pop');
        showToast(`✓ ${additions.length} contato(s) importado(s)!`);
      }
      return additions.length;
    },
    [contacts]
  );

  const handleAddContactsFromEmailIds = useCallback(
    (ids: string[]) => {
      const selectedMsgs = emails.filter((e) => ids.includes(e.id));
      let addedCount = 0;

      setContacts((prev) => {
        const existingSet = new Set(prev.map((c) => c.email.trim().toLowerCase()));
        const additions: CorporateContact[] = [];

        for (const msg of selectedMsgs) {
          if (!msg.senderEmail) continue;
          const cleanEmail = extractCleanEmail(msg.senderEmail);
          if (!cleanEmail || !cleanEmail.includes('@') || existingSet.has(cleanEmail)) continue;
          existingSet.add(cleanEmail);
          const cleanName =
            (msg.sender || '').replace(/["<>]/g, '').trim() || cleanEmail.split('@')[0];
          additions.push({
            id: `contact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: cleanName,
            email: cleanEmail,
            avatar: msg.avatar,
          });
          addedCount += 1;
        }

        if (addedCount > 0) {
          soundService.play('pop');
          showToast(`✓ ${addedCount} remetente(s) incluído(s) nos Contatos!`);
          return [...additions, ...prev];
        }
        showToast('ℹ️ Todos os remetentes selecionados já estão nos Contatos.');
        return prev;
      });
      setSelectedEmailIds([]);
    },
    [emails]
  );

  const handleUpdateContact = useCallback((updated: CorporateContact) => {
    setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    soundService.play('pop');
    showToast(`✓ Contato "${updated.name}" atualizado!`);
  }, []);

  const handleDeleteContact = useCallback(
    (id: string) => {
      const conf = {
        ...DEFAULT_CONFIRMATION_SETTINGS,
        ...(settings.notifications?.confirmations || {}),
      };
      if (conf.askBeforeDeleteContact) {
        if (!window.confirm('Deseja realmente excluir este contato?')) {
          return;
        }
      }
      setContacts((prev) => prev.filter((c) => c.id !== id));
      soundService.play('click');
      showToast('Contato removido.');
    },
    [settings.notifications?.confirmations]
  );

  const isEmailSavedAsContact = useCallback(
    (rawEmail?: string) => {
      if (!rawEmail) return false;
      const clean = extractCleanEmail(rawEmail);
      return contacts.some((c) => c.email.trim().toLowerCase() === clean);
    },
    [contacts]
  );

  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedEmailIds, setSelectedEmailIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeAccountId, setComposeAccountId] = useState<string | undefined>(undefined);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'account' | 'appearance' | 'security'>('account');
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [rules, setRules] = useState<MailRule[]>(() => loadMailRules());
  const [isAnimationPreviewOpen, setIsAnimationPreviewOpen] = useState(false);

  // O assistente de conexão de contas somente deve aparecer automaticamente no primeiro lançamento pós-instalação.
  // Em qualquer inicialização posterior, a tela NÃO reaparece, abrindo diretamente na Caixa de Entrada.
  // Ela só é aberta novamente quando o usuário solicitar explicitamente adicionar uma nova conta.
  const [isFirstRunSetup, setIsFirstRunSetup] = useState<boolean>(() => {
    try {
      if (localStorage.getItem('anectta_first_run_done') === 'true') return false;
      if (localStorage.getItem('anectta_setup_completed') === 'true') return false;
      return true;
    } catch {
      return false;
    }
  });

  const [isSetupWizardOpen, setIsSetupWizardOpen] = useState<boolean>(() => {
    try {
      if (localStorage.getItem('anectta_first_run_done') === 'true') return false;
      if (localStorage.getItem('anectta_setup_completed') === 'true') return false;
      return true;
    } catch {
      return false;
    }
  });

  // Validação de persistência física em disco (%APPDATA%\anectta-mail\setup_state.json e settings.json)
  useEffect(() => {
    if (window.electronAPI?.getSetupCompleted) {
      window.electronAPI.getSetupCompleted().then((completed: boolean) => {
        if (completed) {
          localStorage.setItem('anectta_first_run_done', 'true');
          localStorage.setItem('anectta_setup_completed', 'true');
          setIsFirstRunSetup(false);
          setIsSetupWizardOpen(false);
        }
      });
    }

    if (window.electronAPI?.loadAppSettings) {
      window.electronAPI.loadAppSettings().then((res) => {
        if (res?.success && res.settings) {
          const diskSettings = res.settings as AppSettings;
          setSettings((current) => {
            if (!hasConfiguredAccounts(current) && hasConfiguredAccounts(diskSettings)) {
              saveSettingsLocal(diskSettings);
              return { ...DEFAULT_SETTINGS, ...diskSettings };
            }
            return current;
          });
        } else {
          setSettings((current) => {
            if (hasConfiguredAccounts(current)) {
              window.electronAPI?.saveAppSettings?.(current);
            }
            return current;
          });
        }
      }).catch(() => {});
    }
  }, []);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClosingSync, setIsClosingSync] = useState(false);
  const syncInFlightRef = useRef(false);
  const syncInFlightSilentRef = useRef(false);
  const syncInFlightBackgroundRef = useRef(false);
  const syncManualRequestedRef = useRef(false);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const closingInProgressRef = useRef(false);
  const lastFocusSyncRef = useRef(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [accountQuotas, setAccountQuotas] = useState<Record<string, { usedBytes: number; limitBytes: number }>>(() => {
    try {
      const saved = localStorage.getItem('anectta_mail_quotas');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('anectta_mail_quotas', JSON.stringify(accountQuotas));
    } catch {
      // ignore
    }
  }, [accountQuotas]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const getAccountImapConfig = async (accountId: string) => {
    const acc = settings.accounts.find((a) => a.id === accountId);
    if (!acc) return null;
    const incoming = acc.incomingServer;
    const protocol = incoming?.protocol || 'imap';
    if (protocol !== 'imap') return null;
    const host = incoming?.host;
    const user = incoming?.username || acc.email;
    const password = incoming?.password || acc.password || '';
    const accessToken = await ensureFreshAccessToken(acc);
    if (!host || !user || (!password && !accessToken)) return null;
    return {
      protocol: 'imap' as const,
      host,
      port: incoming?.port || 993,
      secure: incoming?.security !== 'none',
      user,
      pass: password,
      accessToken,
    };
  };

  const handleCreateFolder = (name: string, accountId: string, parentFolder?: MailFolder) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const exists = customFolders.some(
      (f) =>
        f.accountId === accountId &&
        (f.parentFolder || 'root') === (parentFolder || 'root') &&
        f.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (exists) {
      showToast(`A pasta "${cleanName}" já existe neste local.`);
      return;
    }
    const siblingCount = customFolders.filter(
      (f) => f.accountId === accountId && (f.parentFolder || 'root') === (parentFolder || 'root')
    ).length;
    const newFolderId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newFolder: CustomFolder = {
      id: newFolderId,
      name: cleanName,
      accountId,
      parentFolder,
      order: siblingCount,
      createdAt: new Date().toISOString(),
    };
    setCustomFolders((prev) => [...prev, newFolder]);
    setCurrentFolder(newFolder.id);
    soundService.play('pop');
    showToast(`✓ Pasta "${cleanName}" criada com sucesso!`);

    if (window.electronAPI?.createImapFolder) {
      const parentCustom = parentFolder
        ? customFolders.find((f) => f.id === parentFolder && f.accountId === accountId)
        : undefined;
      const parentFolderOrPath = parentCustom?.imapPath || parentFolder;
      getAccountImapConfig(accountId).then((imapConfig) => {
        if (!imapConfig) return;
        window.electronAPI
          ?.createImapFolder?.(imapConfig, cleanName, parentFolderOrPath)
          .then((res) => {
            if (res?.success && res.imapPath) {
              setCustomFolders((prev) =>
                prev.map((f) => (f.id === newFolderId ? { ...f, imapPath: res.imapPath } : f))
              );
            }
          })
          .catch(() => {});
      });
    }
  };

  const handleRenameFolder = (folderId: string, newName: string) => {
    const cleanName = newName.trim();
    if (!cleanName) return;
    const target = customFolders.find((f) => f.id === folderId);
    setCustomFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: cleanName } : f))
    );
    setFavoriteFolders((prev) =>
      prev.map((fav) => (fav.folderId === folderId ? { ...fav, label: cleanName } : fav))
    );
    soundService.play('click');
    showToast(`✓ Pasta renomeada para "${cleanName}".`);

    if (target?.imapPath && window.electronAPI?.renameImapFolder) {
      getAccountImapConfig(target.accountId).then((imapConfig) => {
        if (!imapConfig) return;
        window.electronAPI
          ?.renameImapFolder?.(imapConfig, target.imapPath!, cleanName)
          .then((res) => {
            if (res?.success && res.imapPath) {
              setCustomFolders((prev) =>
                prev.map((f) => (f.id === folderId ? { ...f, imapPath: res.imapPath } : f))
              );
            }
          })
          .catch(() => {});
      });
    }
  };

  const handleCopyFolder = (folderId: string) => {
    const source = customFolders.find((f) => f.id === folderId);
    if (!source) return;
    const copyName = `${source.name} (Cópia)`;
    const newFolderId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const copiedFolder: CustomFolder = {
      ...source,
      id: newFolderId,
      name: copyName,
      order: (source.order ?? 0) + 1,
      createdAt: new Date().toISOString(),
    };
    setCustomFolders((prev) => [...prev, copiedFolder]);
    setEmails((prev) => {
      const folderEmails = prev.filter(
        (e) => e.folder === folderId && (!e.accountId || e.accountId === source.accountId)
      );
      const cloned = folderEmails.map((e, idx) => ({
        ...e,
        id: `${e.id}-copy-${Date.now()}-${idx}`,
        folder: newFolderId as MailFolder,
      }));
      return [...cloned, ...prev];
    });
    soundService.play('pop');
    showToast(`✓ Pasta "${copyName}" copiada.`);
  };

  const handleMoveFolder = (folderId: string, newParentFolder?: MailFolder) => {
    if (folderId === newParentFolder) return;
    const conf = {
      ...DEFAULT_CONFIRMATION_SETTINGS,
      ...(settings.notifications?.confirmations || {}),
    };
    if (conf.askBeforeDragDropFolder) {
      if (!window.confirm('Deseja realmente mover esta pasta?')) {
        return;
      }
    }
    setCustomFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, parentFolder: newParentFolder } : f))
    );
    soundService.play('click');
    showToast('✓ Pasta movida com sucesso.');
  };

  const handleDeleteFolder = (folderId: string) => {
    const target = customFolders.find((f) => f.id === folderId);
    const conf = {
      ...DEFAULT_CONFIRMATION_SETTINGS,
      ...(settings.notifications?.confirmations || {}),
    };
    if (conf.askBeforeDeleteFolder) {
      if (
        !window.confirm(
          `Deseja realmente excluir a pasta "${target?.name || folderId}"?`
        )
      ) {
        return;
      }
    }
    // Coleta recursivamente a pasta e todas as suas subpastas
    const idsToRemove = new Set<string>([folderId]);
    let added = true;
    while (added) {
      added = false;
      for (const f of customFolders) {
        if (f.parentFolder && idsToRemove.has(f.parentFolder) && !idsToRemove.has(f.id)) {
          idsToRemove.add(f.id);
          added = true;
        }
      }
    }
    setCustomFolders((prev) => prev.filter((f) => !idsToRemove.has(f.id)));
    setFavoriteFolders((prev) => prev.filter((fav) => !idsToRemove.has(fav.folderId)));
    setEmails((prev) =>
      prev.map((e) => (idsToRemove.has(e.folder) ? { ...e, folder: 'inbox' } : e))
    );
    if (idsToRemove.has(currentFolder)) {
      setCurrentFolder('inbox');
    }
    if (target) {
      showToast(`Pasta "${target.name}" removida (e-mails movidos para Caixa de Entrada).`);
      if (target.imapPath && window.electronAPI?.deleteImapFolder) {
        getAccountImapConfig(target.accountId).then((imapConfig) => {
          if (!imapConfig) return;
          window.electronAPI?.deleteImapFolder?.(imapConfig, target.imapPath!).catch(() => {});
        });
      }
    }
  };

  const handleMarkAllAsRead = (accountId: string, folderId: MailFolder) => {
    const targetAcc = settings.accounts.find((a) => a.id === accountId) || currentAccount;
    setEmails((prev) =>
      prev.map((e) =>
        e.folder === folderId && isEmailForAccount(e, targetAcc) ? { ...e, isRead: true } : e
      )
    );
    soundService.play('pop');
    showToast('✓ Todas as mensagens da pasta marcadas como lidas.');
  };

  const isEmailInCurrentView = useCallback(
    (item: EmailItem) => {
      if (currentFolder === 'favorites') {
        return item.folder !== 'trash' && item.folder !== 'junk' && Boolean(item.isStarred);
      }
      if (currentFolder === 'tasks') {
        return item.folder !== 'trash' && item.folder !== 'junk' && Boolean(item.isTask);
      }
      if (currentFolder === 'reading_list') {
        return item.folder !== 'trash' && item.folder !== 'junk' && Boolean(item.isReadingList);
      }
      if (currentFolder === 'important') {
        return item.folder !== 'trash' && item.folder !== 'junk' && Boolean(item.isImportant);
      }
      return item.folder === currentFolder;
    },
    [currentFolder]
  );

  const handleMarkCurrentFolderAllAsRead = () => {
    setEmails((prev) =>
      prev.map((e) =>
        isEmailInCurrentView(e) && (isUnifiedView || isEmailForAccount(e, currentAccount))
          ? { ...e, isRead: true }
          : e
      )
    );
    soundService.play('pop');
    showToast('✓ Todas as mensagens da pasta marcadas como lidas.');
  };

  const handleEmptyFolder = (accountId: string, folderId: MailFolder) => {
    const targetAcc = settings.accounts.find((a) => a.id === accountId) || currentAccount;
    const isPermanent = folderId === 'trash' || folderId === 'junk';
    const conf = {
      ...DEFAULT_CONFIRMATION_SETTINGS,
      ...(settings.notifications?.confirmations || {}),
    };
    if (folderId === 'trash' && conf.askBeforeEmptyTrash) {
      if (!window.confirm('Deseja realmente esvaziar a Lixeira permanentemente?')) {
        return;
      }
    } else if (isPermanent && conf.askBeforePermanentDeleteMessages) {
      if (!window.confirm('Deseja realmente apagar as mensagens desta pasta de uma vez por todas?')) {
        return;
      }
    } else if (!isPermanent && conf.askBeforeDeleteMessage) {
      if (!window.confirm('Deseja realmente mover todas as mensagens desta pasta para a Lixeira?')) {
        return;
      }
    }
    if (isPermanent) {
      // Esvaziar Lixeira/Spam: exclusão definitiva também no servidor (IMAP) e sem "ressuscitar"
      // na próxima sincronização
      const removed = emailsRef.current.filter(
        (e) => e.folder === folderId && isEmailForAccount(e, targetAcc)
      );
      if (removed.length > 0) {
        rememberDeletedEmailIds(removed.map((e) => e.id));
        imapServerSyncRef.current?.queueServerDeletes(removed);
      }
    }
    setEmails((prev) => {
      if (isPermanent) {
        return prev.filter((e) => !(e.folder === folderId && isEmailForAccount(e, targetAcc)));
      }
      return prev.map((e) =>
        e.folder === folderId && isEmailForAccount(e, targetAcc) ? { ...e, folder: 'trash' } : e
      );
    });
    soundService.play('click');
    showToast(
      isPermanent
        ? '✓ Pasta esvaziada permanentemente.'
        : '✓ Mensagens da pasta movidas para Itens Excluídos.'
    );
  };

  const handleSortSubfolders = (accountId: string, parentFolder?: MailFolder) => {
    const parentKey = parentFolder || 'root';
    setCustomFolders((prev) => {
      const siblings = prev
        .filter((f) => f.accountId === accountId && (f.parentFolder || 'root') === parentKey)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
      const orderMap = new Map(siblings.map((s, idx) => [s.id, idx]));
      return prev.map((f) => (orderMap.has(f.id) ? { ...f, order: orderMap.get(f.id)! } : f));
    });
    soundService.play('click');
    showToast('✓ Subpastas classificadas de A a Z.');
  };

  const handleReorderFolder = (folderId: string, direction: 'up' | 'down') => {
    const target = customFolders.find((f) => f.id === folderId);
    if (!target) return;
    const parentKey = target.parentFolder || 'root';
    const siblings = customFolders
      .filter((f) => f.accountId === target.accountId && (f.parentFolder || 'root') === parentKey)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = siblings.findIndex((s) => s.id === folderId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const orderMap = new Map(reordered.map((s, i) => [s.id, i]));
    setCustomFolders((prev) =>
      prev.map((f) => (orderMap.has(f.id) ? { ...f, order: orderMap.get(f.id)! } : f))
    );
    soundService.play('click');
  };

  const handleToggleFavoriteFolder = (accountId: string, folderId: MailFolder, label: string) => {
    setFavoriteFolders((prev) => {
      const exists = prev.some((f) => f.accountId === accountId && f.folderId === folderId);
      if (exists) {
        showToast(`"${label}" removido dos Favoritos.`);
        return prev.filter((f) => !(f.accountId === accountId && f.folderId === folderId));
      }
      showToast(`✓ "${label}" adicionado aos Favoritos.`);
      return [...prev, { accountId, folderId, label }];
    });
    soundService.play('pop');
  };

  const handleMoveToFolder = (emailId: string, targetFolder: MailFolder) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, folder: targetFolder } : e))
    );
    const folderLabel =
      targetFolder === 'inbox'
        ? 'Caixa de Entrada'
        : targetFolder === 'archive'
        ? 'Arquivados'
        : targetFolder === 'junk'
        ? 'Spam / Lixo'
        : customFolders.find((f) => f.id === targetFolder)?.name || targetFolder;
    soundService.play('click');
    showToast(`✓ E-mail movido para "${folderLabel}".`);
  };

  const [groupByThread, setGroupByThread] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('anectta_group_by_thread_v1');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  // Abas de E-mail (múltiplos e-mails abertos simultaneamente)
  const [openEmailTabIds, setOpenEmailTabIds] = useState<string[]>([]);
  const [activeTabEmailId, setActiveTabEmailId] = useState<string | null>(null);

  const handleToggleGroupByThread = () => {
    setGroupByThread((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('anectta_group_by_thread_v1', String(next));
      } catch {}
      showToast(next ? '💬 Conversas agrupadas em threads ativado.' : '📄 Visualização em mensagens individuais.');
      return next;
    });
  };

  const [composeDraftId, setComposeDraftId] = useState<string | undefined>(undefined);
  const [composeDefaults, setComposeDefaults] = useState<{
    recipient: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body?: string;
    bodyHtml?: string;
    inReplyTo?: string;
    references?: string[];
  }>({
    recipient: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    bodyHtml: '',
  });

  // Undo Send (8s) + Agendamento de Envio (Send Later)
  type OutgoingEmailPayload = {
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
    inReplyTo?: string;
    references?: string[];
    icalEvent?: { method: string; content: string; filename?: string };
  };
  type ScheduledEmailItem = {
    id: string;
    scheduledAt: number;
    payload: OutgoingEmailPayload;
  };
  const [pendingUndoSend, setPendingUndoSend] = useState<{
    payload: OutgoingEmailPayload;
    secondsLeft: number;
  } | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmailItem[]>(() => {
    try {
      const saved = localStorage.getItem('anectta_scheduled_emails_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('anectta_scheduled_emails_v1', JSON.stringify(scheduledEmails));
    } catch {}
  }, [scheduledEmails]);

  // ==========================================
  // Fila Offline Inteligente (Outbox Persistente)
  // ==========================================
  type OfflineOutboxItem = {
    id: string;
    queuedAt: number;
    retries: number;
    lastError?: string;
    payload: OutgoingEmailPayload;
  };
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isFlushingOutbox, setIsFlushingOutbox] = useState(false);
  const [serverFolderTotals, setServerFolderTotals] = useState<Record<string, number>>({});
  // Sincronização app → servidor (IMAP): preenchida mais abaixo pelo hook useImapServerSync
  const imapServerSyncRef = useRef<ReturnType<typeof useImapServerSync> | null>(null);
  // Download completo automático: iniciado ao fim de cada sincronização (hook useMailBackfill, mais abaixo)
  const startBackfillRef = useRef<() => void>(() => {});
  const [offlineOutboxQueue, setOfflineOutboxQueue] = useState<OfflineOutboxItem[]>(() => {
    try {
      const saved = localStorage.getItem('anectta_offline_outbox_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  const offlineOutboxRef = useRef<OfflineOutboxItem[]>(offlineOutboxQueue);
  offlineOutboxRef.current = offlineOutboxQueue;

  useEffect(() => {
    try {
      localStorage.setItem('anectta_offline_outbox_v1', JSON.stringify(offlineOutboxQueue));
    } catch {}
  }, [offlineOutboxQueue]);

  // Restaura visualmente itens pendentes da Fila Offline na pasta Caixa de Saída ao iniciar o app
  useEffect(() => {
    if (offlineOutboxQueue.length === 0) return;
    setEmails((prev) => {
      const existingIds = new Set(prev.map((e) => e.id));
      const missing: EmailItem[] = [];
      for (const item of offlineOutboxQueue) {
        if (existingIds.has(item.id)) continue;
        const acc =
          (item.payload.fromAccountId && settings.accounts?.find((a) => a.id === item.payload.fromAccountId)) ||
          settings.accounts?.[0] ||
          settings.account;
        missing.push({
          id: item.id,
          accountId: acc?.id,
          sender: acc?.displayName || acc?.email || 'Você',
          senderEmail: acc?.email || '',
          avatar: acc?.avatar || '',
          recipient: item.payload.recipient,
          cc: item.payload.cc || undefined,
          bcc: item.payload.bcc || undefined,
          subject: `[Fila Offline] ${item.payload.subject}`,
          snippet: item.payload.body.slice(0, 90),
          body: item.payload.body,
          bodyHtml: item.payload.html,
          timestamp: new Date(item.queuedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          dateStr: new Date(item.queuedAt).toISOString(),
          period: 'today',
          folder: 'outbox',
          priority: item.payload.priority,
          isRead: true,
          tags: ['Fila Offline', 'Aguardando conexão'],
        });
      }
      return missing.length > 0 ? [...missing, ...prev] : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emailListRef = useRef<EmailListRef>(null);

  // Resolução da conta corporativa ativa a partir de accounts
  const currentAccount = useMemo<AccountSettings>(() => {
    if (settings.accounts && settings.accounts.length > 0) {
      const found = settings.accounts.find((a) => a.id === settings.activeAccountId);
      if (found) return found;
      return settings.accounts[0];
    }
    return settings.account || DEFAULT_SETTINGS.account;
  }, [settings.accounts, settings.activeAccountId, settings.account]);

  // Active corporate user profile from settings
  const activeAccount: UserAccount = useMemo(() => ({
    name: currentAccount.displayName || currentAccount.email || 'Usuário',
    email: currentAccount.email || 'Não configurado',
    role: currentAccount.role || 'Usuário',
    avatar: currentAccount.avatar || '',
    status: 'online',
  }), [currentAccount]);

  // Helper para verificar se um e-mail pertence estritamente a uma conta específica
  const isEmailForAccount = useCallback(
    (m: EmailItem, acc: AccountSettings) => {
      if (!acc) return false;
      const accEmailLower = (acc.email || '').toLowerCase().trim();
      if (!accEmailLower) return false;

      const recipientLower = (m.recipient || '').toLowerCase().trim();
      const senderLower = (m.senderEmail || '').toLowerCase().trim();

      // 1. Se a mensagem possui accountId explícito
      if (m.accountId) {
        if (m.accountId !== acc.id) {
          return false;
        }
        // Validação de segurança: se o destinatário/remetente pertencer comprovadamente a outra conta configurada
        const belongsToOther = settings.accounts?.some(
          (other) =>
            other.id !== acc.id &&
            other.email &&
            (recipientLower.includes(other.email.toLowerCase().trim()) ||
              senderLower === other.email.toLowerCase().trim())
        );
        if (belongsToOther && !recipientLower.includes(accEmailLower) && senderLower !== accEmailLower) {
          return false;
        }
        return true;
      }

      // 2. Se não possui accountId explícito: valida estritamente pelo endereço da conta
      return recipientLower.includes(accEmailLower) || senderLower === accEmailLower;
    },
    [settings.accounts]
  );

  // Gravações em disco agrupadas: cache do app (5–30 s), índice de pesquisa (só o que mudou) e
  // cópias .pst/.mbox em Documentos\Arquivos do Anectta MAIL (só contas alteradas, a cada 10 min)
  const mailPersistence = useMailPersistence({
    emails,
    setEmails,
    accounts: settings.accounts && settings.accounts.length > 0 ? settings.accounts : [currentAccount],
    isEmailForAccount,
  });
  const mailPersistenceRef = useRef(mailPersistence);
  mailPersistenceRef.current = mailPersistence;

  // Dynamic Taskbar / Dock Badge Counter
  useEffect(() => {
    const badgeEnabled = settings.notifications?.unreadBadgeEnabled ?? true;
    const unreadCount = badgeEnabled
      ? emails.filter((e) => !e.isRead && e.folder === 'inbox').length
      : 0;
    if (window.electronAPI?.setBadgeCount) {
      window.electronAPI.setBadgeCount(unreadCount);
    }
  }, [emails, settings.notifications?.unreadBadgeEnabled]);

  useEffect(() => {
    soundService.setNotificationPreset(settings.notifications?.notificationSound || 'theme');
  }, [settings.notifications?.notificationSound]);

  const ensureFreshAccessToken = useCallback(
    async (acc: AccountSettings): Promise<string | undefined> => {
      if (acc.authType !== 'oauth2' || !acc.oauthAccessToken) {
        return undefined;
      }
      const needsRefresh =
        Boolean(acc.oauthExpiresAt) &&
        Date.now() > (acc.oauthExpiresAt || 0) - 120000 &&
        Boolean(acc.oauthRefreshToken) &&
        Boolean(acc.oauthProvider);

      if (!needsRefresh || !window.electronAPI?.refreshOAuthToken || !acc.oauthProvider || !acc.oauthRefreshToken) {
        return acc.oauthAccessToken;
      }

      try {
        const refreshed = await window.electronAPI.refreshOAuthToken({
          provider: acc.oauthProvider,
          refreshToken: acc.oauthRefreshToken,
          clientId: acc.oauthClientId,
        });
        if (refreshed.success && refreshed.accessToken) {
          setSettings((prev) => {
            const updatedAccounts = prev.accounts.map((a) =>
              a.id === acc.id
                ? {
                    ...a,
                    oauthAccessToken: refreshed.accessToken,
                    oauthRefreshToken: refreshed.refreshToken || a.oauthRefreshToken,
                    oauthExpiresAt: refreshed.expiresAt || a.oauthExpiresAt,
                  }
                : a
            );
            const nextSettings: AppSettings = {
              ...prev,
              accounts: updatedAccounts,
              account:
                prev.account?.id === acc.id
                  ? {
                      ...prev.account,
                      oauthAccessToken: refreshed.accessToken,
                      oauthRefreshToken: refreshed.refreshToken || prev.account.oauthRefreshToken,
                      oauthExpiresAt: refreshed.expiresAt || prev.account.oauthExpiresAt,
                    }
                  : prev.account,
            };
            persistSettings(nextSettings);
            return nextSettings;
          });
          return refreshed.accessToken;
        }
      } catch {
        // fallback to existing token
      }
      return acc.oauthAccessToken;
    },
    []
  );

  const handleSyncCloudCalendar = useCallback(async (): Promise<string> => {
    if (!window.electronAPI?.syncCloudCalendar) {
      return 'Sincronização em nuvem disponível apenas no aplicativo desktop.';
    }

    const connectedIds = settings.calendar?.connectedAccountIds || [];
    const oauthAccounts = (settings.accounts || []).filter((acc) => {
      const isOAuth =
        acc.authType === 'oauth2' &&
        (acc.oauthProvider === 'google' || acc.oauthProvider === 'microsoft') &&
        Boolean(acc.oauthAccessToken || acc.oauthRefreshToken);
      if (!isOAuth) return false;
      if (connectedIds.length > 0 && !connectedIds.includes(acc.id)) return false;
      return true;
    });

    const caldavSources = (settings.calendar?.davSources || []).filter(
      (src) => src.syncCalendar && Boolean(src.caldavUrl?.trim())
    );

    if (oauthAccounts.length === 0 && caldavSources.length === 0) {
      return 'Nenhuma conta Google/Microsoft OAuth ou servidor CalDAV configurado. Adicione em Configurações → Calendário.';
    }

    const fetchedEvents: any[] = [];
    const errors: string[] = [];

    for (const acc of oauthAccounts) {
      try {
        const accessToken = await ensureFreshAccessToken(acc);
        if (!accessToken || !acc.oauthProvider) {
          errors.push(`${acc.email}: token OAuth indisponível`);
          continue;
        }
        const res = await window.electronAPI.syncCloudCalendar({
          provider: acc.oauthProvider,
          accessToken,
          sourceLabel: acc.displayName || acc.email,
        });
        if (res.success && Array.isArray(res.events)) {
          fetchedEvents.push(...res.events);
        } else if (res.error) {
          errors.push(`${acc.email}: ${res.error}`);
        }
      } catch (err: any) {
        errors.push(`${acc.email}: ${err?.message || 'erro desconhecido'}`);
      }
    }

    for (const src of caldavSources) {
      try {
        const res = await window.electronAPI.syncCloudCalendar({
          provider: 'caldav',
          caldavUrl: src.caldavUrl,
          username: src.username,
          password: src.password,
          sourceLabel: src.name,
        });
        if (res.success && Array.isArray(res.events)) {
          fetchedEvents.push(...res.events);
        } else if (res.error) {
          errors.push(`${src.name}: ${res.error}`);
        }
      } catch (err: any) {
        errors.push(`${src.name}: ${err?.message || 'erro desconhecido'}`);
      }
    }

    let added = 0;
    let updated = 0;
    if (fetchedEvents.length > 0) {
      try {
        const key = 'anectta_mail_calendar_events_v1';
        const raw = localStorage.getItem(key);
        const existing: any[] = raw ? JSON.parse(raw) : [];
        const byId = new Map<string, any>();
        for (const ev of existing) {
          if (ev?.id) byId.set(String(ev.id), ev);
        }
        for (const ev of fetchedEvents) {
          if (!ev?.id) continue;
          if (byId.has(String(ev.id))) {
            updated++;
          } else {
            added++;
          }
          byId.set(String(ev.id), ev);
        }
        const merged = Array.from(byId.values());
        localStorage.setItem(key, JSON.stringify(merged));
        window.dispatchEvent(new Event('anectta:calendar-updated'));
        soundService.play('pop');
      } catch {
        // ignore storage parse errors
      }
    }

    if (errors.length > 0 && fetchedEvents.length === 0) {
      const msg = `Falha na sincronização: ${errors[0]}`;
      showToast(msg);
      return msg;
    }

    const summary =
      errors.length > 0
        ? `Nuvem sincronizada: ${added} novo(s), ${updated} atualizado(s) (${errors.length} aviso(s)).`
        : `Nuvem sincronizada: ${added} novo(s), ${updated} atualizado(s).`;
    showToast(`✓ ${summary}`);
    return summary;
  }, [settings.accounts, settings.calendar, ensureFreshAccessToken]);

  const handlePushCalendarEventToCloud = useCallback(
    async (event: any): Promise<void> => {
      if (!window.electronAPI?.pushCloudCalendarEvent) return;

      const connectedIds = settings.calendar?.connectedAccountIds || [];
      const oauthAcc = (settings.accounts || []).find((acc) => {
        const isOAuth =
          acc.authType === 'oauth2' &&
          (acc.oauthProvider === 'google' || acc.oauthProvider === 'microsoft') &&
          Boolean(acc.oauthAccessToken || acc.oauthRefreshToken);
        if (!isOAuth) return false;
        if (connectedIds.length > 0 && !connectedIds.includes(acc.id)) return false;
        return true;
      });

      if (oauthAcc && oauthAcc.oauthProvider) {
        try {
          const accessToken = await ensureFreshAccessToken(oauthAcc);
          if (accessToken) {
            const res = await window.electronAPI.pushCloudCalendarEvent({
              provider: oauthAcc.oauthProvider,
              accessToken,
              event,
            });
            if (res.success) {
              showToast(`☁️ Compromisso enviado para ${oauthAcc.oauthProvider === 'google' ? 'Google Calendar' : 'Microsoft 365'}.`);
            }
          }
        } catch {
          // ignore background push error
        }
        return;
      }

      const caldavSrc = (settings.calendar?.davSources || []).find(
        (src) => src.syncCalendar && Boolean(src.caldavUrl?.trim())
      );
      if (caldavSrc?.caldavUrl) {
        try {
          const res = await window.electronAPI.pushCloudCalendarEvent({
            provider: 'caldav',
            caldavUrl: caldavSrc.caldavUrl,
            username: caldavSrc.username,
            password: caldavSrc.password,
            event,
          });
          if (res.success) {
            showToast(`☁️ Compromisso enviado para CalDAV (${caldavSrc.name}).`);
          }
        } catch {
          // ignore background push error
        }
      }
    },
    [settings.accounts, settings.calendar, ensureFreshAccessToken]
  );

  const handleUpdateCalendarEventInCloud = useCallback(
    async (event: any): Promise<void> => {
      if (!window.electronAPI?.updateCloudCalendarEvent || !event?.id) return;
      const evId = String(event.id);
      const isGoogle = evId.startsWith('google-');
      const isMs = evId.startsWith('ms-');
      const isCaldav = evId.startsWith('caldav-');

      if (isGoogle || isMs) {
        const targetProvider = isGoogle ? 'google' : 'microsoft';
        const acc = (settings.accounts || []).find(
          (a) => a.authType === 'oauth2' && a.oauthProvider === targetProvider && (a.oauthAccessToken || a.oauthRefreshToken)
        );
        if (!acc) return;
        const accessToken = await ensureFreshAccessToken(acc);
        if (!accessToken) return;
        const res = await window.electronAPI.updateCloudCalendarEvent({
          provider: targetProvider,
          accessToken,
          remoteId: evId,
          event,
        });
        if (res.success) {
          showToast(`☁️ Compromisso atualizado em ${isGoogle ? 'Google Calendar' : 'Microsoft 365'}.`);
        }
        return;
      }

      if (isCaldav) {
        const src = (settings.calendar?.davSources || []).find((s) => s.syncCalendar && s.caldavUrl);
        if (!src?.caldavUrl) return;
        const res = await window.electronAPI.updateCloudCalendarEvent({
          provider: 'caldav',
          caldavUrl: src.caldavUrl,
          username: src.username,
          password: src.password,
          remoteId: evId,
          event,
        });
        if (res.success) {
          showToast(`☁️ Compromisso atualizado no CalDAV (${src.name}).`);
        }
      }
    },
    [settings.accounts, settings.calendar, ensureFreshAccessToken]
  );

  const handleDeleteCalendarEventInCloud = useCallback(
    async (event: any): Promise<void> => {
      if (!window.electronAPI?.deleteCloudCalendarEvent || !event?.id) return;
      const evId = String(event.id);
      const isGoogle = evId.startsWith('google-');
      const isMs = evId.startsWith('ms-');
      const isCaldav = evId.startsWith('caldav-');

      if (isGoogle || isMs) {
        const targetProvider = isGoogle ? 'google' : 'microsoft';
        const acc = (settings.accounts || []).find(
          (a) => a.authType === 'oauth2' && a.oauthProvider === targetProvider && (a.oauthAccessToken || a.oauthRefreshToken)
        );
        if (!acc) return;
        const accessToken = await ensureFreshAccessToken(acc);
        if (!accessToken) return;
        const res = await window.electronAPI.deleteCloudCalendarEvent({
          provider: targetProvider,
          accessToken,
          remoteId: evId,
        });
        if (res.success) {
          showToast(`☁️ Compromisso removido de ${isGoogle ? 'Google Calendar' : 'Microsoft 365'}.`);
        }
        return;
      }

      if (isCaldav) {
        const src = (settings.calendar?.davSources || []).find((s) => s.syncCalendar && s.caldavUrl);
        if (!src?.caldavUrl) return;
        const res = await window.electronAPI.deleteCloudCalendarEvent({
          provider: 'caldav',
          caldavUrl: src.caldavUrl,
          username: src.username,
          password: src.password,
          remoteId: evId,
        });
        if (res.success) {
          showToast(`☁️ Compromisso removido do CalDAV (${src.name}).`);
        }
      }
    },
    [settings.accounts, settings.calendar, ensureFreshAccessToken]
  );

  const handleSyncCloudContacts = useCallback(async (): Promise<string> => {
    if (!window.electronAPI?.syncCloudContacts) {
      return 'Sincronização em nuvem disponível apenas no aplicativo desktop.';
    }

    const oauthAccounts = (settings.accounts || []).filter(
      (acc) =>
        acc.authType === 'oauth2' &&
        (acc.oauthProvider === 'google' || acc.oauthProvider === 'microsoft') &&
        Boolean(acc.oauthAccessToken || acc.oauthRefreshToken)
    );

    const carddavSources = (settings.calendar?.davSources || []).filter(
      (src) => src.syncContacts && Boolean(src.carddavUrl?.trim())
    );

    if (oauthAccounts.length === 0 && carddavSources.length === 0) {
      return 'Nenhuma conta Google/Microsoft OAuth ou servidor CardDAV configurado. Adicione em Configurações → Calendário.';
    }

    const fetchedContacts: Array<Omit<CorporateContact, 'id'>> = [];
    const errors: string[] = [];

    for (const acc of oauthAccounts) {
      try {
        const accessToken = await ensureFreshAccessToken(acc);
        if (!accessToken || !acc.oauthProvider) {
          errors.push(`${acc.email}: token OAuth indisponível`);
          continue;
        }
        const res = await window.electronAPI.syncCloudContacts({
          provider: acc.oauthProvider,
          accessToken,
          sourceLabel: acc.displayName || acc.email,
        });
        if (res.success && Array.isArray(res.contacts)) {
          fetchedContacts.push(...res.contacts);
        } else if (res.error) {
          errors.push(`${acc.email}: ${res.error}`);
        }
      } catch (err: any) {
        errors.push(`${acc.email}: ${err?.message || 'erro desconhecido'}`);
      }
    }

    for (const src of carddavSources) {
      try {
        const res = await window.electronAPI.syncCloudContacts({
          provider: 'carddav',
          carddavUrl: src.carddavUrl,
          username: src.username,
          password: src.password,
          sourceLabel: src.name,
        });
        if (res.success && Array.isArray(res.contacts)) {
          fetchedContacts.push(...res.contacts);
        } else if (res.error) {
          errors.push(`${src.name}: ${res.error}`);
        }
      } catch (err: any) {
        errors.push(`${src.name}: ${err?.message || 'erro desconhecido'}`);
      }
    }

    if (errors.length > 0 && fetchedContacts.length === 0) {
      const msg = `Falha na sincronização: ${errors[0]}`;
      showToast(msg);
      return msg;
    }

    const addedCount = handleImportContacts(fetchedContacts);
    const summary =
      addedCount > 0
        ? `Sincronização concluída: ${addedCount} novo(s) contato(s) de ${fetchedContacts.length} encontrado(s).`
        : `Sincronização concluída: ${fetchedContacts.length} contato(s) verificado(s), nenhum novo para adicionar.`;
    if (addedCount === 0) {
      showToast(`✓ ${summary}`);
    }
    return summary;
  }, [settings.accounts, settings.calendar, ensureFreshAccessToken, handleImportContacts]);

  // Sincronização Automática Bidirecional em Segundo Plano (Nuvem V2)
  useEffect(() => {
    if (!settings.calendar?.autoSyncCloudEnabled) return;
    const intervalMin = settings.calendar?.autoSyncCloudIntervalMinutes || 15;
    const intervalMs = Math.max(5, intervalMin) * 60 * 1000;
    const timer = window.setInterval(() => {
      void handleSyncCloudCalendar().catch(() => {});
      if (settings.calendar?.syncCloudContactsAuto ?? true) {
        void handleSyncCloudContacts().catch(() => {});
      }
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [
    settings.calendar?.autoSyncCloudEnabled,
    settings.calendar?.autoSyncCloudIntervalMinutes,
    settings.calendar?.syncCloudContactsAuto,
    handleSyncCloudCalendar,
    handleSyncCloudContacts,
  ]);

  // ==========================================
  // Painel Lateral Mini-CRM + Notas Privadas
  // ==========================================
  const [isContactContextOpen, setIsContactContextOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('anectta_crm_sidebar_open') === '1';
    } catch {
      return false;
    }
  });

  const handleToggleContactContext = useCallback(() => {
    setIsContactContextOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('anectta_crm_sidebar_open', next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // ==========================================
  // Módulo de Tarefas / To-Do Integrado
  // ==========================================
  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    try {
      const saved = localStorage.getItem('anectta_tasks_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('anectta_tasks_v1', JSON.stringify(tasks));
    } catch {
      // ignore
    }
  }, [tasks]);

  const handleAddTask = useCallback((task: Omit<TaskItem, 'id' | 'createdAt'>) => {
    const item: TaskItem = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    setTasks((prev) => [item, ...prev]);
    soundService.play('pop');
    showToast(`✓ Tarefa "${item.title}" adicionada.`);
  }, []);

  const handleUpdateTask = useCallback((id: string, updates: Partial<TaskItem>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const handleDeleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    showToast('Tarefa removida.');
  }, []);

  const handleCreateTaskFromEmail = useCallback((email: EmailItem) => {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const dueDate = tomorrow.toISOString().slice(0, 10);
    const created: TaskItem = {
      id: `task-em-${Date.now()}`,
      title: email.subject || '(Sem assunto)',
      description: `De: ${email.sender} (${email.senderEmail}) — ${(email.snippet || '').slice(0, 140)}`,
      status: 'todo',
      priority: email.priority || 'medium',
      dueDate,
      dueTime: '09:00',
      sourceEmailId: email.id,
      sourceEmailSubject: email.subject,
      sourceEmailSender: email.sender,
      createdAt: new Date().toISOString(),
    };
    setTasks((prev) => [created, ...prev]);
    setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, isTask: true } : e)));
    soundService.play('pop');
    showToast(`✓ E-mail convertido em tarefa! Veja no módulo Tarefas.`);
  }, []);

  const handleSyncTaskToCalendar = useCallback((task: TaskItem) => {
    try {
      const key = 'anectta_mail_calendar_events_v1';
      const raw = localStorage.getItem(key);
      const existing: any[] = raw ? JSON.parse(raw) : [];
      const dateStr = task.dueDate || new Date().toISOString().slice(0, 10);
      const startTime = task.dueTime || '09:00';
      const [h, m] = startTime.split(':').map((n) => parseInt(n, 10) || 0);
      const endHour = String(Math.min(23, h + 1)).padStart(2, '0');
      const endTime = `${endHour}:${String(m).padStart(2, '0')}`;
      const calEvent = {
        id: `cal-task-${task.id}`,
        title: `[Tarefa] ${task.title}`,
        date: dateStr,
        endDate: dateStr,
        allDay: false,
        startTime,
        endTime,
        organizer: 'Tarefas Anectta',
        participants: [],
        location: 'Tarefa / Pendência',
        badge: 'Tarefa',
        calendarId: 'default',
        color: task.priority === 'high' ? 'rose' : 'indigo',
        description: task.description,
      };
      const filtered = existing.filter((e) => e.id !== calEvent.id);
      localStorage.setItem(key, JSON.stringify([...filtered, calEvent]));
      window.dispatchEvent(new Event('anectta:calendar-updated'));
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, syncedToCalendar: true } : t)));
      soundService.play('pop');
      showToast(`📅 Prazo da tarefa "${task.title}" adicionado ao Calendário.`);
    } catch {
      showToast('Não foi possível sincronizar a tarefa com o Calendário.');
    }
  }, []);

  // ==========================================
  // Snooze com Data/Hora + Lembrete de Follow-up
  // ==========================================
  const handleSnoozeWithTime = useCallback((id: string, untilMs: number, label: string) => {
    setEmails((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              folder: 'snooze' as MailFolder,
              snoozedUntil: untilMs,
            }
          : e
      )
    );
    soundService.play('pop');
    showToast(`⏰ E-mail adiado até ${label}.`);
  }, []);

  const handleSetFollowUp = useCallback((id: string, followUpAtMs: number, label: string) => {
    setEmails((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              followUpAt: followUpAtMs,
            }
          : e
      )
    );
    soundService.play('pop');
    showToast(`🔔 Lembrete de follow-up agendado (${label}).`);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      let wokeCount = 0;
      let followUpSubject: string | null = null;

      setEmails((prev) => {
        let changed = false;
        const next = prev.map((e) => {
          if (e.folder === 'snooze' && e.snoozedUntil && e.snoozedUntil <= now) {
            changed = true;
            wokeCount++;
            return {
              ...e,
              folder: 'inbox' as MailFolder,
              isRead: false,
              snoozedUntil: undefined,
              period: 'today' as const,
            };
          }
          if (e.followUpAt && e.followUpAt <= now) {
            changed = true;
            followUpSubject = e.subject || '(Sem assunto)';
            return {
              ...e,
              followUpAt: undefined,
              isImportant: true,
            };
          }
          return e;
        });
        return changed ? next : prev;
      });

      if (wokeCount > 0) {
        soundService.play('pop');
        showToast(`⏰ ${wokeCount} e-mail(s) adiado(s) retornaram para a Caixa de Entrada.`);
      }
      if (followUpSubject) {
        soundService.play('pop');
        showToast(`🔔 Lembrete de Follow-up: "${followUpSubject}"`);
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, []);

  // ==========================================
  // Cancelar Inscrição 1-Clique (List-Unsubscribe)
  // ==========================================
  const handleUnsubscribeEmail = useCallback(async (email: EmailItem) => {
    const info = parseUnsubscribeInfo(email);
    if (!info) {
      showToast('Este e-mail não possui link de descadastro identificável.');
      return;
    }

    if (info.supportsOneClickPost && info.httpUrl && window.electronAPI?.oneClickUnsubscribe) {
      const res = await window.electronAPI.oneClickUnsubscribe(info.httpUrl);
      if (res.success) {
        soundService.play('pop');
        showToast(`✓ Inscrição cancelada automaticamente em 1 clique (${email.sender}).`);
        return;
      }
    }

    if (info.mailto) {
      try {
        await dispatchEmailNowRef.current({
          recipient: info.mailto,
          subject: info.mailtoSubject || 'Unsubscribe',
          body: 'Unsubscribe',
          priority: 'low',
          fromAccountId: email.accountId,
        });
        soundService.play('pop');
        showToast(`✓ Solicitação de descadastro enviada para ${info.mailto}.`);
        return;
      } catch {
        // fallback to httpUrl
      }
    }

    if (info.httpUrl) {
      if (window.electronAPI?.openExternal) {
        await window.electronAPI.openExternal(info.httpUrl);
      } else {
        window.open(info.httpUrl, '_blank', 'noopener,noreferrer');
      }
      showToast('🔗 Página de cancelamento de inscrição aberta no navegador.');
    }
  }, []);

  // Sync with real IMAP server (multi-folder) or POP3 across all configured accounts
  const handleSyncAll = useCallback(async (opts?: { silent?: boolean; background?: boolean }) => {
    const silent = opts?.silent === true;
    const hideFeedback = silent || opts?.background === true;
    const allAccounts =
      settings.accounts && settings.accounts.length > 0 ? settings.accounts : [currentAccount];

    if (syncInFlightRef.current) {
      if (hideFeedback) {
        return syncPromiseRef.current ?? undefined;
      }
      // Clique manual enquanto uma sincronização em segundo plano já está em andamento:
      // sinaliza requisição manual para que o finally em segundo plano não desligue isSyncing prematuramente.
      const wasSilent = syncInFlightSilentRef.current;
      syncManualRequestedRef.current = true;
      setIsSyncing(true);
      showToast(`Sincronizando ${allAccounts.length} conta(s) configurada(s)...`);
      try {
        await syncPromiseRef.current;
      } catch {
        // segue para tentar sincronização completa se necessário
      }
      if (!wasSilent) {
        syncManualRequestedRef.current = false;
        setIsSyncing(false);
        showToast('✓ Sincronização concluída.');
        return;
      }
      if (syncInFlightRef.current) {
        return syncPromiseRef.current ?? undefined;
      }
    }

    syncInFlightRef.current = true;
    syncInFlightSilentRef.current = silent;
    syncInFlightBackgroundRef.current = hideFeedback;
    if (!hideFeedback) {
      syncManualRequestedRef.current = false;
      setIsSyncing(true);
    }

    if (!hideFeedback) showToast(`Sincronizando ${allAccounts.length} conta(s) configurada(s)...`);

    // A recuperação automática traz até 300 mensagens novas por pasta em cada sincronização;
    // se ainda faltar, agenda outra sincronização em segundo plano até completar.
    let needsCatchUpFollowUp = false;
    // E-mails novos que chegaram nesta sincronização (para o aviso de novo e-mail)
    const newArrivals: EmailItem[] = [];
    const collectNewArrivals = (acc: AccountSettings, incoming: EmailItem[]) => {
      const current = emailsRef.current;
      const existingIds = new Set(current.map((e) => e.id));
      const accountHadMail = current.some((e) => e.accountId === acc.id);
      newArrivals.push(...pickNewArrivals(incoming, existingIds, { accountHadMail, accountEmail: acc.email }));
    };

    const run = (async () => {
    try {
      let totalSynced = 0;
      let syncedAccounts = 0;
      const syncErrors: string[] = [];

      for (const acc of allAccounts) {
        const incoming = acc.incomingServer;
        const protocol = (incoming?.protocol || 'imap').toLowerCase();
        const host = incoming?.host;
        const password = incoming?.password || acc.password || '';
        const user = incoming?.username || acc.email;
        const accessToken = await ensureFreshAccessToken(acc);
        const hasCredentials = Boolean(host && user && (password || accessToken));

        if (!hasCredentials) continue;
        syncedAccounts++;

        if (protocol === 'imap' && window.electronAPI?.syncAllRealFolders) {
          const knownUidsByFolder: Record<string, number[]> = {};
          const addKnown = (loc: { folderKey: string; uid: number } | null) => {
            if (!loc) return;
            if (!knownUidsByFolder[loc.folderKey]) knownUidsByFolder[loc.folderKey] = [];
            knownUidsByFolder[loc.folderKey].push(loc.uid);
          };
          // E-mails no app (pela localização ATUAL no servidor) + apagados definitivamente
          for (const e of emailsRef.current) {
            if (e.accountId === acc.id) addKnown(getImapLocation(e));
          }
          for (const deletedId of loadDeletedEmailIds()) {
            addKnown(parseImapLocationFromId(deletedId, acc.id));
          }

          const res = await window.electronAPI.syncAllRealFolders({
            protocol: 'imap',
            host: host,
            port: incoming.port || 993,
            secure: incoming.security !== 'none',
            user: user,
            pass: password,
            accessToken,
            inboxOnly: silent,
            knownUidsByFolder,
          } as any);

          if (res.catchUpPending && Object.keys(res.catchUpPending).length > 0) {
            needsCatchUpFollowUp = true;
          }

          // Servidor → app: e-mails apagados ou movidos no webmail/celular/outro cliente saem do app
          // (os movidos reaparecem pela sincronização da pasta de destino)
          if (res.success && res.vanished && Object.keys(res.vanished).length > 0) {
            const vanishedKeys = new Set<string>();
            for (const [folderKey, uids] of Object.entries(res.vanished)) {
              for (const uid of uids) vanishedKeys.add(`${folderKey}#${uid}`);
            }
            // Excluídos no app que o servidor também já não tem: saem da lista de excluídos
            forgetDeletedEmailIds(
              Object.entries(res.vanished).flatMap(([folderKey, uids]) =>
                uids.map((uid) => imapServerKey(acc.id, { folderKey, uid }))
              )
            );
            setEmails((prev) => {
              const next = prev.filter((e) => {
                if (e.accountId !== acc.id) return true;
                const loc = getImapLocation(e);
                return !(loc && vanishedKeys.has(`${loc.folderKey}#${loc.uid}`));
              });
              return next.length === prev.length ? prev : next;
            });
          }

          if (res.quota) {
            setAccountQuotas((prev) => ({
              ...prev,
              [acc.id]: res.quota!,
            }));
          }

          if (res.serverTotals) {
            setServerFolderTotals((prev) => {
              const next = { ...prev };
              for (const [fKey, totalNum] of Object.entries(res.serverTotals!)) {
                if (typeof totalNum === 'number') {
                  next[`${acc.id}:${fKey}`] = totalNum;
                }
              }
              return next;
            });
          }

          // Servidor → app: pastas apagadas no webmail/celular saem do app, com os e-mails delas
          if (res.success && Array.isArray(res.serverFolderPaths)) {
            const deleted = findFoldersDeletedOnServer(customFoldersRef.current, acc.id, res.serverFolderPaths);
            if (deleted.ids.size > 0) {
              const ids = deleted.ids;
              setCustomFolders((prev) => prev.filter((f) => !ids.has(f.id)));
              setFavoriteFolders((prev) => prev.filter((fav) => !ids.has(fav.folderId)));
              setEmails((prev) => {
                const next = prev.filter((e) => !(e.accountId === acc.id && ids.has(e.folder)));
                return next.length === prev.length ? prev : next;
              });
              setCurrentFolder((cur) => (ids.has(cur) ? 'inbox' : cur));
              const names = customFoldersRef.current.filter((f) => ids.has(f.id)).map((f) => f.name);
              void window.electronAPI?.logImapSync?.(
                `servidor→app ${acc.email}: pasta(s) apagada(s) no servidor removida(s) do app: ${names.join(', ')}`
              );
            } else if (deleted.blocked) {
              void window.electronAPI?.logImapSync?.(
                `servidor→app ${acc.email}: lista de pastas do servidor parece incompleta — nenhuma pasta removida`
              );
            }
          }

          const imapFolderKeyToId = new Map<string, string>();
          if (res.success && Array.isArray(res.customFolders) && res.customFolders.length > 0) {
            const discovered = res.customFolders;
            const pathToId = new Map<string, string>();
            for (const cf of discovered) {
              const existingMatch = customFolders.find(
                (f) =>
                  f.accountId === acc.id &&
                  (f.imapPath === cf.imapPath ||
                    (!f.imapPath && f.name.toLowerCase() === cf.name.toLowerCase()))
              );
              const resolvedId = existingMatch?.id || `imap-${acc.id}-${cf.imapPath}`;
              pathToId.set(cf.imapPath, resolvedId);
              imapFolderKeyToId.set(`imap:${cf.imapPath}`, resolvedId);
            }

            setCustomFolders((prev) => {
              const next = [...prev];
              for (const cf of discovered) {
                const resolvedId = pathToId.get(cf.imapPath)!;
                const parentFolder: MailFolder | undefined = cf.parentSystemFolder
                  ? (cf.parentSystemFolder as MailFolder)
                  : cf.parentImapPath
                  ? pathToId.get(cf.parentImapPath)
                  : undefined;

                const idx = next.findIndex((f) => f.id === resolvedId);
                if (idx >= 0) {
                  next[idx] = {
                    ...next[idx],
                    name: cf.name,
                    imapPath: cf.imapPath,
                    parentFolder: next[idx].parentFolder || parentFolder,
                  };
                } else {
                  next.push({
                    id: resolvedId,
                    name: cf.name,
                    accountId: acc.id,
                    parentFolder,
                    imapPath: cf.imapPath,
                    order: next.filter((f) => f.accountId === acc.id).length,
                    createdAt: new Date().toISOString(),
                  });
                }
              }
              return next;
            });
          }

          if (!res.success && res.error) {
            syncErrors.push(`${acc.email}: ${res.error}`);
          }

          const flagUpdates = (res as any).flagUpdates as
            | Array<{ id: string; isRead: boolean; isStarred: boolean }>
            | undefined;

          if (res.success && ((res.emails && res.emails.length > 0) || (flagUpdates && flagUpdates.length > 0))) {
            const taggedEmails: EmailItem[] = (res.emails || []).map((m) => ({
              ...m,
              id: m.id.startsWith(`${acc.id}-`) ? m.id : `${acc.id}-${m.id}`,
              accountId: acc.id,
              folder: (imapFolderKeyToId.get(m.folder) || m.folder) as MailFolder,
            }));
            totalSynced += taggedEmails.length;
            collectNewArrivals(acc, taggedEmails);

            // Mensagens movidas no servidor pelo app têm id antigo + imapLocation: mapeia a chave do
            // servidor para o id local, para lido/estrela vindos do servidor chegarem nelas também
            const serverKeyToLocalId = new Map<string, string>();
            for (const e of emailsRef.current) {
              if (e.accountId === acc.id && e.imapLocation) {
                serverKeyToLocalId.set(imapServerKey(acc.id, e.imapLocation), e.id);
              }
            }
            const flagMap = new Map<string, { isRead: boolean; isStarred: boolean }>();
            if (flagUpdates) {
              for (const fu of flagUpdates) {
                const fullId = fu.id.startsWith(`${acc.id}-`) ? fu.id : `${acc.id}-${fu.id}`;
                flagMap.set(serverKeyToLocalId.get(fullId) || fullId, { isRead: fu.isRead, isStarred: fu.isStarred });
              }
              // Estado vindo do servidor não deve ser reenviado ao servidor
              imapServerSyncRef.current?.acknowledgeServerFlags(
                Array.from(flagMap, ([id, f]) => ({ id, isRead: f.isRead, isStarred: f.isStarred }))
              );
            }

            setEmails((prevState) => {
              let prev = prevState;
              let incomingEmails = taggedEmails;
              // Enviados: a cópia baixada do servidor corresponde ao e-mail que o app já guardou
              // localmente ao enviar (mesmo Message-ID) → vincula em vez de duplicar
              const localSentByMessageId = new Map<string, string>();
              for (const p of prev) {
                if (p.accountId === acc.id && p.folder === 'sent' && p.messageIdHeader && !getImapLocation(p)) {
                  localSentByMessageId.set(p.messageIdHeader.trim(), p.id);
                }
              }
              const linkedSent = new Map<string, { folderKey: string; uid: number }>();
              if (localSentByMessageId.size > 0) {
                incomingEmails = incomingEmails.filter((m) => {
                  const localId = m.messageIdHeader ? localSentByMessageId.get(m.messageIdHeader.trim()) : undefined;
                  const loc = localId ? getImapLocation(m) : null;
                  if (localId && loc) {
                    linkedSent.set(localId, loc);
                    return false;
                  }
                  return true;
                });
              }
              if (linkedSent.size > 0) {
                prev = prev.map((p) => {
                  const loc = linkedSent.get(p.id);
                  return loc ? { ...p, imapLocation: loc } : p;
                });
              }

              const existingIds = new Set(prev.map((p) => p.id));
              const newOnlyIds = new Set(
                incomingEmails
                  .filter((m) => !existingIds.has(m.id) && m.folder === 'inbox')
                  .map((m) => m.id)
              );
              const { emails: ruledIncoming } =
                newOnlyIds.size > 0
                  ? applyRulesToEmails(incomingEmails, rules, newOnlyIds)
                  : { emails: incomingEmails };

              const incomingMap = new Map(ruledIncoming.map((m) => [m.id, m]));
              const realPrev = prev.filter(
                (p) =>
                  !p.id.startsWith('msg-coworking-') &&
                  !p.id.startsWith('msg-marco-') &&
                  !p.id.startsWith('msg-anectta-')
              );
              let flagsChanged = false;
              const updated = realPrev
                .filter((p) => !incomingMap.has(p.id))
                .map((p) => {
                  const fu = flagMap.get(p.id);
                  if (fu && (p.isRead !== fu.isRead || Boolean(p.isStarred) !== fu.isStarred)) {
                    flagsChanged = true;
                    return { ...p, isRead: fu.isRead, isStarred: fu.isStarred };
                  }
                  return p;
                });

              if (ruledIncoming.length === 0 && !flagsChanged && realPrev.length === prev.length) {
                return linkedSent.size > 0 ? prev : prevState;
              }

              const combined = [...ruledIncoming, ...updated];
              combined.sort((a, b) => getEmailTimestampMs(b) - getEmailTimestampMs(a));
              return combined;
            });
          }
        } else if (window.electronAPI?.fetchRealInbox) {
          const accPop3Prefix = `${acc.id}-`;
          const knownPop3Ids = [
            ...emailsRef.current
              .filter((e) => e.accountId === acc.id && e.id.includes('pop3-'))
              .map((e) => e.id),
            // Excluídos definitivamente no app não voltam
            ...loadDeletedEmailIds().filter((id) => id.startsWith(accPop3Prefix) && id.includes('pop3-')),
          ].map((id) => (id.startsWith(accPop3Prefix) ? id.slice(accPop3Prefix.length) : id));

          const res = await window.electronAPI.fetchRealInbox({
            protocol: protocol as any,
            host: host,
            port: incoming.port || 995,
            secure: incoming.security !== 'none',
            user: user,
            pass: password,
            accessToken,
            leaveOnServer: incoming.leaveOnServer ?? true,
            knownPop3Ids,
            pop3BatchLimit: 200,
          });

          if (typeof res.serverTotal === 'number') {
            setServerFolderTotals((prev) => ({
              ...prev,
              [`${acc.id}:inbox`]: res.serverTotal!,
            }));
          }

          if (res.quota) {
            setAccountQuotas((prev) => ({
              ...prev,
              [acc.id]: res.quota!,
            }));
          }

          if (!res.success && res.error) {
            syncErrors.push(`${acc.email}: ${res.error}`);
          }

          if (res.success && res.emails && res.emails.length > 0) {
            const taggedEmails: EmailItem[] = res.emails.map((m) => ({
              ...m,
              id: m.id.startsWith(`${acc.id}-`) ? m.id : `${acc.id}-${m.id}`,
              accountId: acc.id,
            }));
            totalSynced += taggedEmails.length;
            collectNewArrivals(acc, taggedEmails);

            setEmails((prev) => {
              const existingIds = new Set(prev.map((p) => p.id));
              const newOnlyIds = new Set(
                taggedEmails
                  .filter((m) => !existingIds.has(m.id) && m.folder === 'inbox')
                  .map((m) => m.id)
              );
              const { emails: ruledIncoming } =
                newOnlyIds.size > 0
                  ? applyRulesToEmails(taggedEmails, rules, newOnlyIds)
                  : { emails: taggedEmails };

              const incomingIds = new Set(ruledIncoming.map((m) => m.id));
              const realPrev = prev.filter(
                (p) =>
                  !p.id.startsWith('msg-coworking-') &&
                  !p.id.startsWith('msg-marco-') &&
                  !p.id.startsWith('msg-anectta-')
              );
              // O POP3 só devolve as mensagens NOVAS: as que o app já tem continuam (inclusive na Entrada)
              const keepOthers = realPrev.filter((p) => !incomingIds.has(p.id));
              const combined = [...ruledIncoming, ...keepOthers];
              combined.sort((a, b) => getEmailTimestampMs(b) - getEmailTimestampMs(a));
              return combined;
            });
          }
        }
      }

      if (!hideFeedback) {
        if (syncErrors.length > 0 && totalSynced === 0) {
          showToast(`Aviso na sincronização: ${syncErrors[0]}`);
        } else if (syncedAccounts === 0) {
          showToast('Nenhuma conta configurada com credenciais de recebimento.');
        } else if (totalSynced > 0) {
          showToast(`✓ Sincronização concluída! ${totalSynced} mensagens atualizadas nas contas.`);
        } else {
          showToast('✓ Sincronização concluída.');
        }
      }
    } catch (err: any) {
      if (!hideFeedback) showToast(`Aviso: ${err.message || 'Verifique as credenciais do servidor'}`);
    } finally {
      syncInFlightRef.current = false;
      syncInFlightSilentRef.current = false;
      syncInFlightBackgroundRef.current = false;
      syncPromiseRef.current = null;
      if (!hideFeedback && !syncManualRequestedRef.current) {
        setIsSyncing(false);
      }
      if (needsCatchUpFollowUp) {
        setTimeout(() => {
          void handleSyncAllRef.current({ background: true });
        }, 3000);
      }
      // Baixa tudo o que ainda falta (todas as pastas). Retoma também após um Cancelar.
      // Pequena espera para as pastas descobertas nesta sincronização já estarem no estado.
      setTimeout(() => startBackfillRef.current(), 1500);
      // Aviso de novo e-mail (depois das regras e do filtro de spam do app terem rodado)
      if (newArrivals.length > 0) {
        setTimeout(() => notifyNewMailRef.current(newArrivals), 800);
      }
    }
    })();

    syncPromiseRef.current = run;
    return run;
  }, [settings.accounts, currentAccount, rules]);

  const handleSaveRules = (nextRules: MailRule[]) => {
    setRules(nextRules);
    saveMailRules(nextRules);
    showToast('✓ Regras automáticas salvas!');
  };

  const handleRunRulesNow = async () => {
    const conf = {
      ...DEFAULT_CONFIRMATION_SETTINGS,
      ...(settings.notifications?.confirmations || {}),
    };
    if (conf.askBeforeApplyRuleOnMessages) {
      if (!window.confirm('Deseja aplicar as regras ativas nas mensagens da Caixa de Entrada agora?')) {
        return;
      }
    }
    const inboxIds = new Set(emails.filter((e) => e.folder === 'inbox').map((e) => e.id));
    if (inboxIds.size === 0) {
      showToast('Nenhuma mensagem na Caixa de Entrada para processar.');
      return;
    }
    // Regras que olham o texto do e-mail precisam do conteúdo, que pode estar só no banco
    const currentEmails = emailsRef.current;
    const needBody = currentEmails.filter((e) => inboxIds.has(e.id) && isBodyStripped(e)).map((e) => e.id);
    const loadedBodies: Record<string, { body?: string; bodyHtml?: string }> = {};
    if (needBody.length > 0 && window.electronAPI?.storeGetBodies) {
      showToast(`Preparando ${needBody.length} mensagem(ns) para as regras...`);
      for (let i = 0; i < needBody.length; i += 500) {
        try {
          Object.assign(loadedBodies, await window.electronAPI.storeGetBodies(needBody.slice(i, i + 500)));
        } catch {}
      }
    }
    const originals = new Map(currentEmails.map((e) => [e.id, e]));
    const hydratedById = new Map<string, EmailItem>();
    const input = currentEmails.map((e) => {
      const b = loadedBodies[e.id];
      if (!b) return e;
      const h = { ...e, body: b.body ?? '', bodyHtml: b.bodyHtml } as EmailItem;
      hydratedById.set(e.id, h);
      return h;
    });
    const { emails: ruled, affectedCount } = applyRulesToEmails(input, rules, inboxIds);
    // Devolve à memória só os resumos (o conteúdo continua no banco)
    const nextEmails = ruled.map((r) => {
      const h = hydratedById.get(r.id);
      if (!h) return r;
      if (r === h) return originals.get(r.id) || r;
      const { body: _b, bodyHtml: _h, ...rest } = r;
      return rest as EmailItem;
    });
    setEmails(nextEmails);
    if (affectedCount > 0) {
      showToast(`✓ Regras aplicadas em ${affectedCount} mensagem(ns)!`);
    } else {
      showToast('Nenhuma mensagem da Caixa de Entrada correspondeu às regras ativas.');
    }
  };

  // Sincronização automática silenciosa na inicialização (aproveita o tempo da tela de abertura)
  useEffect(() => {
    const incoming = currentAccount.incomingServer;
    const hasCredentials = Boolean(
      incoming?.host &&
      (incoming?.password || currentAccount.password || currentAccount.oauthAccessToken)
    );

    if (hasCredentials && (incoming?.checkOnStartup ?? true)) {
      const timer = setTimeout(async () => {
        await handleSyncAll({ silent: true, background: true }); // rápido: só Caixa de Entrada, invisível
        void handleSyncAll({ silent: false, background: true }); // completo: todas as pastas em segundo plano
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [currentAccount.id, handleSyncAll]);

  // Verificação periódica automática de novos e-mails.
  // Respeita o intervalo configurado na conta (em minutos, entre 1 e 120).
  useEffect(() => {
    const configured = Number(currentAccount.incomingServer?.checkEveryMinutes);
    const minutes = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 120) : 1;
    const intervalMs = Math.max(1, minutes) * 60 * 1000;

    const hasCreds = () => {
      const incoming = currentAccount.incomingServer;
      return Boolean(incoming?.host && (incoming?.password || currentAccount.password || incoming?.username));
    };

    const interval = setInterval(() => {
      if (hasCreds()) handleSyncAll({ silent: true });
    }, intervalMs);

    // Sincroniza ao voltar o foco para a janela (throttle de 15s)
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocusSyncRef.current < 15000) return;
      lastFocusSyncRef.current = now;
      if (hasCreds()) handleSyncAll({ silent: true });
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [currentAccount.id, currentAccount.incomingServer?.checkEveryMinutes, handleSyncAll]);
  // IMAP IDLE (push): o servidor avisa na hora quando chega mensagem nova.
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.startImapIdle || !api?.onNewMail) return;
    let cancelled = false;

    const startAll = async () => {
      const allAccounts =
        settings.accounts && settings.accounts.length > 0 ? settings.accounts : [currentAccount];
      for (const acc of allAccounts) {
        const incoming = acc.incomingServer;
        if ((incoming?.protocol || 'imap').toLowerCase() !== 'imap' || !incoming?.host) continue;
        const password = incoming.password || acc.password || '';
        const user = incoming.username || acc.email;
        try {
          const accessToken = await ensureFreshAccessToken(acc);
          if (cancelled || !user || !(password || accessToken)) continue;
          await api.startImapIdle({
            protocol: 'imap',
            host: incoming.host,
            port: incoming.port || 993,
            secure: incoming.security !== 'none',
            user,
            pass: password,
            accessToken,
          });
        } catch {
          // falha silenciosa: o polling de 60s continua como fallback
        }
      }
    };
    void startAll();
    // Reforça periodicamente (renova token OAuth e reativa conexões caídas)
    const renew = setInterval(() => void startAll(), 10 * 60 * 1000);

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const off = api.onNewMail(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => handleSyncAll({ silent: true }), 1000);
    });

    return () => {
      cancelled = true;
      clearInterval(renew);
      if (debounce) clearTimeout(debounce);
      off?.();
    };
  }, [settings.accounts, currentAccount.id, handleSyncAll]);
  // Save settings handler (salva e dispara sincronização imediata)
  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    persistSettings(newSettings);
    showToast('Configurações salvas! Sincronizando com o servidor...');
    setTimeout(() => {
      handleSyncAll();
    }, 300);
  };

  const handleAccountConnectedFromWizard = (newAccount: AccountSettings) => {
    const existingAccounts = settings.accounts && settings.accounts.length > 0 ? [...settings.accounts] : [];
    const filtered = existingAccounts.filter(
      (a) => a.email.toLowerCase() !== newAccount.email.toLowerCase() && a.id !== 'acc-1'
    );
    const updatedAccounts = [newAccount, ...filtered];
    const updatedSettings: AppSettings = {
      ...settings,
      accounts: updatedAccounts,
      activeAccountId: newAccount.id,
      account: newAccount,
    };
    handleSaveSettings(updatedSettings);
    localStorage.setItem('anectta_first_run_done', 'true');
    localStorage.setItem('anectta_setup_completed', 'true');
    window.electronAPI?.setSetupCompleted?.();
    setIsFirstRunSetup(false);
    setIsSetupWizardOpen(false);
    setSelectedEmailId(null);
    setSearchQuery('');
    showToast(`✓ Conta ${newAccount.email} conectada com sucesso!`);
    soundService.play('send');
  };

  const handleCloseWizard = () => {
    localStorage.setItem('anectta_first_run_done', 'true');
    localStorage.setItem('anectta_setup_completed', 'true');
    window.electronAPI?.setSetupCompleted?.();
    setIsFirstRunSetup(false);
    setIsSetupWizardOpen(false);
    showToast('Pronto! O aplicativo abrirá sempre na Caixa de Entrada.');
  };

  // Switch active account com sincronização estrita de e-mails selecionados
  const handleSelectAccount = (accountId: string) => {
    if (accountId === '__unified__') {
      const updatedSettings: AppSettings = {
        ...settings,
        activeAccountId: '__unified__',
      };
      setSettings(updatedSettings);
      persistSettings(updatedSettings);
      const available = emails.filter((e) => e.folder === currentFolder);
      setSelectedEmailId(available.length > 0 ? available[0].id : null);
      setSearchQuery('');
      showToast('Caixa Unificada: exibindo mensagens de todas as contas');
      return;
    }

    const acc = settings.accounts.find((a) => a.id === accountId);
    if (!acc) return;
    const updatedSettings: AppSettings = {
      ...settings,
      activeAccountId: accountId,
      account: acc,
    };
    setSettings(updatedSettings);
    persistSettings(updatedSettings);
    const available = emails.filter((e) => e.folder === currentFolder && isEmailForAccount(e, acc));
    setSelectedEmailId(available.length > 0 ? available[0].id : null);
    setSearchQuery('');
    showToast(`Conta ativa: ${acc.email} (${(acc.incomingServer.protocol || 'imap').toUpperCase()})`);
  };

  // Reordena a posição das contas quando o usuário clica, segura e arrasta com o mouse
  const handleReorderAccounts = useCallback((reorderedAccounts: AccountSettings[]) => {
    setSettings((prev) => {
      const updated: AppSettings = {
        ...prev,
        accounts: reorderedAccounts,
      };
      persistSettings(updated);
      return updated;
    });
  }, []);

  // Unread counters for active account
  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {
      inbox: 0,
      sent: 0,
      drafts: 0,
      archive: 0,
      snooze: 0,
      trash: 0,
      junk: 0,
      outbox: 0,
      search_folders: 0,
    };
    emails.forEach((email) => {
      if (isEmailForAccount(email, currentAccount) && !email.isRead && counts[email.folder] !== undefined) {
        counts[email.folder] += 1;
      }
    });
    return counts;
  }, [emails, currentAccount, isEmailForAccount]);

  // Total counters per folder for active account
  const folderTotalCounts = useMemo(() => {
    const counts: Record<string, number> = {
      inbox: 0,
      sent: 0,
      drafts: 0,
      archive: 0,
      snooze: 0,
      trash: 0,
      junk: 0,
      outbox: 0,
      search_folders: 0,
    };
    emails.forEach((email) => {
      if (isEmailForAccount(email, currentAccount) && counts[email.folder] !== undefined) {
        counts[email.folder] += 1;
      }
    });
    return counts;
  }, [emails, currentAccount, isEmailForAccount]);

  const isUnifiedView = settings.activeAccountId === '__unified__';


  // Emails na pasta selecionada ou na busca estritamente restrita à conta marcada (ou unificada)
  const currentFolderEmails = useMemo(() => {
    const accountEmails = isUnifiedView
      ? emails
      : emails.filter((item) => isEmailForAccount(item, currentAccount));
    const target = searchQuery.trim()
      ? accountEmails
      : accountEmails.filter((item) => isEmailInCurrentView(item));

    // Ordenação estrita: mais recentes primeiro (hora do dia decrescente)
    return [...target].sort((a, b) => getEmailTimestampMs(b) - getEmailTimestampMs(a));
  }, [emails, currentFolder, currentAccount, isEmailForAccount, searchQuery, isUnifiedView, isEmailInCurrentView]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'anectta_download_external_avatars',
        String(settings.security.downloadExternalAvatars ?? true)
      );
    } catch {}
  }, [settings.security.downloadExternalAvatars]);

  const handleQuickPrivacyChange = useCallback(
    (
      key: 'blockExternalImages' | 'blockTrackingPixels' | 'blockBlockedSenders',
      value: boolean
    ) => {
      soundService.play('click');
      setSettings((prev) => {
        const updated: AppSettings = {
          ...prev,
          security: {
            ...prev.security,
            [key]: value,
          },
        };
        persistSettings(updated);
        return updated;
      });
      const labelMap: Record<typeof key, string> = {
        blockExternalImages: 'Bloqueio de imagens remotas',
        blockTrackingPixels: 'Bloqueio de pixels de rastreamento',
        blockBlockedSenders: 'Bloqueio de remetentes',
      };
      showToast(`🛡️ ${labelMap[key]}: ${value ? 'Ativado' : 'Desativado'}`);
    },
    []
  );

  // Automaticamente move para Spam mensagens de remetentes bloqueados quando ativado
  useEffect(() => {
    if (!settings.security.blockBlockedSenders) return;
    const blocked = (settings.security.blockedSenders || []).map((b) => b.trim().toLowerCase()).filter(Boolean);
    if (blocked.length === 0) return;

    setEmails((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.folder === 'junk' || item.folder === 'trash' || item.folder === 'sent' || item.folder === 'drafts') {
          return item;
        }
        const sender = (item.senderEmail || '').trim().toLowerCase();
        const isBlocked = blocked.some((rule) =>
          rule.startsWith('@') ? sender.endsWith(rule) : sender === rule
        );
        if (isBlocked) {
          changed = true;
          return { ...item, folder: 'junk' as MailFolder };
        }
        return item;
      });
      return changed ? next : prev;
    });
  }, [settings.security.blockBlockedSenders, settings.security.blockedSenders, emails.length]);

  // Active email (estritamente pertencente à conta ativa ou unificada)
  const selectedEmail = useMemo(() => {
    if (!selectedEmailId) return null;
    const item = emails.find((e) => e.id === selectedEmailId);
    if (item && (isUnifiedView || isEmailForAccount(item, currentAccount))) {
      return item;
    }
    return null;
  }, [emails, selectedEmailId, currentAccount, isEmailForAccount, isUnifiedView]);

  const openEmailTabs = useMemo(
    () =>
      openEmailTabIds
        .map((id) => emails.find((e) => e.id === id))
        .filter((e): e is EmailItem => Boolean(e)),
    [openEmailTabIds, emails]
  );

  const displayedEmail = useMemo(() => {
    if (activeTabEmailId) {
      const tabEmail = emails.find((e) => e.id === activeTabEmailId);
      if (tabEmail) return tabEmail;
    }
    return selectedEmail;
  }, [activeTabEmailId, emails, selectedEmail]);

  // Tela de leitura: e-mail e conversa com o conteúdo carregado do banco (só o que está aberto)
  const displayedThreadMessages = useMemo(
    () => (groupByThread && displayedEmail ? getThreadMessagesForEmail(displayedEmail, emails) : undefined),
    [groupByThread, displayedEmail, emails]
  );
  const hydratedReader = useHydratedEmails([displayedEmail, ...(displayedThreadMessages || [])]);
  const readerEmail = (hydratedReader[0] ?? null) as EmailItem | null;
  const readerThreadMessages = displayedThreadMessages
    ? (hydratedReader.slice(1) as EmailItem[])
    : undefined;

  const handleOpenEmailInTab = useCallback(
    (emailId: string) => {
      if (!emailId) return;
      setEmails((prev) =>
        prev.map((e) => (e.id === emailId && !e.isRead ? { ...e, isRead: true } : e))
      );
      setOpenEmailTabIds((prev) => {
        if (prev.includes(emailId)) return prev;
        const next = [...prev, emailId];
        if (next.length > 12) {
          return next.slice(next.length - 12);
        }
        return next;
      });
      setActiveTabEmailId(emailId);
      if (emailLayoutMode === 'fullscreen') {
        setIsFullscreenReading(true);
      }
    },
    [emailLayoutMode]
  );

  const handleCloseEmailTab = useCallback(
    (emailId: string) => {
      setOpenEmailTabIds((prev) => {
        const idx = prev.indexOf(emailId);
        const next = prev.filter((id) => id !== emailId);
        if (activeTabEmailId === emailId) {
          const fallback = next[Math.min(idx, next.length - 1)] ?? null;
          setActiveTabEmailId(fallback);
        }
        return next;
      });
    },
    [activeTabEmailId]
  );

  const handleCloseAllEmailTabs = useCallback(() => {
    setOpenEmailTabIds([]);
    setActiveTabEmailId(null);
  }, []);

  // Atalhos de abas de e-mail: Ctrl+W (fechar aba ativa) e Ctrl+Tab (alternar abas)
  useEffect(() => {
    const onTabKeyDown = (e: KeyboardEvent) => {
      if (activeModule !== 'mail' || isComposeOpen || isSettingsOpen) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w' && activeTabEmailId) {
        e.preventDefault();
        handleCloseEmailTab(activeTabEmailId);
        return;
      }
      if (e.ctrlKey && e.key === 'Tab' && openEmailTabs.length > 0) {
        e.preventDefault();
        const cycle: Array<string | null> = [null, ...openEmailTabs.map((t) => t.id)];
        const currentIdx = cycle.indexOf(activeTabEmailId);
        const step = e.shiftKey ? -1 : 1;
        const nextIdx = (currentIdx + step + cycle.length) % cycle.length;
        setActiveTabEmailId(cycle[nextIdx]);
      }
    };
    window.addEventListener('keydown', onTabKeyDown);
    return () => window.removeEventListener('keydown', onTabKeyDown);
  }, [activeModule, isComposeOpen, isSettingsOpen, activeTabEmailId, openEmailTabs, handleCloseEmailTab]);

  // Efeito de segurança: garante que selectedEmailId nunca aponte para um e-mail de outra conta
  useEffect(() => {
    if (isUnifiedView) return;
    if (selectedEmailId) {
      const currentSelected = emails.find((e) => e.id === selectedEmailId);
      if (currentSelected && !isEmailForAccount(currentSelected, currentAccount)) {
        const available = emails.filter(
          (e) => e.folder === currentFolder && isEmailForAccount(e, currentAccount)
        );
        setSelectedEmailId(available.length > 0 ? available[0].id : null);
      }
    }
  }, [currentAccount, currentFolder, emails, isEmailForAccount, selectedEmailId, isUnifiedView]);

  const handleSelectFolder = async (folder: MailFolder, accountId?: string) => {
    if (accountId === '__unified__') {
      setCurrentFolder(folder);
      setSelectedEmailIds([]);
      const available = emails.filter((e) => e.folder === folder);
      setSelectedEmailId(available.length > 0 ? available[0].id : null);
      return;
    }
    const targetAcc =
      (accountId && settings.accounts?.find((a) => a.id === accountId)) || currentAccount;

    setCurrentFolder(folder);
    setSelectedEmailIds([]);
    const available = emails.filter((e) => e.folder === folder && isEmailForAccount(e, targetAcc));
    setSelectedEmailId(available.length > 0 ? available[0].id : null);

    const incoming = targetAcc.incomingServer;
    const protocol = (incoming?.protocol || 'imap').toLowerCase();
    const host = incoming?.host;
    const password = incoming?.password || targetAcc.password || '';
    const user = incoming?.username || targetAcc.email;

    const customTarget = customFolders.find(
      (f) => f.id === folder && f.accountId === targetAcc.id
    );
    const isSyncableSystemFolder = ['inbox', 'sent', 'drafts', 'trash', 'junk', 'archive'].includes(folder);

    if (
      protocol === 'imap' &&
      host &&
      (password || targetAcc.oauthAccessToken) &&
      window.electronAPI?.fetchRealFolder &&
      (isSyncableSystemFolder || Boolean(customTarget))
    ) {
      const imapMessagesInFolder = emails.filter(
        (e) => e.folder === folder && isEmailForAccount(e, targetAcc)
      );
      if (imapMessagesInFolder.length === 0) {
        try {
          const accessToken = await ensureFreshAccessToken(targetAcc);
          const res = await window.electronAPI.fetchRealFolder(
            {
              protocol: 'imap',
              host: host,
              port: incoming.port || 993,
              secure: incoming.security !== 'none',
              user: user,
              pass: password,
              accessToken,
            },
            folder,
            50,
            customTarget ? customTarget.imapPath || customTarget.name : undefined
          );
          if (res.quota) {
            setAccountQuotas((prev) => ({
              ...prev,
              [targetAcc.id]: res.quota!,
            }));
          }
          if (typeof res.serverTotal === 'number') {
            setServerFolderTotals((prev) => ({
              ...prev,
              [`${targetAcc.id}:${folder}`]: res.serverTotal!,
            }));
          }

          if (res.success && res.emails && res.emails.length > 0) {
            const taggedEmails: EmailItem[] = res.emails.map((m) => ({
              ...m,
              id: m.id.startsWith(`${targetAcc.id}-`) ? m.id : `${targetAcc.id}-${m.id}`,
              accountId: targetAcc.id,
              folder: folder,
            }));
            setEmails((prev) => {
              const incomingMap = new Map(taggedEmails.map((m) => [m.id, m]));
              const updated = prev.filter((p) => !incomingMap.has(p.id));
              const combined = [...taggedEmails, ...updated];
              combined.sort((a, b) => getEmailTimestampMs(b) - getEmailTimestampMs(a));
              return combined;
            });
            if (taggedEmails.length > 0) {
              setSelectedEmailId(taggedEmails[0].id);
            }
          }
        } catch (err) {
          console.warn(`Erro ao sincronizar pasta ${folder}:`, err);
        }
      }
    }
  };

  const handleSelectEmail = (id: string) => {
    setSelectedEmailId(id);
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, isRead: true } : e))
    );
  };

  const handleToggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEmails((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isStarred: !item.isStarred } : item
      )
    );
  };

  const handleToggleTask = (id: string) => {
    soundService.play('pop');
    setEmails((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = !item.isTask;
        showToast(next ? '✓ Adicionado às Tarefas.' : 'Removido das Tarefas.');
        return { ...item, isTask: next };
      })
    );
  };

  const handleToggleReadingList = (id: string) => {
    soundService.play('pop');
    setEmails((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = !item.isReadingList;
        showToast(next ? '✓ Adicionado à Lista de leitura.' : 'Removido da Lista de leitura.');
        return { ...item, isReadingList: next };
      })
    );
  };

  const handleToggleImportant = (id: string) => {
    soundService.play('pop');
    setEmails((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = !item.isImportant;
        showToast(next ? '✓ Marcado como Importante.' : 'Marcação Importante removida.');
        return { ...item, isImportant: next };
      })
    );
  };

  const handleArchive = useCallback((id?: string) => {
    const targetId = id || selectedEmailId;
    if (!targetId) return;
    setEmails((prev) =>
      prev.map((e) => (e.id === targetId ? { ...e, folder: 'archive' } : e))
    );
    const remaining = currentFolderEmails.filter((e) => e.id !== targetId);
    setSelectedEmailId(remaining.length > 0 ? remaining[0].id : null);
  }, [selectedEmailId, currentFolderEmails]);

  const handleSnooze = useCallback((id?: string) => {
    const targetId = id || selectedEmailId;
    if (!targetId) return;
    setEmails((prev) =>
      prev.map((e) => (e.id === targetId ? { ...e, folder: 'snooze' } : e))
    );
    const remaining = currentFolderEmails.filter((e) => e.id !== targetId);
    setSelectedEmailId(remaining.length > 0 ? remaining[0].id : null);
  }, [selectedEmailId, currentFolderEmails]);

  const handleDeleteSelected = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (!ids || ids.length === 0) return false;
      const conf = {
        ...DEFAULT_CONFIRMATION_SETTINGS,
        ...(settings.notifications?.confirmations || {}),
      };
      if (currentFolder === 'trash') {
        if (conf.askBeforePermanentDeleteMessages) {
          if (
            !window.confirm(
              `Deseja realmente apagar ${ids.length} ${ids.length === 1 ? 'mensagem' : 'mensagens'} de uma vez por todas?`
            )
          ) {
            return false;
          }
        }
      } else if (conf.askBeforeDeleteMessage || ids.length > 1) {
        if (
          !window.confirm(
            `Deseja realmente excluir ${ids.length} ${ids.length === 1 ? 'mensagem selecionada' : 'mensagens selecionadas'}?`
          )
        ) {
          return false;
        }
      }

      showToast(
        `🗑️ Excluindo ${ids.length} ${ids.length === 1 ? 'e-mail selecionado' : 'e-mails selecionados'}...`
      );
      await new Promise((resolve) => setTimeout(resolve, 450));

      const idSet = new Set(ids);
      if (currentFolder === 'trash') {
        rememberDeletedEmailIds(ids);
        // IMAP: exclusão definitiva também no servidor
        imapServerSyncRef.current?.queueServerDeletes(emailsRef.current.filter((e) => idSet.has(e.id)));
        setEmails((prev) => prev.filter((e) => !idSet.has(e.id)));
        showToast(
          `✓ ${ids.length} ${ids.length === 1 ? 'e-mail excluído' : 'e-mails excluídos'} permanentemente.`
        );
      } else {
        setEmails((prev) =>
          prev.map((e) => (idSet.has(e.id) ? { ...e, folder: 'trash' } : e))
        );
        showToast(
          `✓ ${ids.length} ${ids.length === 1 ? 'e-mail movido' : 'e-mails movidos'} para a Lixeira.`
        );
      }
      soundService.play('click');
      setSelectedEmailIds([]);
      const remaining = currentFolderEmails.filter((e) => !idSet.has(e.id));
      if (!selectedEmailId || idSet.has(selectedEmailId)) {
        setSelectedEmailId(remaining.length > 0 ? remaining[0].id : null);
      }
      return true;
    },
    [currentFolder, currentFolderEmails, selectedEmailId, settings.notifications?.confirmations]
  );

  const handleToggleSelectId = useCallback((id: string) => {
    setSelectedEmailIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const handleSelectAllVisible = useCallback((visibleIds: string[]) => {
    setSelectedEmailIds((prev) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.includes(id));
      return allSelected ? [] : visibleIds;
    });
  }, []);

  const handleMoveSelectedToFolder = useCallback(
    (ids: string[], targetFolder: MailFolder) => {
      if (!ids || ids.length === 0) return;
      const idSet = new Set(ids);
      setEmails((prev) =>
        prev.map((e) => (idSet.has(e.id) ? { ...e, folder: targetFolder } : e))
      );
      const folderLabel =
        targetFolder === 'inbox'
          ? 'Caixa de Entrada'
          : targetFolder === 'archive'
          ? 'Arquivados'
          : targetFolder === 'junk'
          ? 'Spam / Lixo'
          : customFolders.find((f) => f.id === targetFolder)?.name || targetFolder;
      soundService.play('click');
      showToast(
        `✓ ${ids.length} ${ids.length === 1 ? 'e-mail movido' : 'e-mails movidos'} para "${folderLabel}".`
      );
      setSelectedEmailIds([]);
      const remaining = currentFolderEmails.filter((e) => !idSet.has(e.id));
      if (!selectedEmailId || idSet.has(selectedEmailId)) {
        setSelectedEmailId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
    [customFolders, currentFolderEmails, selectedEmailId]
  );

  const handleDelete = useCallback(
    (id?: string) => {
      if (!id && selectedEmailIds.length > 0) {
        handleDeleteSelected(selectedEmailIds);
        return;
      }
      const targetId = id || selectedEmailId;
      if (!targetId) return;
      handleDeleteSelected([targetId]);
    },
    [selectedEmailId, selectedEmailIds, handleDeleteSelected]
  );

  const handleMarkSpam = useCallback(
    (ids: string[]) => {
      if (!ids || ids.length === 0) return;
      const conf = {
        ...DEFAULT_CONFIRMATION_SETTINGS,
        ...(settings.notifications?.confirmations || {}),
      };
      const junkAction = conf.junkMoveAction || 'always_ask';
      let shouldBlacklistEmail = true;
      let shouldBlacklistDomain = false;

      if (junkAction === 'always_ask') {
        if (
          !window.confirm(
            `Deseja mover ${ids.length} ${ids.length === 1 ? 'mensagem' : 'mensagens'} para o Lixo Eletrônico?`
          )
        ) {
          return;
        }
      } else if (junkAction === 'move_to_spam') {
        shouldBlacklistEmail = false;
      } else if (junkAction === 'move_and_blacklist_email') {
        shouldBlacklistEmail = true;
      } else if (junkAction === 'move_and_blacklist_domain') {
        shouldBlacklistEmail = false;
        shouldBlacklistDomain = true;
      }

      const idSet = new Set(ids);
      const blockedSenders = Array.from(
        new Set(
          emails
            .filter((e) => idSet.has(e.id) && e.senderEmail)
            .map((e) => {
              const addr = e.senderEmail.trim().toLowerCase();
              if (shouldBlacklistDomain && addr.includes('@')) {
                return `@${addr.split('@')[1]}`;
              }
              return addr;
            })
            .filter(Boolean)
        )
      );

      if ((shouldBlacklistEmail || shouldBlacklistDomain) && blockedSenders.length > 0) {
        setSpamSenders((prev) => Array.from(new Set([...prev, ...blockedSenders])));
      }

      const blockedSet = new Set(
        shouldBlacklistEmail || shouldBlacklistDomain ? blockedSenders : []
      );
      setEmails((prev) =>
        prev.map((e) => {
          if (idSet.has(e.id)) return { ...e, folder: 'junk' };
          const senderAddr = (e.senderEmail || '').trim().toLowerCase();
          if (!senderAddr) return e;
          const domainKey = senderAddr.includes('@') ? `@${senderAddr.split('@')[1]}` : '';
          if (blockedSet.has(senderAddr) || (domainKey && blockedSet.has(domainKey))) {
            return { ...e, folder: 'junk' };
          }
          return e;
        })
      );

      soundService.play('click');
      showToast(
        shouldBlacklistEmail || shouldBlacklistDomain
          ? `✓ ${ids.length} ${ids.length === 1 ? 'e-mail movido' : 'e-mails movidos'} para Lixo Eletrônico e remetente(s)/domínio bloqueado(s).`
          : `✓ ${ids.length} ${ids.length === 1 ? 'e-mail movido' : 'e-mails movidos'} para Lixo Eletrônico.`
      );
      setSelectedEmailIds([]);
      const remaining = currentFolderEmails.filter(
        (e) => !idSet.has(e.id) && !(e.senderEmail && blockedSet.has(e.senderEmail.trim().toLowerCase()))
      );
      if (!selectedEmailId || idSet.has(selectedEmailId)) {
        setSelectedEmailId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
    [emails, currentFolderEmails, selectedEmailId, settings.notifications?.confirmations]
  );

  const handleUnmarkSpam = useCallback(
    (id: string) => {
      const target = emails.find((e) => e.id === id);
      if (!target) return;
      const senderNorm = (target.senderEmail || '').trim().toLowerCase();
      if (senderNorm) {
        setSpamSenders((prev) => prev.filter((s) => s !== senderNorm));
      }
      setEmails((prev) =>
        prev.map((e) => (e.id === id ? { ...e, folder: 'inbox' } : e))
      );
      soundService.play('pop');
      showToast('✓ E-mail removido do Lixo Eletrônico e retornado para Caixa de Entrada.');
      const remaining = currentFolderEmails.filter((e) => e.id !== id);
      setSelectedEmailId(remaining.length > 0 ? remaining[0].id : null);
    },
    [emails, currentFolderEmails]
  );

  const handleSaveDraft = (d: {
    id: string;
    recipient: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    bodyHtml?: string;
    fromAccountId?: string;
    priority: 'high' | 'medium' | 'low';
    attachments?: Array<{ name: string; path: string; size: number }>;
  }) => {
    const acc =
      (d.fromAccountId && settings.accounts?.find((a) => a.id === d.fromAccountId)) || currentAccount;
    const now = new Date();
    const draft = {
      id: d.id,
      accountId: acc.id,
      sender: acc.displayName || acc.email,
      senderEmail: acc.email,
      avatar: acc.avatar || '',
      recipient: d.recipient,
      cc: d.cc?.trim() || undefined,
      bcc: d.bcc?.trim() || undefined,
      subject: d.subject || '(sem assunto)',
      snippet: (d.body || '').replace(/\s+/g, ' ').trim().slice(0, 90),
      body: d.body,
      bodyHtml: d.bodyHtml || undefined,
      timestamp: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      dateStr: now.toLocaleDateString('pt-BR'),
      period: 'today',
      folder: 'drafts',
      priority: d.priority,
      isRead: true,
      hasAttachment: Boolean(d.attachments && d.attachments.length > 0),
      draftAttachments: d.attachments || [],
    } as EmailItem;
    setEmails((prev) => [draft, ...prev.filter((e) => e.id !== d.id)]);
  };

  const handleDiscardDraft = (id: string) => {
    rememberDeletedEmailIds([id]);
    // IMAP: rascunho vindo do servidor também é apagado lá
    imapServerSyncRef.current?.queueServerDeletes(emailsRef.current.filter((e) => e.id === id));
    setEmails((prev) => prev.filter((e) => e.id !== id));
  };

  const buildReplyThreadingHeaders = (target: EmailItem) => {
    const inReplyTo = target.messageIdHeader?.trim() || undefined;
    const refs: string[] = [];
    const seen = new Set<string>();
    for (const r of target.referencesHeader || []) {
      const clean = r.trim();
      const key = clean.replace(/[<>]/g, '').toLowerCase();
      if (clean && key && !seen.has(key)) {
        seen.add(key);
        refs.push(clean);
      }
    }
    if (inReplyTo) {
      const key = inReplyTo.replace(/[<>]/g, '').toLowerCase();
      if (!seen.has(key)) refs.push(inReplyTo);
    }
    return {
      inReplyTo,
      references: refs.length > 0 ? refs : undefined,
    };
  };

  const handleReply = async (targetEmail?: EmailItem) => {
    let baseEmail = targetEmail || selectedEmail;
    if (!baseEmail) return;
    if (baseEmail.folder === 'drafts') {
      // Rascunho: o texto pode estar só no banco — carrega antes de abrir para edição
      baseEmail = await ensureEmailBody(baseEmail);
      const fallbackBody =
        baseEmail.body ||
        (baseEmail.bodyHtml
          ? baseEmail.bodyHtml
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
              .replace(/<[^>]*>/g, '')
              .replace(/&nbsp;/gi, ' ')
              .trim()
          : '');
      setComposeDraftId(baseEmail.id);
      setComposeDefaults({
        recipient: baseEmail.recipient || '',
        cc: baseEmail.cc || '',
        bcc: baseEmail.bcc || '',
        subject: baseEmail.subject === '(sem assunto)' ? '' : baseEmail.subject,
        body: fallbackBody,
        bodyHtml: baseEmail.bodyHtml || '',
      });
      setIsComposeOpen(true);
      return;
    }
    const { inReplyTo, references } = buildReplyThreadingHeaders(baseEmail);
    setComposeDefaults({
      recipient: baseEmail.senderEmail,
      subject: baseEmail.subject.startsWith('Re:')
        ? baseEmail.subject
        : `Re: ${baseEmail.subject}`,
      inReplyTo,
      references,
    });
    setIsComposeOpen(true);
  };

  const handleReplyAll = (targetEmail?: EmailItem) => {
    const baseEmail = targetEmail || selectedEmail;
    if (!baseEmail) return;
    const myEmail = (currentAccount?.email || '').trim().toLowerCase();
    const senderAddr = (baseEmail.senderEmail || '').trim();
    const isMeSender = senderAddr.toLowerCase() === myEmail;

    const toCandidates = isMeSender
      ? (baseEmail.recipient || '').split(/[;,]+/)
      : [senderAddr];
    const ccCandidates = [
      ...(isMeSender ? [] : (baseEmail.recipient || '').split(/[;,]+/)),
      ...(baseEmail.cc || '').split(/[;,]+/),
    ];

    const seen = new Set<string>();
    const extractAddr = (token: string) => {
      const m = token.match(/<([^>]+)>/);
      return (m ? m[1] : token).trim().toLowerCase();
    };

    const primaryTo: string[] = [];
    for (const raw of toCandidates) {
      const t = raw.trim();
      const addr = extractAddr(t);
      if (!addr || (!isMeSender && addr === myEmail) || seen.has(addr)) continue;
      seen.add(addr);
      primaryTo.push(t);
    }

    const ccList: string[] = [];
    for (const raw of ccCandidates) {
      const t = raw.trim();
      const addr = extractAddr(t);
      if (!addr || addr === myEmail || seen.has(addr)) continue;
      seen.add(addr);
      ccList.push(t);
    }

    const { inReplyTo, references } = buildReplyThreadingHeaders(baseEmail);
    setComposeDefaults({
      recipient: primaryTo.length > 0 ? primaryTo.join(', ') : baseEmail.senderEmail,
      cc: ccList.join(', '),
      subject: baseEmail.subject.startsWith('Re:')
        ? baseEmail.subject
        : `Re: ${baseEmail.subject}`,
      inReplyTo,
      references,
    });
    setIsComposeOpen(true);
  };

  const handleForward = (targetEmail?: EmailItem) => {
    const baseEmail = targetEmail || selectedEmail;
    if (!baseEmail) return;
    setComposeDefaults({
      recipient: '',
      subject: `Enc: ${baseEmail.subject}`,
    });
    setIsComposeOpen(true);
  };

  const isLikelyNetworkError = (msg?: string): boolean => {
    if (!msg) return false;
    return /(enotfound|econnrefused|etimedout|econnreset|eai_again|enetunreach|ehostunreach|socket|network|offline|timed?\s*out|getaddrinfo|connection\s+closed)/i.test(
      msg
    );
  };

  const enqueueOfflineOutbox = useCallback(
    (emailData: OutgoingEmailPayload, reason?: string) => {
      const queueId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const sendingAccount =
        (emailData.fromAccountId && settings.accounts?.find((a) => a.id === emailData.fromAccountId)) ||
        currentAccount;

      const queuedItem: OfflineOutboxItem = {
        id: queueId,
        queuedAt: Date.now(),
        retries: 0,
        lastError: reason,
        payload: emailData,
      };

      setOfflineOutboxQueue((prev) => [...prev, queuedItem]);
      setEmails((prev) => [
        {
          id: queueId,
          accountId: sendingAccount.id,
          sender: sendingAccount.displayName || sendingAccount.email,
          senderEmail: sendingAccount.email,
          avatar: sendingAccount.avatar || '',
          recipient: emailData.recipient,
          cc: emailData.cc || undefined,
          bcc: emailData.bcc || undefined,
          subject: `[Fila Offline] ${emailData.subject}`,
          snippet: emailData.body.slice(0, 90),
          body: emailData.body,
          bodyHtml: emailData.html,
          timestamp: 'Aguardando rede',
          dateStr: new Date().toISOString(),
          period: 'today',
          folder: 'outbox',
          priority: emailData.priority,
          isRead: true,
          tags: ['Fila Offline', 'Aguardando conexão'],
        },
        ...prev,
      ]);
      soundService.play('pop');
      showToast('📡 Sem internet — e-mail salvo na Caixa de Saída (envio automático ao reconectar).');
    },
    [settings.accounts, currentAccount]
  );

  const dispatchEmailNow = async (
    emailData: OutgoingEmailPayload,
    options?: { skipOfflineQueue?: boolean }
  ) => {
    const sendingAccount =
      (emailData.fromAccountId && settings.accounts?.find((a) => a.id === emailData.fromAccountId)) ||
      currentAccount;

    const effectiveSignature =
      emailData.signature !== undefined ? emailData.signature : sendingAccount.signature;
    const plainSignature = effectiveSignature
      ? effectiveSignature
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      : '';
    const signatureToAppend = plainSignature ? `\n\n--\n${plainSignature}` : '';
    const fullBody = `${emailData.body}${signatureToAppend}`;

    const outgoing = sendingAccount.outgoingServer;
    const incoming = sendingAccount.incomingServer;
    const useCustomSmtpAuth = outgoing?.authMode === 'custom_credentials';
    const smtpPassword = useCustomSmtpAuth
      ? outgoing?.password || incoming?.password || sendingAccount.password || ''
      : incoming?.password || sendingAccount.password || outgoing?.password || '';
    const smtpUser = useCustomSmtpAuth
      ? outgoing?.username || incoming?.username || sendingAccount.email
      : incoming?.username || sendingAccount.email || outgoing?.username;
    const smtpHost =
      outgoing?.host &&
      !(outgoing.host === 'email-ssl.com.br' && incoming?.host && !incoming.host.includes('email-ssl.com.br'))
        ? outgoing.host
        : incoming?.host
        ? incoming.host.replace(/^(pop3?|imap4?)\./i, 'smtp.')
        : outgoing?.host || '';

    // Se estiver offline e houver SMTP configurado, guarda na Fila Offline Persistente
    if (
      !options?.skipOfflineQueue &&
      typeof navigator !== 'undefined' &&
      !navigator.onLine &&
      window.electronAPI?.sendRealEmail &&
      smtpHost
    ) {
      enqueueOfflineOutbox(emailData, 'Dispositivo offline');
      return;
    }

    const smtpAccessToken = await ensureFreshAccessToken(sendingAccount);

    let sentMessageIdHeader: string | undefined = undefined;
    let sentCopyLocation: { folderKey: string; uid: number } | undefined = undefined;

    // Conta IMAP: a cópia do e-mail enviado vai também para a pasta Enviados do servidor
    const isImapSendingAccount = (incoming?.protocol || 'imap').toLowerCase() === 'imap' && Boolean(incoming?.host);
    const sentCopyConfig = isImapSendingAccount
      ? {
          protocol: 'imap',
          host: incoming!.host,
          port: incoming!.port || 993,
          secure: incoming!.security !== 'none',
          user: incoming!.username || sendingAccount.email,
          pass: incoming!.password || sendingAccount.password || '',
          accessToken: smtpAccessToken,
        }
      : undefined;

    // Disparo Real via Servidor SMTP Corporativo se configurado
    if (window.electronAPI?.sendRealEmail && smtpHost && (smtpPassword || smtpAccessToken)) {
      showToast(`Enviando mensagem via SMTP (${smtpHost})...`);
      try {
        const result = await window.electronAPI.sendRealEmail(
          {
            host: smtpHost,
            incomingHost: incoming?.host || '',
            port: outgoing?.port || 465,
            secure: (outgoing?.port || 465) === 465,
            user: smtpUser,
            pass: smtpPassword,
            accessToken: smtpAccessToken,
          },
          {
            sender: sendingAccount.displayName || sendingAccount.email,
            recipient: emailData.recipient,
            cc: emailData.cc,
            bcc: emailData.bcc,
            subject: emailData.subject,
            body: fullBody,
            html: emailData.html,
            attachments: emailData.attachments,
            trackingEnabled: Boolean(emailData.trackingEnabled),
            requestReadReceipt: Boolean(emailData.requestReadReceipt),
            inReplyTo: emailData.inReplyTo,
            references: emailData.references,
            icalEvent: emailData.icalEvent,
          },
          sentCopyConfig
        );

        if (result.success && typeof result.sentCopy?.uid === 'number') {
          sentCopyLocation = { folderKey: 'sent', uid: result.sentCopy.uid };
        }

        if (!result.success) {
          if (!options?.skipOfflineQueue && isLikelyNetworkError(result.error)) {
            enqueueOfflineOutbox(emailData, result.error);
            return;
          }
          showToast(`❌ Falha no envio SMTP: ${result.error}`);
          soundService.play('error');
          throw new Error(result.error || 'Falha ao despachar e-mail via SMTP');
        }
        sentMessageIdHeader = result.messageId;
        soundService.play('send');
        showToast('✓ E-mail enviado com sucesso pelo servidor corporativo!');
      } catch (err: any) {
        if (!options?.skipOfflineQueue && isLikelyNetworkError(err?.message)) {
          enqueueOfflineOutbox(emailData, err?.message);
          return;
        }
        soundService.play('error');
        showToast(`❌ Erro no envio SMTP: ${err.message || 'Verifique as credenciais da conta'}`);
        throw err;
      }
    } else {
      soundService.play('send');
      showToast('✉️ E-mail registrado nos Itens Enviados (Modo Local)');
    }

    const isReadReceiptEnabled = Boolean(emailData.trackingEnabled || emailData.requestReadReceipt);

    const parsedRecipients = isReadReceiptEnabled
      ? [emailData.recipient, emailData.cc]
          .filter(Boolean)
          .join(',')
          .split(/[;,]/)
          .map((r) => r.trim())
          .filter(Boolean)
          .map((raw) => {
            const emailMatch = raw.match(/<([^>]+)>/) || raw.match(/([^\s<>]+@[^\s<>]+)/);
            const addr = (emailMatch ? emailMatch[1] : raw).trim();
            const cleanName = raw.replace(/<[^>]+>/g, '').replace(/["']/g, '').trim();
            const contactMatch = contacts.find((c) => c.email.trim().toLowerCase() === addr.toLowerCase());
            return {
              name: contactMatch?.name || (cleanName && cleanName !== addr ? cleanName : addr.split('@')[0] || addr),
              email: addr,
              status: 'delivered' as const,
            };
          })
      : undefined;

    const newMail: EmailItem = {
      id: `${sendingAccount.id}-msg-${Date.now()}`,
      accountId: sendingAccount.id,
      messageIdHeader: sentMessageIdHeader,
      // Cópia gravada em Enviados no servidor: vincula para a sincronização não duplicar
      imapLocation: sentCopyLocation,
      inReplyToHeader: emailData.inReplyTo,
      referencesHeader: emailData.references,
      sender: sendingAccount.displayName || sendingAccount.email,
      senderEmail: sendingAccount.email,
      avatar: sendingAccount.avatar || '',
      recipient: emailData.recipient,
      cc: emailData.cc || undefined,
      bcc: emailData.bcc || undefined,
      subject: emailData.subject,
      snippet: emailData.body.slice(0, 90),
      body: fullBody,
      bodyHtml: emailData.html,
      stationery: emailData.stationery,
      timestamp: 'Agora',
      dateStr: new Date().toISOString(),
      period: 'today',
      folder: 'sent',
      priority: emailData.priority,
      isRead: true,
      hasAttachment: Boolean(emailData.attachments && emailData.attachments.length > 0),
      tags: ['Enviado'],
      trackingEnabled: isReadReceiptEnabled,
      requestReadReceipt: isReadReceiptEnabled,
      recipientTracking: parsedRecipients,
    };

    setEmails((prev) => [newMail, ...prev]);
  };

  const handleRespondCalendarInvite = useCallback(
    async (targetEmail: EmailItem, status: RsvpStatus) => {
      const invite = targetEmail?.calendarInvite;
      if (!invite) return;

      // 1. Atualiza status RSVP localmente no e-mail e sincroniza com o Calendário local
      setEmails((prev) =>
        prev.map((e) =>
          e.id === targetEmail.id && e.calendarInvite
            ? { ...e, calendarInvite: { ...e.calendarInvite, rsvpStatus: status } }
            : e
        )
      );
      syncInviteToLocalCalendar(invite, status);

      // 2. Envia resposta RFC 5546 (METHOD:REPLY) via SMTP ao organizador
      const organizerAddr = extractCleanEmail(invite.organizerEmail || targetEmail.senderEmail || '');
      const statusLabel = getRsvpLabel(status);
      if (organizerAddr && organizerAddr.includes('@')) {
        const replyAccount =
          (targetEmail.accountId && settings.accounts?.find((a) => a.id === targetEmail.accountId)) ||
          currentAccount;
        const replyIcs = buildIcsRsvpReply({
          invite,
          attendeeEmail: replyAccount.email,
          attendeeName: replyAccount.displayName || replyAccount.email,
          status,
        });
        try {
          await dispatchEmailNow({
            recipient: organizerAddr,
            subject: `${statusLabel}: ${invite.summary}`,
            body: `${replyAccount.displayName || replyAccount.email} respondeu "${statusLabel}" ao convite "${invite.summary}" (${invite.date.split('-').reverse().join('/')} ${invite.startTime}).`,
            priority: 'medium',
            fromAccountId: replyAccount.id,
            inReplyTo: targetEmail.messageIdHeader,
            icalEvent: {
              method: 'REPLY',
              filename: 'reply.ics',
              content: replyIcs,
            },
          });
          soundService.play('pop');
          showToast(
            status === 'DECLINED'
              ? `✓ Convite recusado e resposta enviada a ${organizerAddr}.`
              : `✓ Convite marcado como "${statusLabel}", salvo no Calendário e resposta enviada!`
          );
          return;
        } catch {
          // Mantém atualização local mesmo se SMTP offline
        }
      }

      soundService.play('pop');
      showToast(
        status === 'DECLINED'
          ? '✓ Convite marcado como Recusado.'
          : `✓ Convite marcado como "${statusLabel}" e adicionado ao Calendário!`
      );
    },
    [currentAccount, settings.accounts]
  );

  const handleSendReadReceipt = useCallback(
    async (targetEmail: EmailItem) => {
      if (!targetEmail || !targetEmail.readReceiptRequestedBy) return;
      const extractValidAddr = (raw?: string): string | undefined => {
        if (!raw) return undefined;
        const cleaned = raw.replace(/^mailto:/i, '').trim();
        const bracketMatch = cleaned.match(/<([^\s<>'"]+@[^\s<>'"]+\.[^\s<>'"]+)>/);
        const match = bracketMatch?.[1] || cleaned.match(/([^\s,;<>'"]+@[^\s,;<>'"]+\.[^\s,;<>'"]+)/)?.[1];
        return match && /^[^\s@<>'"]+@[^\s@<>'"]+\.[^\s@<>'"]+$/.test(match) ? match : undefined;
      };
      const receiptRecipient =
        extractValidAddr(targetEmail.readReceiptRequestedBy) || extractValidAddr(targetEmail.senderEmail);
      if (!receiptRecipient) {
        showToast('❌ Não foi possível enviar a confirmação de leitura: endereço do solicitante inválido.');
        return;
      }
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      try {
        await dispatchEmailNow({
          recipient: receiptRecipient,
          subject: `Lida: ${targetEmail.subject}`,
          body: `Sua mensagem\n\n  Para: ${currentAccount.displayName || currentAccount.email}\n  Assunto: ${targetEmail.subject}\n\nfoi lida em ${new Date().toLocaleDateString('pt-BR')} às ${nowTime}.`,
          priority: 'medium',
          fromAccountId: targetEmail.accountId || currentAccount.id,
          trackingEnabled: false,
          requestReadReceipt: false,
        });
        setEmails((prev) =>
          prev.map((m) => (m.id === targetEmail.id ? { ...m, readReceiptSent: true } : m))
        );
        soundService.play('pop');
        showToast(`✓ Confirmação de leitura enviada para ${receiptRecipient}.`);
      } catch {}
    },
    [currentAccount]
  );

  // Correlaciona automaticamente confirmações de leitura (MDN / "Lida:" / "Read:") e respostas com os e-mails enviados
  useEffect(() => {
    const incomingList = emails.filter((e) => e.folder !== 'sent' && e.folder !== 'drafts' && e.folder !== 'outbox');
    if (incomingList.length === 0) return;

    setEmails((prev) => {
      let updatedAny = false;
      const next = prev.map((msg) => {
        if (msg.folder !== 'sent' || (!msg.trackingEnabled && !msg.requestReadReceipt)) return msg;

        const baseTracking =
          msg.recipientTracking && msg.recipientTracking.length > 0
            ? msg.recipientTracking
            : String(msg.recipient || '')
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

        if (baseTracking.length === 0) return msg;

        const cleanSentSubject = String(msg.subject || '')
          .replace(/^(re|enc|fw|fwd|lida|read|confirmac[aã]o de leitura):\s*/gi, '')
          .trim()
          .toLowerCase();
        const sentTimeMs = msg.dateStr ? new Date(msg.dateStr).getTime() : 0;

        let changedRecipient = false;
        const nextTracking = baseTracking.map((rec) => {
          if (rec.status === 'opened') return rec;
          const recAddr = (rec.email || '').trim().toLowerCase();
          if (!recAddr) return rec;

          const matchingIncoming = incomingList.find((inc) => {
            const incSender = (inc.senderEmail || '').trim().toLowerCase();
            if (incSender !== recAddr) return false;

            const incTimeMs = inc.dateStr ? new Date(inc.dateStr).getTime() : 0;
            if (sentTimeMs > 0 && incTimeMs > 0 && incTimeMs < sentTimeMs - 60000) {
              return false;
            }

            if (msg.messageIdHeader && inc.inReplyToHeader && msg.messageIdHeader === inc.inReplyToHeader) {
              return true;
            }

            const incSubjLower = String(inc.subject || '').trim().toLowerCase();
            const isMdnOrReplySubject =
              /^(lida|read|confirmac[aã]o de leitura|re|res):/i.test(incSubjLower) &&
              cleanSentSubject.length > 0 &&
              incSubjLower.includes(cleanSentSubject);

            const isMdnBody =
              /disposition-notification|foi lida em|was displayed on|read receipt/i.test(inc.body || '') &&
              cleanSentSubject.length > 0 &&
              String(inc.body || '').toLowerCase().includes(cleanSentSubject);

            return isMdnOrReplySubject || isMdnBody;
          });

          if (matchingIncoming) {
            changedRecipient = true;
            const openedTime =
              matchingIncoming.dateStr
                ? new Date(matchingIncoming.dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : matchingIncoming.timestamp || 'Lido';
            return {
              ...rec,
              status: 'opened' as const,
              openedAt: openedTime,
              openedDateStr: matchingIncoming.dateStr,
            };
          }
          return rec;
        });

        if (changedRecipient) {
          updatedAny = true;
          return {
            ...msg,
            recipientTracking: nextTracking,
          };
        }
        return msg;
      });

      return updatedAny ? next : prev;
    });
  }, [emails.length]);

  const dispatchEmailNowRef = useRef(dispatchEmailNow);
  dispatchEmailNowRef.current = dispatchEmailNow;

  const flushOfflineOutbox = useCallback(async () => {
    const queue = offlineOutboxRef.current;
    if (queue.length === 0) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    setIsFlushingOutbox(true);
    let sentCount = 0;
    try {
      for (const item of queue) {
        try {
          await dispatchEmailNowRef.current(item.payload, { skipOfflineQueue: true });
          sentCount++;
          setOfflineOutboxQueue((prev) => prev.filter((q) => q.id !== item.id));
          setEmails((prev) => prev.filter((e) => e.id !== item.id));
        } catch (err: any) {
          setOfflineOutboxQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? { ...q, retries: q.retries + 1, lastError: err?.message || 'Erro de rede' }
                : q
            )
          );
        }
      }
      if (sentCount > 0) {
        showToast(`✓ Fila Offline: ${sentCount} e-mail(s) enviado(s) automaticamente!`);
      }
    } finally {
      setIsFlushingOutbox(false);
    }
  }, []);

  // Monitora conectividade (online/offline) e reenvia Fila Offline automaticamente ao reconectar
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (offlineOutboxRef.current.length > 0) {
        showToast('🌐 Conexão restabelecida — enviando fila da Caixa de Saída...');
        void flushOfflineOutbox();
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('📡 Modo Offline detectado — novos envios serão guardados na Caixa de Saída.');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const retryTimer = window.setInterval(() => {
      if (
        typeof navigator !== 'undefined' &&
        navigator.onLine &&
        offlineOutboxRef.current.some((q) => q.retries < 10)
      ) {
        void flushOfflineOutbox();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(retryTimer);
    };
  }, [flushOfflineOutbox]);
  const pendingUndoSendRef = useRef(pendingUndoSend);
  pendingUndoSendRef.current = pendingUndoSend;
  const scheduledEmailsRef = useRef(scheduledEmails);
  scheduledEmailsRef.current = scheduledEmails;
  const handleSyncAllRef = useRef(handleSyncAll);
  handleSyncAllRef.current = handleSyncAll;

  // ==========================================
  // Aviso de novo e-mail (janela no canto da tela + som escolhido nas Configurações)
  // ==========================================
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const notifyNewMailRef = useRef<(list: EmailItem[]) => void>(() => {});
  notifyNewMailRef.current = (list: EmailItem[]) => {
    const conf = settings.notifications;
    if (conf && conf.notificationsEnabled === false) return;
    // Confere de novo no estado atual: regras/filtro de spam podem ter tirado da Entrada,
    // e o usuário pode já ter lido
    const ids = new Set(list.map((e) => e.id));
    const still = emailsRef.current.filter((e) => ids.has(e.id) && e.folder === 'inbox' && !e.isRead);
    const notice = buildNewMailNotice(still);
    if (!notice) return;
    // "Silencioso" não toca nada; "Padrão do Tema" usa o som do tema
    soundService.playNotificationPreset(conf?.notificationSound || 'theme');
    void window.electronAPI?.showNotifier?.(notice);
  };

  // Clique no aviso: abre o app já no e-mail (trocando de conta, se preciso)
  const handleSelectAccountRef = useRef(handleSelectAccount);
  handleSelectAccountRef.current = handleSelectAccount;
  const notificationTargetRef = useRef<string | null>(null);
  useEffect(() => {
    const off = window.electronAPI?.onNotificationEmailClicked?.((emailId: string) => {
      const target = emailsRef.current.find((e) => e.id === emailId);
      if (!target) return;
      setActiveModule('mail');
      const unified = settingsRef.current.activeAccountId === '__unified__';
      if (!unified && target.accountId && target.accountId !== settingsRef.current.activeAccountId) {
        handleSelectAccountRef.current(target.accountId);
      }
      setCurrentFolder(target.folder);
      notificationTargetRef.current = emailId;
    });
    return () => off?.();
  }, []);
  // Seleciona o e-mail depois que a troca de conta/pasta foi aplicada
  useEffect(() => {
    const id = notificationTargetRef.current;
    if (!id) return;
    notificationTargetRef.current = null;
    setSelectedEmailId(id);
    setEmails((prev) => prev.map((e) => (e.id === id && !e.isRead ? { ...e, isRead: true } : e)));
  });

  // Download completo automático de todas as pastas (substitui "Carregar +150" / "Baixar todas")
  const mailBackfill = useMailBackfill({
    accounts: settings.accounts && settings.accounts.length > 0 ? settings.accounts : [currentAccount],
    customFolders,
    emailsRef,
    setEmails,
    serverFolderTotals,
    setServerFolderTotals,
    ensureFreshAccessToken,
    loadDeletedEmailIds,
  });
  startBackfillRef.current = () => void mailBackfill.start();

  // IMAP: o que o usuário faz no app (mover, excluir, lido, estrela) é refletido no servidor
  const imapServerSync = useImapServerSync({
    emails,
    setEmails,
    accounts: settings.accounts && settings.accounts.length > 0 ? settings.accounts : [currentAccount],
    customFolders,
    getImapConfig: async (acc) => {
      const incoming = acc.incomingServer;
      if ((incoming?.protocol || 'imap').toLowerCase() !== 'imap' || !incoming?.host) return null;
      const user = incoming.username || acc.email;
      const pass = incoming.password || acc.password || '';
      const accessToken = await ensureFreshAccessToken(acc);
      if (!user || (!pass && !accessToken)) return null;
      return {
        protocol: 'imap',
        host: incoming.host,
        port: incoming.port || 993,
        secure: incoming.security !== 'none',
        user,
        pass,
        accessToken,
      };
    },
    showToast,
    requestBackgroundSync: () => {
      setTimeout(() => {
        void handleSyncAllRef.current({ background: true });
      }, 1500);
    },
  });
  imapServerSyncRef.current = imapServerSync;

  // Ao fechar o aplicativo: executa envio e recebimento antes de encerrar totalmente (inclusive da bandeja)
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onPrepareClose) return;

    const off = api.onPrepareClose(async () => {
      if (closingInProgressRef.current) return;
      closingInProgressRef.current = true;
      setIsClosingSync(true);

      const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 15000));

      const performSendAndReceive = async () => {
        try {
          // 1. Dispara imediatamente qualquer e-mail na contagem de "Desfazer Envio"
          if (pendingUndoSendRef.current) {
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
            const payloadToSend = pendingUndoSendRef.current.payload;
            setPendingUndoSend(null);
            await dispatchEmailNowRef.current(payloadToSend).catch(() => {});
          }

          // 2. Dispara e-mails agendados que já venceram
          const now = Date.now();
          const due = scheduledEmailsRef.current.filter((item) => now >= item.scheduledAt);
          if (due.length > 0) {
            const dueIds = new Set(due.map((d) => d.id));
            setScheduledEmails((prev) => prev.filter((item) => !dueIds.has(item.id)));
            setEmails((prev) => prev.filter((e) => !dueIds.has(e.id)));
            for (const item of due) {
              await dispatchEmailNowRef.current(item.payload).catch(() => {});
            }
          }

          // 3. Executa envio/recebimento completo das contas
          if (syncPromiseRef.current) {
            await syncPromiseRef.current.catch(() => {});
          } else {
            await handleSyncAllRef.current({ silent: true });
          }
        } catch (err) {
          console.warn('[APP] Erro durante envio/recebimento ao fechar:', err);
        }
      };

      await Promise.race([performSendAndReceive(), timeoutPromise]);
      // Grava o que estiver pendente (cache, índice, cópias .pst/.mbox) antes de encerrar
      await Promise.race([
        mailPersistenceRef.current.flushAll(),
        new Promise<void>((resolve) => setTimeout(resolve, 4000)),
      ]);
      api.confirmAppClose?.();
    });

    return () => {
      off?.();
    };
  }, []);

  // Timer do Undo Send (contagem regressiva de 8 segundos)
  useEffect(() => {
    if (!pendingUndoSend) return;
    if (pendingUndoSend.secondsLeft <= 0) {
      const payloadToSend = pendingUndoSend.payload;
      setPendingUndoSend(null);
      dispatchEmailNowRef.current(payloadToSend).catch(() => {});
      return;
    }
    undoTimerRef.current = window.setTimeout(() => {
      setPendingUndoSend((prev) =>
        prev ? { ...prev, secondsLeft: prev.secondsLeft - 1 } : null
      );
    }, 1000);
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, [pendingUndoSend]);

  // Processador da fila de e-mails agendados (Send Later)
  useEffect(() => {
    if (scheduledEmails.length === 0) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      const due = scheduledEmails.filter((item) => now >= item.scheduledAt);
      if (due.length === 0) return;
      const dueIds = new Set(due.map((d) => d.id));
      setScheduledEmails((prev) => prev.filter((item) => !dueIds.has(item.id)));
      setEmails((prev) => prev.filter((e) => !dueIds.has(e.id)));
      for (const item of due) {
        dispatchEmailNowRef.current(item.payload).catch(() => {});
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [scheduledEmails]);

  const handleUndoSend = () => {
    if (!pendingUndoSend) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const { payload } = pendingUndoSend;
    setPendingUndoSend(null);
    setComposeDefaults({
      recipient: payload.recipient,
      cc: payload.cc || '',
      bcc: payload.bcc || '',
      subject: payload.subject,
      body: payload.body,
      bodyHtml: payload.editorHtml || '',
      inReplyTo: payload.inReplyTo,
      references: payload.references,
    });
    setIsComposeOpen(true);
    soundService.play('pop');
    showToast('↩️ Envio cancelado! Mensagem restaurada para edição.');
  };

  const handleSendNowFromUndo = () => {
    if (!pendingUndoSend) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const { payload } = pendingUndoSend;
    setPendingUndoSend(null);
    dispatchEmailNowRef.current(payload).catch(() => {});
  };

  const handleSendEmail = async (emailData: OutgoingEmailPayload) => {
    // 1. Se for envio agendado (Send Later)
    if (emailData.scheduledAt && emailData.scheduledAt > Date.now()) {
      const schedId = `sched-${Date.now()}`;
      const sendingAccount =
        (emailData.fromAccountId && settings.accounts?.find((a) => a.id === emailData.fromAccountId)) ||
        currentAccount;
      const whenStr = new Date(emailData.scheduledAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      setScheduledEmails((prev) => [
        ...prev,
        { id: schedId, scheduledAt: emailData.scheduledAt!, payload: emailData },
      ]);
      const outboxMail: EmailItem = {
        id: schedId,
        accountId: sendingAccount.id,
        sender: sendingAccount.displayName || sendingAccount.email,
        senderEmail: sendingAccount.email,
        avatar: sendingAccount.avatar || '',
        recipient: emailData.recipient,
        cc: emailData.cc || undefined,
        bcc: emailData.bcc || undefined,
        subject: `[Agendado ${whenStr}] ${emailData.subject}`,
        snippet: emailData.body.slice(0, 90),
        body: emailData.body,
        bodyHtml: emailData.html,
        timestamp: whenStr,
        period: 'today',
        folder: 'outbox',
        priority: emailData.priority,
        isRead: true,
        hasAttachment: Boolean(emailData.attachments && emailData.attachments.length > 0),
        tags: [`Agendado ${whenStr}`],
      };
      setEmails((prev) => [outboxMail, ...prev]);
      soundService.play('pop');
      showToast(`🕒 E-mail agendado para ${whenStr} (Caixa de Saída)`);
      return;
    }

    // 2. Se já houver outro Undo Send pendente, despacha o anterior imediatamente
    if (pendingUndoSend) {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      const prevPayload = pendingUndoSend.payload;
      setPendingUndoSend(null);
      dispatchEmailNowRef.current(prevPayload).catch(() => {});
    }

    // 3. Inicia contagem de Undo Send (configurável em Configurações; 0 envia na hora)
    soundService.play('pop');
    const undoSeconds = Math.min(30, Math.max(0, Number(settings.sending?.undoSendSeconds ?? 8)));
    setPendingUndoSend({
      payload: emailData,
      secondsLeft: Number.isFinite(undoSeconds) ? undoSeconds : 8,
    });
  };

  // Atalho F9: enviar/receber todas as pastas
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F9' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        e.preventDefault();
        void handleSyncAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSyncAll]);

  // Keyboard navigation
  const handleNextEmail = useCallback(() => {
    if (!currentFolderEmails.length) return;
    const currentIndex = currentFolderEmails.findIndex(
      (e) => e.id === selectedEmailId
    );
    if (currentIndex < currentFolderEmails.length - 1) {
      handleSelectEmail(currentFolderEmails[currentIndex + 1].id);
    }
  }, [currentFolderEmails, selectedEmailId]);

  const handlePrevEmail = useCallback(() => {
    if (!currentFolderEmails.length) return;
    const currentIndex = currentFolderEmails.findIndex(
      (e) => e.id === selectedEmailId
    );
    if (currentIndex > 0) {
      handleSelectEmail(currentFolderEmails[currentIndex - 1].id);
    }
  }, [currentFolderEmails, selectedEmailId]);

  useKeyboardShortcuts({
    disabled: isSettingsOpen || isComposeOpen,
    onOpenCommandPalette: () => {
      emailListRef.current?.focusSearch();
    },
    onOpenSkins: () => {
      setSettingsInitialTab('appearance');
      setIsSettingsOpen(true);
    },
    onCompose: () => {
      setComposeDefaults({ recipient: '', subject: '' });
      setIsComposeOpen(true);
    },
    onArchive: () => handleArchive(),
    onSnooze: () => handleSnooze(),
    onDelete: () => handleDelete(),
    onFocusSearch: () => emailListRef.current?.focusSearch(),
    onNextEmail: handleNextEmail,
    onPrevEmail: handlePrevEmail,
    onToggleMinimalLayout: handleToggleMinimalLayout,
    onEscape: () => {
      setIsCommandPaletteOpen(false);
      setIsComposeOpen(false);
      setIsSettingsOpen(false);
      setSearchQuery('');
    },
  });

  const activeFolderTitle = useMemo(() => {
    if (activeModule === 'calendar') return 'Calendário';
    if (activeModule === 'contacts') return 'Contatos';
    if (activeModule === 'tasks') return 'Tarefas';
    if (activeModule === 'stats') return 'Estatísticas & Produtividade';
    if (activeModule === 'webapp' && activeWebApp) return activeWebApp.name;
    if (isUnifiedView && currentFolder === 'inbox') return 'Caixa de Entrada Unificada';
    const map: Record<string, string> = {
      inbox: 'Caixa de Entrada',
      favorites: 'Favoritos',
      tasks: 'Tarefas',
      reading_list: 'Lista de leitura',
      important: 'Importante',
      sent: 'Itens Enviados',
      junk: 'Lixo eletrônico',
      outbox: 'Caixa de Saída',
      trash: 'Itens Excluídos',
      drafts: 'Rascunhos',
      archive: 'Arquivados',
      snooze: 'Snoozed (Adiados)',
      search_folders: 'Pastas de Pesquisa',
    };
    return (
      map[currentFolder] ||
      customFolders.find((f) => f.id === currentFolder)?.name ||
      'Caixa de Entrada'
    );
  }, [activeModule, activeWebApp, currentFolder, customFolders, isUnifiedView]);

  return (
    <div className="h-screen w-screen flex overflow-hidden font-sans bg-[#162231] text-slate-100">
      {/* Left Full-Height Dark Navy Sidebar (Mockup Style) */}
      {!isMinimalLayout && (
        <>
          <Sidebar
        currentFolder={currentFolder}
        onSelectFolder={(folder, accId) => {
          setActiveModule('mail');
          handleSelectFolder(folder, accId);
        }}
        onOpenAccountSettings={() => {
          setSettingsInitialTab('account');
          setIsSettingsOpen(true);
        }}
        onOpenSetupWizard={() => setIsSetupWizardOpen(true)}
        onCompose={() => {
          setComposeDefaults({ recipient: '', subject: '' });
          setIsComposeOpen(true);
        }}
        unreadCounts={unreadCounts}
        folderCounts={folderTotalCounts}
        activeAccount={activeAccount}
        accountProtocol={currentAccount.incomingServer?.protocol || 'imap'}
        accounts={settings.accounts}
        activeAccountId={settings.activeAccountId}
        onSelectAccount={handleSelectAccount}
        onReorderAccounts={handleReorderAccounts}
        emails={emails}
        cloudQuota={accountQuotas[currentAccount.id]}
        width={sidebarWidth}
        customFolders={customFolders}
        favoriteFolders={favoriteFolders}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onCopyFolder={handleCopyFolder}
        onMoveFolder={handleMoveFolder}
        onDeleteFolder={handleDeleteFolder}
        onMarkAllAsRead={handleMarkAllAsRead}
        onEmptyFolder={handleEmptyFolder}
        onSortSubfolders={handleSortSubfolders}
        onReorderFolder={handleReorderFolder}
        onToggleFavoriteFolder={handleToggleFavoriteFolder}
        folderCreateRequest={folderCreateRequest}
        activeModule={activeModule}
        onSelectModule={setActiveModule}
        appsSettings={settings.apps}
        activeWebAppId={activeWebApp?.id ?? null}
        onSelectWebApp={(app) => {
          setActiveWebApp(app);
          setActiveModule('webapp');
        }}
        isWhatsAppOpen={isWhatsAppOpen}
        onToggleWhatsApp={() => setIsWhatsAppOpen((prev) => !prev)}
        onOpenSettings={() => {
          // Configurações gerais sempre abrem no 1º item da ordem alfabética das abas
          setSettingsInitialTab('appearance');
          setIsSettingsOpen(true);
        }}
        onOpenPrivacyCenter={() => {
          setSettingsInitialTab('security');
          setIsSettingsOpen(true);
        }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        showUnifiedInbox={settings.appearance?.showUnifiedInbox ?? true}
        onToggleUnifiedInbox={(show) => {
          soundService.play('click');
          const nextAccountId =
            !show && settings.activeAccountId === '__unified__'
              ? settings.accounts[0]?.id || settings.account.id
              : settings.activeAccountId;
          const updated: AppSettings = {
            ...settings,
            activeAccountId: nextAccountId,
            appearance: {
              ...settings.appearance,
              showUnifiedInbox: show,
            },
          };
          setSettings(updated);
          persistSettings(updated);
          showToast(show ? 'Caixa Unificada exibida' : 'Caixa Unificada ocultada');
        }}
      />

      {/* Divisor Redimensionável: Pastas <-> Área Principal */}
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={(e) => startResize('sidebar', e)}
        onDoubleClick={() => {
          setIsSidebarCollapsed(false);
          setSidebarWidth(240);
        }}
        title="Arraste para redimensionar as pastas (duplo clique para restaurar)"
        className={`w-1.5 -ml-[3px] -mr-[2px] z-20 shrink-0 cursor-col-resize transition-colors flex items-center justify-center group ${
          resizingPane === 'sidebar'
            ? 'bg-brand-500/70'
            : 'bg-transparent hover:bg-brand-500/40'
        }`}
      >
        <div className="w-[2px] h-8 rounded-full bg-transparent group-hover:bg-brand-400/80 transition-colors" />
      </div>
        </>
      )}

      {/* Right Column: Blue Header + Clean White Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {/* Barra superior: cor de destaque do tema ativo (estilos em index.css → .mockup-header) */}
        <header className="mockup-header px-5 pt-2.5 pb-3 shrink-0 app-drag-region shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-xl font-bold tracking-tight truncate">
              {activeFolderTitle}
            </h1>

            <div className="flex items-center space-x-2 app-no-drag shrink-0">
              {activeModule !== 'mail' && toastMessage && (
                <div className="header-ghost px-3 py-1 border rounded-full text-[11px] font-medium truncate max-w-md">
                  {toastMessage}
                </div>
              )}

              {/* Window Controls */}
              <div className="flex items-center space-x-0.5 pl-2">
                <button
                  type="button"
                  onClick={() => window.electronAPI?.minimizeWindow?.()}
                  className="header-icon-btn p-1.5 rounded transition-colors"
                  title="Minimizar"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => window.electronAPI?.maximizeWindow?.()}
                  className="header-icon-btn p-1.5 rounded transition-colors"
                  title="Maximizar"
                >
                  <Square className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => window.electronAPI?.closeWindow?.()}
                  className="header-icon-btn header-close-btn p-1.5 rounded transition-colors"
                  title="Fechar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Action Row inside Blue Header (apenas no módulo E-mails) */}
          {activeModule === 'mail' && (
            <div className="mt-2 flex items-center justify-between gap-3 app-no-drag">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleSyncAll()}
                  className="header-solid flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold shadow-sm transition-colors shrink-0"
                >
                  <RotateCw
                    className={`header-accent-icon w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`}
                    style={{ width: '14px', height: '14px', transformOrigin: 'center' }}
                  />
                  <span>Sincronizar / Enviar e Receber</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setComposeDefaults({ recipient: '', subject: '' });
                    setIsComposeOpen(true);
                  }}
                  className="header-ghost flex items-center space-x-1.5 px-3 py-1 border rounded-md text-xs font-semibold transition-colors shrink-0"
                >
                  <MailPlus className="w-3.5 h-3.5" />
                  <span>Novo E-mail</span>
                </button>

                {/* Atalho: Regras de e-mails (a pesquisa fica no topo da lista de e-mails) */}
                {(() => {
                  const activeRules = rules.filter((r) => r.enabled).length;
                  return (
                    <button
                      type="button"
                      onClick={() => setIsRulesModalOpen(true)}
                      title="Configurar Motor de Regras Automáticas"
                      className="header-ghost flex items-center space-x-1.5 px-3 py-1 border rounded-md text-xs font-semibold transition-colors shrink-0"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Regras de e-mails</span>
                      {activeRules > 0 && (
                        <span
                          className="ml-0.5 px-1.5 rounded-full text-[10px] font-bold"
                          style={{ background: 'color-mix(in srgb, currentColor 20%, transparent)' }}
                        >
                          {activeRules}
                        </span>
                      )}
                    </button>
                  );
                })()}

                {/* Frase motivacional à direita da pesquisa */}
                <MotivationalBanner />
              </div>

              {(toastMessage || isSyncing) && (
                <div className="header-ghost px-3 py-1 border rounded-full text-[11px] font-medium truncate max-w-md">
                  {isSyncing ? 'Sincronizando contas de e-mails...' : toastMessage}
                </div>
              )}
            </div>
          )}
        </header>

        {/* Barra de Status: Modo Offline / Fila Offline Persistente (Outbox) */}
        {(!isOnline || offlineOutboxQueue.length > 0) && (
          <div
            className={`px-4 py-1.5 text-xs flex items-center justify-between gap-3 shrink-0 border-b ${
              !isOnline
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-900 dark:text-amber-200'
                : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-900 dark:text-indigo-200'
            }`}
          >
            <div className="flex items-center gap-2 font-medium truncate">
              <span>{!isOnline ? '📡 Modo Offline' : '📤 Fila Offline (Caixa de Saída)'}</span>
              <span className="opacity-80">
                {!isOnline
                  ? offlineOutboxQueue.length > 0
                    ? `— ${offlineOutboxQueue.length} mensagem(ns) aguardando conexão para envio automático.`
                    : '— Novos envios serão guardados automaticamente na Caixa de Saída.'
                  : `— ${offlineOutboxQueue.length} mensagem(ns) pendente(s) de envio.`}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {offlineOutboxQueue.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveModule('mail');
                    setCurrentFolder('outbox');
                  }}
                  className="px-2.5 py-0.5 rounded-md bg-white/80 hover:bg-white text-slate-800 text-[11px] font-semibold border border-slate-300 transition-colors"
                >
                  Ver Caixa de Saída
                </button>
              )}
              {isOnline && offlineOutboxQueue.length > 0 && (
                <button
                  type="button"
                  disabled={isFlushingOutbox}
                  onClick={() => void flushOfflineOutbox()}
                  className="px-2.5 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[11px] font-semibold transition-colors"
                >
                  {isFlushingOutbox ? 'Enviando...' : 'Enviar agora'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Main Workspace (Clean White or Dark Mode) */}
        <div
          className={`flex-1 flex overflow-hidden ${
            themeMode === 'clean' ? 'clean-white bg-white text-slate-800' : 'bg-slate-950 text-slate-100'
          }`}
        >
          {activeModule === 'mail' && (
            <div
              className={`flex-1 flex overflow-hidden ${
                emailLayoutMode === 'horizontal' ? 'flex-col' : 'flex-row'
              }`}
            >

              {/* Column 2: Email List Grouped by Period */}
              {(emailLayoutMode !== 'fullscreen' || !isFullscreenReading || !selectedEmail) && (
                <EmailList
                  ref={emailListRef}
                  emails={currentFolderEmails}
                  selectedEmailId={selectedEmailId}
                  onSelectEmail={(id) => {
                    setActiveTabEmailId(null);
                    handleSelectEmail(id);
                    if (emailLayoutMode === 'fullscreen') {
                      setIsFullscreenReading(true);
                    }
                  }}
                  onDoubleClickEmail={(id) => {
                    handleOpenEmailInTab(id);
                  }}
                  onOpenInNewTab={handleOpenEmailInTab}
                  onToggleStar={handleToggleStar}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  activeAccountEmail={isUnifiedView ? undefined : currentAccount.email}
                  width={emailListWidth}
                  selectedIds={selectedEmailIds}
                  onToggleSelectId={handleToggleSelectId}
                  onSelectAllVisible={handleSelectAllVisible}
                  onClearSelection={() => setSelectedEmailIds([])}
                  onDeleteSelected={handleDeleteSelected}
                  onMarkSpamSelected={handleMarkSpam}
                  customFolders={customFolders.filter((f) => isUnifiedView || f.accountId === currentAccount.id)}
                  onMoveSelectedToFolder={handleMoveSelectedToFolder}
                  onAddContactsFromSelected={handleAddContactsFromEmailIds}
                  peopleOnly={peopleOnly}
                  onTogglePeopleOnly={() => setPeopleOnly((v) => !v)}
                  domainOnly={domainOnly}
                  onToggleDomainOnly={() => setDomainOnly((v) => !v)}
                  activeDomain={
                    currentAccount.email && currentAccount.email.includes('@')
                      ? currentAccount.email.split('@')[1].trim().toLowerCase()
                      : ''
                  }
                  attachmentsOnly={attachmentsOnly}
                  onToggleAttachmentsOnly={() => setAttachmentsOnly((v) => !v)}
                  isUnifiedView={isUnifiedView}
                  savedContactEmails={contacts.map((c) => c.email)}
                  accounts={settings.accounts.map((a) => ({ id: a.id, email: a.email, color: a.color }))}
                  onMarkAllAsRead={handleMarkCurrentFolderAllAsRead}
                  layoutMode={emailLayoutMode}
                  onChangeLayoutMode={handleChangeLayoutMode}
                  isMinimalLayout={isMinimalLayout}
                  onToggleMinimalLayout={handleToggleMinimalLayout}
                  groupByThread={groupByThread}
                  onToggleGroupByThread={handleToggleGroupByThread}
                  backfillProgress={mailBackfill.isRunning ? mailBackfill.progress : null}
                  isCancellingBackfill={mailBackfill.isCancelling}
                  onCancelBackfill={mailBackfill.cancel}
                />
              )}

              {/* Divisor Redimensionável: Lista de E-mails <-> Leitura (apenas no layout compacto) */}
              {emailLayoutMode === 'compact' && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  onMouseDown={(e) => startResize('emaillist', e)}
                  onDoubleClick={() => setEmailListWidth(360)}
                  title="Arraste para redimensionar a lista de e-mails (duplo clique para restaurar)"
                  className={`w-1.5 -ml-[3px] -mr-[2px] z-20 shrink-0 cursor-col-resize transition-colors flex items-center justify-center group ${
                    resizingPane === 'emaillist'
                      ? 'bg-brand-500/70'
                      : 'bg-transparent hover:bg-brand-500/40'
                  }`}
                >
                  <div className="w-[2px] h-8 rounded-full bg-transparent group-hover:bg-brand-400/80 transition-colors" />
                </div>
              )}

              {/* Overlay transparente durante arraste para WebView/iframes não roubarem o mouse */}
              {resizingPane && (
                <div className="fixed inset-0 z-50 cursor-col-resize" />
              )}

            {/* Column 3: Email Reading View + Abas de E-mail */}
            {(emailLayoutMode !== 'fullscreen' || (isFullscreenReading && displayedEmail)) && (
              <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
                <EmailTabsBar
                  tabs={openEmailTabs}
                  activeTabId={activeTabEmailId}
                  onSelectTab={(tabId) => setActiveTabEmailId(tabId)}
                  onCloseTab={handleCloseEmailTab}
                  onCloseAllTabs={handleCloseAllEmailTabs}
                />
                <EmailView
                  email={readerEmail}
                  threadMessages={readerThreadMessages}
                  onArchive={handleArchive}
                  onSnooze={handleSnooze}
                  onDelete={handleDelete}
                  onReply={handleReply}
                  onReplyAll={handleReplyAll}
                  onForward={handleForward}
                  onExpandModal={() => setIsReaderModalOpen(true)}
                  onOpenInNewTab={handleOpenEmailInTab}
                  isInTab={Boolean(activeTabEmailId && displayedEmail?.id === activeTabEmailId)}
                  customFolders={customFolders.filter((f) => f.accountId === currentAccount.id)}
                  onMoveToFolder={handleMoveToFolder}
                  onMarkSpam={(id) => handleMarkSpam([id])}
                  onUnmarkSpam={handleUnmarkSpam}
                  onAddContact={handleAddContact}
                  isSenderSaved={isEmailSavedAsContact(displayedEmail?.senderEmail)}
                  onToggleTask={handleToggleTask}
                  onToggleReadingList={handleToggleReadingList}
                  onToggleImportant={handleToggleImportant}
                  blockExternalImages={settings.security.blockExternalImages}
                  blockTrackingPixels={settings.security.blockTrackingPixels ?? true}
                  blockBlockedSenders={settings.security.blockBlockedSenders ?? true}
                  onChangePrivacySetting={handleQuickPrivacyChange}
                  onSendReadReceipt={handleSendReadReceipt}
                  onRespondCalendarInvite={handleRespondCalendarInvite}
                  onSnoozeWithTime={handleSnoozeWithTime}
                  onSetFollowUp={handleSetFollowUp}
                  onCreateTaskFromEmail={handleCreateTaskFromEmail}
                  onUnsubscribe={handleUnsubscribeEmail}
                  onToggleContactContext={handleToggleContactContext}
                  isContactContextOpen={isContactContextOpen}
                  onComposeNewEmail={() => {
                    const defaultAcc =
                      settings.accounts?.find((a) => a.isDefault) ||
                      settings.accounts?.[0] ||
                      currentAccount;
                    setComposeDraftId(undefined);
                    setComposeDefaults({ recipient: '', subject: '', body: '' });
                    setComposeAccountId(defaultAcc?.id);
                    setIsComposeOpen(true);
                  }}
                  onBackToList={
                    emailLayoutMode === 'fullscreen'
                      ? () => setIsFullscreenReading(false)
                      : undefined
                  }
                />
              </div>
            )}
            {isContactContextOpen && displayedEmail && (
              <Suspense fallback={null}>
                <ContactContextSidebar
                  email={displayedEmail}
                  allEmails={emails}
                  contacts={contacts}
                  onClose={handleToggleContactContext}
                  onSelectEmail={(id) => handleSelectEmail(id)}
                  onAddContact={(c) => {
                    handleAddContact({
                      name: c.name,
                      email: c.email,
                      role: 'Contato',
                      company: '',
                    });
                  }}
                  onComposeToContact={(addr) => {
                    setComposeDefaults({ recipient: addr, subject: '' });
                    setIsComposeOpen(true);
                  }}
                />
              </Suspense>
            )}
          </div>
        )}

        {/* Module: Calendário */}
        {activeModule === 'calendar' && (
          <Suspense fallback={<LazyModuleFallback />}>
            <CalendarView
              calendarSettings={settings.calendar}
              defaultOrganizer={currentAccount?.displayName || currentAccount?.email}
              accounts={settings.accounts}
              onSyncCloudCalendar={handleSyncCloudCalendar}
              onPushEventToCloud={handlePushCalendarEventToCloud}
              onUpdateEventInCloud={handleUpdateCalendarEventInCloud}
              onDeleteEventInCloud={handleDeleteCalendarEventInCloud}
            />
          </Suspense>
        )}

        {/* Module: Contatos */}
        {activeModule === 'contacts' && (
          <Suspense fallback={<LazyModuleFallback />}>
            <ContactsView
              contacts={contacts}
              onAddContact={handleAddContact}
              onImportContacts={handleImportContacts}
              onSyncCloudContacts={handleSyncCloudContacts}
              onUpdateContact={handleUpdateContact}
              onDeleteContact={handleDeleteContact}
              onComposeToContact={(email) => {
                setComposeDefaults({ recipient: email, subject: '' });
                setIsComposeOpen(true);
              }}
              onComposeToGroup={(groupEmails, groupName) => {
                setComposeDefaults({
                  recipient: groupEmails.join(', '),
                  subject: '',
                });
                setIsComposeOpen(true);
                showToast(`✉️ Compondo mensagem para o grupo "${groupName}" (${groupEmails.length} contatos).`);
              }}
            />
          </Suspense>
        )}

        {/* Module: Tarefas */}
        {activeModule === 'tasks' && (
          <Suspense fallback={<LazyModuleFallback />}>
            <TasksView
              tasks={tasks}
              onAddTask={handleAddTask}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
              onSyncTaskToCalendar={handleSyncTaskToCalendar}
              onOpenSourceEmail={(emailId) => {
                setActiveModule('mail');
                handleSelectEmail(emailId);
              }}
            />
          </Suspense>
        )}

        {/* Module: Estatísticas & Produtividade */}
        {activeModule === 'stats' && (
          <Suspense fallback={<LazyModuleFallback />}>
            <ProductivityDashboardView
              emails={emails}
              tasks={tasks}
              accounts={settings.accounts || []}
              offlineQueueCount={offlineOutboxQueue.length}
              onFilterBySender={(senderEmail) => {
                setActiveModule('mail');
                setCurrentFolder('inbox');
                setSearchQuery(senderEmail);
              }}
              onOpenModule={(mod) => setActiveModule(mod)}
            />
          </Suspense>
        )}

        {/* Module: Aplicativo Web Integrado */}
        {activeModule === 'webapp' && activeWebApp && (
          <WebAppPanel name={activeWebApp.name} url={activeWebApp.url} />
        )}
        </div>
      </div>

      {/* Painel lateral direito do WhatsApp Web (QR Code -> Lateral Direita) */}
      {settings.apps?.enableWhatsAppApp && (
        <WhatsAppPanel
          isOpen={isWhatsAppOpen}
          onClose={() => setIsWhatsAppOpen(false)}
        />
      )}

      {/* Caixa de Leitura Expandida do E-mail (ao clicar na mensagem) */}
      {isReaderModalOpen && (
        <Suspense fallback={null}>
          <EmailReaderModal
            isOpen={isReaderModalOpen}
            email={readerEmail}
            threadMessages={readerThreadMessages}
            onClose={() => setIsReaderModalOpen(false)}
            onArchive={handleArchive}
            onSnooze={handleSnooze}
            onDelete={handleDelete}
            onReply={handleReply}
            onReplyAll={handleReplyAll}
            onForward={handleForward}
            onAddContact={handleAddContact}
            isSenderSaved={isEmailSavedAsContact(displayedEmail?.senderEmail)}
            onSendReadReceipt={handleSendReadReceipt}
            onRespondCalendarInvite={handleRespondCalendarInvite}
            blockExternalImages={settings.security.blockExternalImages}
            blockTrackingPixels={settings.security.blockTrackingPixels ?? true}
            blockBlockedSenders={settings.security.blockBlockedSenders ?? true}
            onChangePrivacySetting={handleQuickPrivacyChange}
          />
        </Suspense>
      )}

      {/* Productivity Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigateFolder={handleSelectFolder}
        onCompose={() => {
          setComposeDefaults({ recipient: '', subject: '' });
          setIsComposeOpen(true);
        }}
        onArchiveCurrent={() => handleArchive()}
        onSnoozeCurrent={() => handleSnooze()}
        onExportCurrentEml={async () => {
          if (selectedEmail && window.electronAPI?.exportEmailToEml) {
            soundService.play('click');
            const res = await window.electronAPI.exportEmailToEml(selectedEmail);
            if (res.success && res.filePath) {
              soundService.play('pop');
              showToast(`✓ Mensagem exportada com sucesso em .EML!`);
            }
          }
        }}
        onToggleTheme={() => {}}
        onRefresh={() => handleSyncAll()}
        onOpenAnimationPreview={() => setIsAnimationPreviewOpen(true)}
        onOpenSetupWizard={() => setIsSetupWizardOpen(true)}
        onOpenSkins={() => {
          setSettingsInitialTab('appearance');
          setIsSettingsOpen(true);
        }}
        isDark={true}
      />

      {/* Preview Modal para os Ícones Animados (SVG + CSS Puro) */}
      <EmailAnimationPreviewModal
        isOpen={isAnimationPreviewOpen}
        onClose={() => setIsAnimationPreviewOpen(false)}
      />

      {/* Compose Modal */}
      {isComposeOpen && (
        <Suspense fallback={null}>
          <ComposeModal
            isOpen={isComposeOpen}
            onClose={() => {
              setIsComposeOpen(false);
              setComposeDraftId(undefined);
              setComposeAccountId(undefined);
            }}
            onSend={handleSendEmail}
            draftId={composeDraftId}
            draftAttachments={composeDraftId ? emails.find((e) => e.id === composeDraftId)?.draftAttachments : undefined}
            onSaveDraft={handleSaveDraft}
            onDiscardDraft={handleDiscardDraft}
            defaultRecipient={composeDefaults.recipient}
            defaultCc={composeDefaults.cc}
            defaultBcc={composeDefaults.bcc}
            defaultSubject={composeDefaults.subject}
            defaultBody={composeDefaults.body}
            defaultBodyHtml={composeDefaults.bodyHtml}
            defaultInReplyTo={composeDefaults.inReplyTo}
            defaultReferences={composeDefaults.references}
            accounts={settings.accounts}
            activeAccountId={composeAccountId || currentAccount.id}
            signatures={settings.signatures || []}
            contacts={contacts}
            draftAutoSaveEnabled={settings.drafts?.autoSaveEnabled ?? true}
            draftAutoSaveMinutes={settings.drafts?.autoSaveMinutes ?? 3}
            spellCheckEnabled={(settings.spellcheck?.enabled ?? true) && (settings.spellcheck?.checkEmailCompose ?? true)}
            outgoingAnimation={settings.sending?.outgoingAnimation ?? 'airplane'}
            confirmations={settings.notifications?.confirmations}
          />
        </Suspense>
      )}

      {/* Undo Send Floating Toast (8s) */}
      {pendingUndoSend && (
        <div className="fixed bottom-5 right-5 z-[70] bg-slate-900 border border-slate-700 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 animate-in fade-in">
          <div className="text-xs">
            <div className="font-bold">
              Enviando para{' '}
              <span className="text-sky-400">
                {pendingUndoSend.payload.recipient || pendingUndoSend.payload.cc || pendingUndoSend.payload.bcc}
              </span>
              ...
            </div>
            <div className="text-[11px] text-slate-400">
              Disparo automático em <strong className="text-amber-400">{pendingUndoSend.secondsLeft}s</strong>
            </div>
          </div>
          <button
            type="button"
            onClick={handleUndoSend}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors"
          >
            Desfazer
          </button>
          <button
            type="button"
            onClick={handleSendNowFromUndo}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-lg border border-slate-700 transition-colors"
          >
            Enviar agora
          </button>
        </div>
      )}

      {/* Configurações Internas Modal */}
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            initialTab={settingsInitialTab}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            onSaveSettings={handleSaveSettings}
            onOpenRules={() => {
              setIsSettingsOpen(false);
              setIsRulesModalOpen(true);
            }}
            activeRulesCount={rules.filter((r) => r.enabled).length}
            onOpenSetupWizard={() => {
              setIsSettingsOpen(false);
              setIsSetupWizardOpen(true);
            }}
            onComposeSupport={(recipient, subject, body) => {
              setComposeDefaults({ recipient, subject, body });
              setIsComposeOpen(true);
            }}
            emails={emails}
            onImportEmails={(imported) => {
              setEmails((prev) => [...imported, ...prev]);
              showToast(`✓ ${imported.length} mensagem(ns) importada(s)!`);
            }}
          />
        </Suspense>
      )}

      {/* Motor de Regras Automáticas */}
      {isRulesModalOpen && (
        <Suspense fallback={null}>
          <RulesModal
            isOpen={isRulesModalOpen}
            onClose={() => setIsRulesModalOpen(false)}
            rules={rules}
            onSaveRules={handleSaveRules}
            onRunRulesNow={handleRunRulesNow}
            customFolders={customFolders}
            accounts={settings.accounts}
          />
        </Suspense>
      )}

      {/* Assistente de Conexão de Contas (Primeiro Acesso ou ao Adicionar Nova Conta) */}
      {isSetupWizardOpen && (
        <Suspense fallback={null}>
          <AccountSetupWizardView
            currentSettings={settings}
            onAccountConnected={handleAccountConnectedFromWizard}
            onClose={handleCloseWizard}
            isFirstRun={isFirstRunSetup}
          />
        </Suspense>
      )}

      {/* Modal de Atualização Obrigatória (Auto-Update) */}
      <ForceUpdateModal />

      {/* Canal de resgate: versão bloqueada remotamente ou falha de instalação detectada */}
      <RescueUpdateBanner />

      {/* Overlay de Envio e Recebimento ao Fechar o Aplicativo */}
      {isClosingSync && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-[#0f1d32] border border-sky-500/30 rounded-2xl px-8 py-6 shadow-2xl flex flex-col items-center text-center max-w-sm">
            <div className="w-10 h-10 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin mb-4" />
            <h3 className="text-sm font-semibold text-white">
              Enviando e recebendo e-mails...
            </h3>
            <p className="text-xs text-slate-300 mt-1.5">
              Sincronizando suas contas antes de encerrar o Anectta MAIL.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
