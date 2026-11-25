import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect, useMemo } from 'react';
import {
  Search,
  Star,
  ChevronDown,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Mail,
  Paperclip,
  Zap,
  X,
  CheckSquare,
  Square,
  Users,
  Building2,
  Check,
  MoreVertical,
  PanelLeft,
  PanelTop,
  Maximize2,
  AlignJustify,
  CheckCheck,
  Clock,
  MessagesSquare,
  ExternalLink,
  SlidersHorizontal,
  Sparkles,
  Newspaper,
  Bell,
  Trash2,
  Loader2,
} from 'lucide-react';
import { CustomFolder, EmailItem, MailFolder, TimePeriod, TriageCategory } from '@/types/email';
import { SenderAvatar } from './SenderAvatar';
import { soundService } from '../services/soundService';
import { AmorosoFace } from './NotifierMascot';
import { filterRealAttachments } from '../utils/attachmentUtils';
import { getEmailTimestampMs, formatReceivedLabel } from '../utils/dateSortUtils';
import {
  EMAIL_SORT_FIELDS,
  EmailSortField,
  SORT_FIELD_STORAGE_KEY,
  SortGroupKey,
  compareGroupKeys,
  compareWithinGroup,
  getReceivedMs,
  getSentMs,
  getSortFieldInfo,
  getSortGroup,
  isDateSortField,
  loadSortField,
  loadDateOrder,
  DATE_ORDER_STORAGE_KEY,
} from '../utils/emailSort';
import { EmailThread, groupEmailsIntoThreads } from '../utils/threadUtils';
import type { BackfillProgress } from '../hooks/useMailBackfill';
import { classifyEmailTriage } from '../utils/triageAndTemplates';
import { EMAIL_DRAG_MIME } from '../utils/emailDrag';

export type EmailLayoutMode = 'compact' | 'horizontal' | 'fullscreen';

export interface EmailListRef {
  focusSearch: () => void;
}

interface EmailListProps {
  emails: EmailItem[];
  selectedEmailId: string | null;
  onSelectEmail: (id: string) => void;
  onDoubleClickEmail?: (id: string) => void;
  onOpenInNewTab?: (id: string) => void;
  onToggleStar: (id: string, e: React.MouseEvent) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeAccountEmail?: string;
  width?: number;
  selectedIds?: string[];
  onToggleSelectId?: (id: string) => void;
  onSelectAllVisible?: (ids: string[]) => void;
  onClearSelection?: () => void;
  onDeleteSelected?: (ids: string[]) => Promise<boolean> | boolean | void;
  onMarkSpamSelected?: (ids: string[]) => void;
  customFolders?: CustomFolder[];
  onMoveSelectedToFolder?: (ids: string[], targetFolder: MailFolder) => void;
  onAddContactsFromSelected?: (ids: string[]) => void;
  peopleOnly?: boolean;
  onTogglePeopleOnly?: () => void;
  domainOnly?: boolean;
  onToggleDomainOnly?: () => void;
  activeDomain?: string;
  attachmentsOnly?: boolean;
  onToggleAttachmentsOnly?: () => void;
  isUnifiedView?: boolean;
  savedContactEmails?: string[];
  accounts?: Array<{ id: string; email: string; color?: string }>;
  onMarkAllAsRead?: () => void;
  layoutMode?: EmailLayoutMode;
  onChangeLayoutMode?: (mode: EmailLayoutMode) => void;
  isMinimalLayout?: boolean;
  onToggleMinimalLayout?: () => void;
  groupByThread?: boolean;
  onToggleGroupByThread?: () => void;
  /** Download completo automático em andamento (null = nada sendo baixado). */
  backfillProgress?: BackfillProgress | null;
  isCancellingBackfill?: boolean;
  onCancelBackfill?: () => void;
  /** Astro: quantas pendências há (aguardando sua resposta / enviados sem resposta). */
  astroSummary?: { needsReply: number; awaitingAnswer: number };
  onOpenAstro?: () => void;
}

const AUTOMATED_SENDER_REGEX =
  /^(no-?reply|donotreply|do-not-reply|mailer-daemon|postmaster|newsletter|notifications?|alerts?|billing|faturamento|automated|bot|support|suporte|marketing|news|updates?|bounce|system)@/i;

function isAutomatedSender(item: EmailItem, savedSet: Set<string>): boolean {
  const emailAddr = (item.senderEmail || '').trim().toLowerCase();
  if (emailAddr && savedSet.has(emailAddr)) {
    return false;
  }
  return AUTOMATED_SENDER_REGEX.test(emailAddr);
}

/** Quantos itens da lista são desenhados por vez (o restante entra conforme a rolagem). */
const LIST_RENDER_PAGE = 100;

export const EmailList = forwardRef<EmailListRef, EmailListProps>(
  (
    {
      emails,
      selectedEmailId,
      onSelectEmail,
      onDoubleClickEmail,
      onOpenInNewTab,
      onToggleStar,
      searchQuery,
      onSearchChange,
      activeAccountEmail,
      width,
      selectedIds = [],
      onToggleSelectId,
      onSelectAllVisible,
      onClearSelection,
      onDeleteSelected,
      peopleOnly = false,
      onTogglePeopleOnly,
      domainOnly = false,
      onToggleDomainOnly,
      activeDomain = '',
      attachmentsOnly = false,
      onToggleAttachmentsOnly,
      isUnifiedView = false,
      savedContactEmails = [],
      accounts = [],
      onMarkAllAsRead,
      layoutMode = 'compact',
      onChangeLayoutMode,
      isMinimalLayout = false,
      onToggleMinimalLayout,
      groupByThread = true,
      onToggleGroupByThread,
      backfillProgress = null,
      isCancellingBackfill = false,
      onCancelBackfill,
      astroSummary,
      onOpenAstro,
    },
    ref
  ) => {
    const searchInputRef = useRef<HTMLInputElement>(null);
    const listScrollRef = useRef<HTMLDivElement>(null);
    const sortMenuRef = useRef<HTMLDivElement>(null);
    const moreMenuRef = useRef<HTMLDivElement>(null);
    const [isDeletingBulk, setIsDeletingBulk] = useState(false);
    const [deletingBulkCount, setDeletingBulkCount] = useState(0);
    const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'favorites'>('all');
    const [triageFilter, setTriageFilter] = useState<TriageCategory>('all');
    const [isAdvSearchOpen, setIsAdvSearchOpen] = useState(false);
    const [advSender, setAdvSender] = useState('');
    const [advDateFrom, setAdvDateFrom] = useState('');
    const [advDateTo, setAdvDateTo] = useState('');
    const [advHasAttachment, setAdvHasAttachment] = useState(false);
    const [advUnreadOnly, setAdvUnreadOnly] = useState(false);
    const activeAdvFilterCount =
      (advSender.trim() ? 1 : 0) +
      (advDateFrom ? 1 : 0) +
      (advDateTo ? 1 : 0) +
      (advHasAttachment ? 1 : 0) +
      (advUnreadOnly ? 1 : 0);

    const triageCounts = useMemo(() => {
      let priority = 0;
      let newsletters = 0;
      let notifications = 0;
      for (const e of emails) {
        const cat = classifyEmailTriage(e);
        if (cat === 'priority') priority++;
        else if (cat === 'newsletters') newsletters++;
        else if (cat === 'notifications') notifications++;
      }
      return { priority, newsletters, notifications };
    }, [emails]);
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>(() => {
      try {
        const saved = localStorage.getItem('anectta_email_sort_order');
        return saved === 'asc' ? 'asc' : 'desc';
      } catch {
        return 'desc';
      }
    });
    const [sortField, setSortField] = useState<EmailSortField>(loadSortField);
    const sortFieldInfo = getSortFieldInfo(sortField);
    // "Mais recentes / Mais antigos" dentro dos grupos (critérios que não são data)
    const [dateOrder, setDateOrder] = useState<'desc' | 'asc'>(loadDateOrder);
    const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const [collapsedPeriods, setCollapsedPeriods] = useState<Record<string, boolean>>({});
    const [ftsMatchedIds, setFtsMatchedIds] = useState<string[] | null>(null);
    const [searchLatencyMs, setSearchLatencyMs] = useState<number | null>(null);
    const [openTrackingId, setOpenTrackingId] = useState<string | null>(null);

    useEffect(() => {
      if (!openTrackingId) return;
      const handleClosePopover = () => setOpenTrackingId(null);
      window.addEventListener('click', handleClosePopover);
      return () => window.removeEventListener('click', handleClosePopover);
    }, [openTrackingId]);

    const handleSelectSortOrder = (order: 'desc' | 'asc') => {
      soundService.play('pop');
      setSortOrder(order);
      try {
        localStorage.setItem('anectta_email_sort_order', order);
      } catch {
        // ignore storage errors
      }
      setIsSortMenuOpen(false);
    };

    /** Mais recentes / Mais antigos: nos critérios de data é a própria ordem; nos demais, a ordem dentro dos grupos. */
    const handleSelectDateOrder = (order: 'desc' | 'asc') => {
      if (isDateSortField(sortField)) {
        handleSelectSortOrder(order);
        return;
      }
      soundService.play('pop');
      setDateOrder(order);
      try {
        localStorage.setItem(DATE_ORDER_STORAGE_KEY, order);
      } catch {
        // ignore storage errors
      }
      setIsSortMenuOpen(false);
    };

    /** Troca o critério e aplica a direção natural dele (datas: recentes; textos: A → Z). */
    const handleSelectSortField = (field: EmailSortField) => {
      soundService.play('pop');
      const info = getSortFieldInfo(field);
      setSortField(field);
      setSortOrder(info.defaultDirection);
      setCollapsedPeriods({});
      try {
        localStorage.setItem(SORT_FIELD_STORAGE_KEY, field);
        localStorage.setItem('anectta_email_sort_order', info.defaultDirection);
      } catch {
        // ignore storage errors
      }
      setIsSortMenuOpen(false);
    };

    useEffect(() => {
      if (!isSortMenuOpen) return;

      const handleClickOutside = (event: MouseEvent) => {
        if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
          setIsSortMenuOpen(false);
        }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setIsSortMenuOpen(false);
        } else if (event.key.toLowerCase() === 'r') {
          event.preventDefault();
          handleSelectDateOrder('desc');
        } else if (event.key.toLowerCase() === 'm') {
          event.preventDefault();
          handleSelectDateOrder('asc');
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [isSortMenuOpen, sortField]);

    useEffect(() => {
      if (!isMoreMenuOpen) return;

      const handleClickOutside = (event: MouseEvent) => {
        if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
          setIsMoreMenuOpen(false);
        }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setIsMoreMenuOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [isMoreMenuOpen]);

    useImperativeHandle(ref, () => ({
      focusSearch: () => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      },
    }));

    // Dispara busca ultra-rápida FTS5 em SQLite no processo principal quando há termo de busca
    useEffect(() => {
      if (!searchQuery.trim()) {
        setFtsMatchedIds(null);
        setSearchLatencyMs(null);
        return;
      }

      let isMounted = true;
      if (window.electronAPI?.searchEmailsFts) {
        window.electronAPI
          .searchEmailsFts({ query: searchQuery, accountEmail: activeAccountEmail })
          .then((res) => {
            if (isMounted) {
              setFtsMatchedIds(res.results);
              setSearchLatencyMs(res.durationMs);
            }
          })
          .catch(() => {
            if (isMounted) setFtsMatchedIds(null);
          });
      }

      return () => {
        isMounted = false;
      };
    }, [searchQuery, activeAccountEmail]);

    const togglePeriod = (period: string) => {
      setCollapsedPeriods((prev) => ({
        ...prev,
        [period]: !prev[period],
      }));
    };

    const savedContactSet = useMemo(
      () => new Set(savedContactEmails.map((e) => e.trim().toLowerCase())),
      [savedContactEmails]
    );
    const normalizedActiveDomain = activeDomain.trim().toLowerCase();

    // Filter pipeline: Prioriza SQLite FTS5 se disponível, com fallback local (memoizado)
    const filteredEmails = useMemo(() => {
      const ftsSet = ftsMatchedIds !== null ? new Set(ftsMatchedIds) : null;
      const q = searchQuery.trim().toLowerCase();

      return emails.filter((item) => {
        if (peopleOnly && isAutomatedSender(item, savedContactSet)) {
          return false;
        }

        if (domainOnly && normalizedActiveDomain) {
          const senderClean = (item.senderEmail || '').trim().toLowerCase();
          const atIdx = senderClean.lastIndexOf('@');
          const senderDomain = atIdx >= 0 ? senderClean.slice(atIdx + 1) : '';
          if (senderDomain !== normalizedActiveDomain) {
            return false;
          }
        }

        const hasAttachmentsList = Boolean(item.attachments && item.attachments.length > 0);
        const realAttachments =
          attachmentsOnly || q
            ? hasAttachmentsList
              ? filterRealAttachments(item.attachments!, item.bodyHtml)
              : []
            : [];
        const hasAnyAttachment =
          attachmentsOnly || q
            ? realAttachments.length > 0 || Boolean(item.hasAttachment)
            : Boolean(item.hasAttachment || hasAttachmentsList);

        if (attachmentsOnly && !hasAnyAttachment) {
          return false;
        }

        // Triagem Inteligente
        if (triageFilter !== 'all') {
          const cat = classifyEmailTriage(item);
          if (cat !== triageFilter) return false;
        }

        // Busca Avançada Visual
        if (advSender.trim()) {
          const s = advSender.trim().toLowerCase();
          const hit =
            (item.sender || '').toLowerCase().includes(s) ||
            (item.senderEmail || '').toLowerCase().includes(s);
          if (!hit) return false;
        }
        if (advHasAttachment && !hasAnyAttachment) {
          return false;
        }
        if (advUnreadOnly && item.isRead) {
          return false;
        }
        if (advDateFrom || advDateTo) {
          const ts = getEmailTimestampMs(item);
          if (advDateFrom) {
            const fromMs = new Date(`${advDateFrom}T00:00:00`).getTime();
            if (!Number.isNaN(fromMs) && ts < fromMs) return false;
          }
          if (advDateTo) {
            const toMs = new Date(`${advDateTo}T23:59:59.999`).getTime();
            if (!Number.isNaN(toMs) && ts > toMs) return false;
          }
        }

        let matchesSearch = true;
        if (q) {
          const localMatches = Boolean(
            (item.subject && item.subject.toLowerCase().includes(q)) ||
              (item.sender && item.sender.toLowerCase().includes(q)) ||
              (item.senderEmail && item.senderEmail.toLowerCase().includes(q)) ||
              (item.snippet && item.snippet.toLowerCase().includes(q)) ||
              (item.body && item.body.toLowerCase().includes(q)) ||
              item.tags?.some((t) => t.toLowerCase().includes(q)) ||
              realAttachments.some((att) => (att.name || '').toLowerCase().includes(q))
          );
          matchesSearch = ftsSet !== null ? ftsSet.has(item.id) || localMatches : localMatches;
        }

        const matchesUnread =
          activeTab === 'unread'
            ? !item.isRead
            : activeTab === 'favorites'
            ? Boolean(item.isStarred)
            : true;

        return matchesSearch && matchesUnread;
      });
    }, [
      emails,
      peopleOnly,
      savedContactSet,
      domainOnly,
      normalizedActiveDomain,
      attachmentsOnly,
      searchQuery,
      ftsMatchedIds,
      activeTab,
      triageFilter,
      advSender,
      advDateFrom,
      advDateTo,
      advHasAttachment,
      advUnreadOnly,
    ]);

    // Agrupamento: por período (critérios de data) ou pelo critério escolhido - memoizado
    const groupedEmails = useMemo((): Array<{ id: string; label: string; items: Array<{ email: EmailItem; thread: EmailThread | null; ts: number }> }> => {
      if (!isDateSortField(sortField)) {
        type Entry = { email: EmailItem; thread: EmailThread | null; ts: number };
        const groups = new Map<string, { key: SortGroupKey; items: Entry[] }>();
        const add = (entry: Entry, hasAtt: boolean, unread: boolean, starred: boolean) => {
          const key = getSortGroup(entry.email, sortField, hasAtt, unread, starred);
          const g = groups.get(key.id);
          if (g) g.items.push(entry);
          else groups.set(key.id, { key, items: [entry] });
        };
        if (groupByThread) {
          for (const thread of groupEmailsIntoThreads(filteredEmails, 'desc')) {
            add(
              { email: thread.latestEmail, thread, ts: Math.max(...thread.messages.map(getReceivedMs)) },
              thread.hasAttachment,
              thread.hasUnread,
              thread.isStarred
            );
          }
        } else {
          for (const e of filteredEmails) {
            const hasAtt =
              e.attachments && e.attachments.length > 0
                ? filterRealAttachments(e.attachments, e.bodyHtml).length > 0
                : Boolean(e.hasAttachment);
            add({ email: e, thread: null, ts: getReceivedMs(e) }, hasAtt, !e.isRead, Boolean(e.isStarred));
          }
        }
        return Array.from(groups.values())
          .sort((a, b) => compareGroupKeys(a.key.sortKey, b.key.sortKey, sortOrder))
          .map((g) => ({
            id: g.key.id,
            label: g.key.label,
            items: g.items.sort((a, b) => compareWithinGroup(a, b, sortField, sortOrder, dateOrder)),
          }));
      }

      const dateOf = sortField === 'sent' ? getSentMs : getReceivedMs;
      const periodsOrder: { id: TimePeriod; label: string }[] =
        sortOrder === 'desc'
          ? [
              { id: 'today', label: 'Hoje' },
              { id: 'yesterday', label: 'Ontem' },
              { id: 'last_week', label: 'Semana Passada' },
              { id: 'older', label: 'Mais Antigos' },
            ]
          : [
              { id: 'older', label: 'Mais Antigos' },
              { id: 'last_week', label: 'Semana Passada' },
              { id: 'yesterday', label: 'Ontem' },
              { id: 'today', label: 'Hoje' },
            ];

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const DAY = 24 * 60 * 60 * 1000;

      const resolvePeriod = (e: (typeof filteredEmails)[number]): TimePeriod => {
        if (!e.dateStr && !e.receivedDateStr) return e.period;
        const ms = dateOf(e);
        if (isNaN(ms)) return e.period;
        if (ms >= todayStart) return 'today';
        if (ms >= todayStart - DAY) return 'yesterday';
        if (ms >= todayStart - 7 * DAY) return 'last_week';
        return 'older';
      };

      type ListEntry = { email: EmailItem; thread: EmailThread | null; ts: number };
      const buckets: Record<TimePeriod, ListEntry[]> = {
        today: [],
        yesterday: [],
        last_week: [],
        older: [],
      };

      if (groupByThread) {
        const threads = groupEmailsIntoThreads(filteredEmails, sortOrder);
        for (const thread of threads) {
          buckets[resolvePeriod(thread.latestEmail)].push({
            email: thread.latestEmail,
            thread,
            ts: sortField === 'sent' ? thread.latestTimestampMs : Math.max(...thread.messages.map(getReceivedMs)),
          });
        }
      } else {
        for (const e of filteredEmails) {
          buckets[resolvePeriod(e)].push({
            email: e,
            thread: null,
            ts: dateOf(e),
          });
        }
      }

      return periodsOrder
        .map((period) => {
          const items = buckets[period.id];
          items.sort((a, b) => (sortOrder === 'desc' ? b.ts - a.ts : a.ts - b.ts));
          return {
            ...period,
            items,
          };
        })
        .filter((group) => group.items.length > 0);
    }, [filteredEmails, sortOrder, sortField, dateOrder, groupByThread]);

    // Arrastar para pasta: um id marcado que é o último de uma conversa leva a conversa inteira.
    const threadIdsByLatest = useMemo(() => {
      const map = new Map<string, string[]>();
      for (const g of groupedEmails) {
        for (const it of g.items) {
          if (it.thread && it.thread.count > 1) map.set(it.email.id, it.thread.messages.map((m) => m.id));
        }
      }
      return map;
    }, [groupedEmails]);
    const expandThreadIds = (ids: string[]) =>
      Array.from(new Set(ids.flatMap((id) => threadIdsByLatest.get(id) || [id])));

    // Desenho progressivo: só os primeiros itens são desenhados; os demais entram conforme a
    // rolagem. Evita travar com caixas grandes (ex.: Caixa Unificada com várias contas).
    // O limite volta ao início quando muda a pasta, a conta, a busca, o filtro ou a ordenação.
    const listContextKey = [
      activeAccountEmail,
      isUnifiedView ? 'u' : '',
      emails[0]?.folder || '',
      searchQuery,
      activeTab,
      triageFilter,
      sortField,
      sortOrder,
      dateOrder,
      groupByThread ? 't' : '',
      peopleOnly ? 'p' : '',
      domainOnly ? activeDomain : '',
      attachmentsOnly ? 'a' : '',
    ].join('|');
    const [renderLimitState, setRenderLimitState] = useState({ key: listContextKey, limit: LIST_RENDER_PAGE });
    const renderLimit = renderLimitState.key === listContextKey ? renderLimitState.limit : LIST_RENDER_PAGE;
    const growRenderLimit = (to: number) =>
      setRenderLimitState((prev) => {
        const current = prev.key === listContextKey ? prev.limit : LIST_RENDER_PAGE;
        return to > current ? { key: listContextKey, limit: to } : prev;
      });

    const { visibleGroups, hasMoreToRender } = useMemo(() => {
      let budget = renderLimit;
      let remaining = 0;
      const out: Array<(typeof groupedEmails)[number] & { total: number }> = [];
      for (const g of groupedEmails) {
        const collapsed = Boolean(collapsedPeriods[g.id]);
        if (budget <= 0) {
          if (!collapsed) remaining += g.items.length;
          continue;
        }
        if (collapsed) {
          out.push({ ...g, total: g.items.length });
          continue;
        }
        const shown = g.items.length > budget ? g.items.slice(0, budget) : g.items;
        remaining += g.items.length - shown.length;
        budget -= shown.length;
        out.push({ ...g, items: shown, total: g.items.length });
      }
      return { visibleGroups: out, hasMoreToRender: remaining > 0 };
    }, [groupedEmails, collapsedPeriods, renderLimit]);

    // E-mail selecionado além do trecho desenhado (ex.: navegação pelo teclado): estende até ele.
    useEffect(() => {
      if (!selectedEmailId) return;
      let idx = 0;
      for (const g of groupedEmails) {
        if (collapsedPeriods[g.id]) continue;
        for (const it of g.items) {
          if (it.email.id === selectedEmailId || it.thread?.messages.some((m) => m.id === selectedEmailId)) {
            if (idx >= renderLimit) growRenderLimit(idx + LIST_RENDER_PAGE);
            return;
          }
          idx++;
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEmailId, groupedEmails]);

    // Mantém o e-mail selecionado visível (ex.: descendo com a seta, a lista rola junto).
    useEffect(() => {
      if (!selectedEmailId) return;
      const root = listScrollRef.current;
      if (!root) return;
      const raf = requestAnimationFrame(() => {
        const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(selectedEmailId) : selectedEmailId;
        const el = root.querySelector<HTMLElement>(`[data-email-ids~="${esc}"]`);
        el?.scrollIntoView({ block: 'nearest' });
      });
      return () => cancelAnimationFrame(raf);
    }, [selectedEmailId, renderLimit]);

    // Ao chegar perto do fim do trecho desenhado, desenha o próximo bloco.
    const loadMoreRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (!hasMoreToRender) return;
      const el = loadMoreRef.current;
      const root = listScrollRef.current;
      if (!el || !root || typeof IntersectionObserver === 'undefined') return;
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) growRenderLimit(renderLimit + LIST_RENDER_PAGE);
        },
        { root, rootMargin: '0px 0px 800px 0px' }
      );
      io.observe(el);
      return () => io.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasMoreToRender, renderLimit, listContextKey]);

    return (
      <section
        style={layoutMode === 'compact' && width ? { width: `${width}px` } : undefined}
        className={
          layoutMode === 'horizontal'
            ? 'w-full h-[42%] min-h-[220px] max-h-[55%] bg-slate-925 border-b border-slate-800/80 flex flex-col shrink-0 text-xs'
            : layoutMode === 'fullscreen'
            ? 'w-full flex-1 min-w-0 bg-slate-925 flex flex-col h-full text-xs'
            : 'w-80 lg:w-[360px] bg-slate-925 border-r border-slate-800/80 flex flex-col shrink-0 h-full text-xs'
        }
      >
        {/* Top Header: Search Bar */}
        <div className="p-2.5 border-b border-slate-800 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={
                activeAccountEmail
                  ? `Pesquisar em ${activeAccountEmail}...`
                  : 'Pesquisar mensagens...'
              }
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-20 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all"
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchLatencyMs !== null ? (
                <span
                  className="px-1.5 py-0.5 text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded flex items-center space-x-0.5"
                  title="Tempo de resposta da consulta SQLite FTS5"
                >
                  <Zap className="w-2.5 h-2.5 text-emerald-400" />
                  <span>{searchLatencyMs}ms</span>
                </span>
              ) : (
                <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-slate-800 text-slate-400 rounded border border-slate-700">
                  /
                </kbd>
              )}
              <button
                type="button"
                onClick={() => setIsAdvSearchOpen((v) => !v)}
                title="Busca Avançada Visual (remetente, período, anexos, não lidos)"
                className={`relative p-1 rounded-md border transition-colors ${
                  isAdvSearchOpen || activeAdvFilterCount > 0
                    ? 'bg-brand-500/20 text-brand-400 border-brand-500/40'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border-slate-700'
                }`}
              >
                <SlidersHorizontal className="w-3 h-3" />
                {activeAdvFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-brand-500 text-white text-[8px] font-bold flex items-center justify-center">
                    {activeAdvFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Painel Expansível de Busca Avançada Visual */}
          {isAdvSearchOpen && (
            <div className="p-2.5 rounded-xl bg-slate-900/95 border border-slate-700/80 space-y-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Busca Avançada
                </span>
                {activeAdvFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAdvSender('');
                      setAdvDateFrom('');
                      setAdvDateTo('');
                      setAdvHasAttachment(false);
                      setAdvUnreadOnly(false);
                    }}
                    className="text-[10px] font-semibold text-rose-400 hover:text-rose-300"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
              <input
                type="text"
                value={advSender}
                onChange={(e) => setAdvSender(e.target.value)}
                placeholder="Remetente (nome ou e-mail)..."
                className="w-full px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[9px] text-slate-400 mb-0.5">De</label>
                  <input
                    type="date"
                    value={advDateFrom}
                    onChange={(e) => setAdvDateFrom(e.target.value)}
                    className="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-[10px]"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400 mb-0.5">Até</label>
                  <input
                    type="date"
                    value={advDateTo}
                    onChange={(e) => setAdvDateTo(e.target.value)}
                    className="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-[10px]"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-0.5">
                <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advHasAttachment}
                    onChange={(e) => setAdvHasAttachment(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  <span>Com anexo</span>
                </label>
                <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advUnreadOnly}
                    onChange={(e) => setAdvUnreadOnly(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  <span>Não lidos</span>
                </label>
              </div>
            </div>
          )}

          {/* Astro: pendências (aguardando sua resposta / enviados sem resposta) */}
          {astroSummary && astroSummary.needsReply + astroSummary.awaitingAnswer > 0 && onOpenAstro && (
            <button
              type="button"
              onClick={() => {
                soundService.play('click');
                onOpenAstro();
              }}
              className="assistant-card w-full flex items-center gap-2 px-2 py-1 rounded-lg bg-sky-500/10 border border-sky-500/30 hover:bg-sky-500/15 text-left transition-colors"
              title="Ver pendências do Astro"
            >
              <AmorosoFace size={20} />
              <span className="flex-1 min-w-0 truncate text-[11px] text-sky-100">
                <strong className="text-sky-200">Astro:</strong>{' '}
                {[
                  astroSummary.needsReply > 0 &&
                    `${astroSummary.needsReply} ${astroSummary.needsReply === 1 ? 'aguarda' : 'aguardam'} sua resposta`,
                  astroSummary.awaitingAnswer > 0 && `${astroSummary.awaitingAnswer} sem resposta`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-sky-300 shrink-0" />
            </button>
          )}

          {/* Triagem Inteligente (Prioritários / Newsletters / Notificações) */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {(
              [
                { id: 'all', label: 'Tudo', count: emails.length, icon: null },
                { id: 'priority', label: 'Prioritários', count: triageCounts.priority, icon: Sparkles },
                { id: 'newsletters', label: 'Newsletters', count: triageCounts.newsletters, icon: Newspaper },
                { id: 'notifications', label: 'Notificações', count: triageCounts.notifications, icon: Bell },
              ] as const
            ).map((pill) => {
              const Icon = pill.icon;
              const active = triageFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setTriageFilter(pill.id)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-brand-500/20 text-brand-300 border-brand-500/50'
                      : 'bg-slate-900/70 text-slate-400 hover:text-slate-200 border-slate-800'
                  }`}
                >
                  {Icon && <Icon className="w-2.5 h-2.5" />}
                  <span>{pill.label}</span>
                  <span className="opacity-70 text-[9px]">{pill.count}</span>
                </button>
              );
            })}
          </div>

          {/* Subheader Tabs (Exact Outlook Style: "Todas", "Não lidos", "Por Data ↓") */}
          <div className="flex items-center justify-between gap-2 pt-0.5 px-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <button
                onClick={() => setActiveTab('all')}
                className={`font-semibold pb-1 transition-colors relative ${
                  activeTab === 'all'
                    ? 'text-brand-400 border-b-2 border-brand-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setActiveTab('unread')}
                className={`font-medium pb-1 transition-colors relative ${
                  activeTab === 'unread'
                    ? 'text-brand-400 border-b-2 border-brand-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Não lidos
              </button>
              <button
                onClick={() => setActiveTab('favorites')}
                className={`font-medium pb-1 transition-colors relative ${
                  activeTab === 'favorites'
                    ? 'text-brand-400 border-b-2 border-brand-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Favoritos
              </button>
              {onTogglePeopleOnly && (
                <button
                  type="button"
                  onClick={onTogglePeopleOnly}
                  title="Filtrar apenas mensagens de pessoas (oculta no-reply, newsletters e alertas automáticos)"
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                    peopleOnly
                      ? 'filter-chip is-on'
                      : 'filter-chip'
                  }`}
                >
                  <Users className="w-3 h-3" />
                  <span>Pessoas</span>
                </button>
              )}
              {onToggleDomainOnly && activeDomain && (
                <button
                  type="button"
                  onClick={onToggleDomainOnly}
                  title={`Filtrar apenas e-mails do seu domínio (@${activeDomain})`}
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors max-w-[130px] ${
                    domainOnly
                      ? 'filter-chip is-on'
                      : 'filter-chip'
                  }`}
                >
                  <Building2 className="w-3 h-3 shrink-0" />
                  <span className="truncate">@{activeDomain}</span>
                </button>
              )}
              {onToggleAttachmentsOnly && (
                <button
                  type="button"
                  onClick={onToggleAttachmentsOnly}
                  title="Busca Dedicada de Anexos: exibe apenas e-mails com anexos e busca pelo nome dos arquivos"
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
                    attachmentsOnly
                      ? 'filter-chip is-on'
                      : 'filter-chip'
                  }`}
                >
                  <Paperclip className="w-3 h-3 shrink-0" />
                  <span>Anexos</span>
                </button>
              )}
            </div>

            <div ref={sortMenuRef} className="relative flex items-center space-x-1">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={isSortMenuOpen}
                onClick={() => {
                  soundService.play('pop');
                  setIsSortMenuOpen((prev) => !prev);
                }}
                className={`flex items-center gap-0.5 px-1.5 py-1 rounded-md border transition-colors cursor-pointer ${
                  isSortMenuOpen
                    ? 'bg-brand-500/20 text-brand-400 border-brand-500/40'
                    : 'text-slate-400 border-slate-700/60 hover:text-slate-200 hover:bg-brand-500/15'
                }`}
                title={`Ordenar — ${sortFieldInfo.label}: ${
                  sortOrder === 'desc' ? sortFieldInfo.directions[0] : sortFieldInfo.directions[1]
                }`}
                aria-label="Ordenar"
              >
                {sortOrder === 'desc' ? (
                  <ArrowDownWideNarrow className="w-4 h-4" />
                ) : (
                  <ArrowUpNarrowWide className="w-4 h-4" />
                )}
                <ChevronDown className="w-3 h-3 opacity-70" />
              </button>

              {isSortMenuOpen && (
                <div
                  role="menu"
                  aria-label="Ordenar"
                  className="absolute right-0 top-full mt-1 w-64 max-h-[70vh] overflow-y-auto bg-slate-900 border border-slate-700/90 rounded-lg shadow-2xl py-1.5 z-50 text-xs text-slate-200"
                >
                  {(() => {
                    const renderOption = (
                      key: string,
                      active: boolean,
                      dir: 'desc' | 'asc',
                      label: string,
                      onSelect: () => void,
                      indent = false
                    ) => (
                      <button
                        key={key}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={onSelect}
                        className={`w-full flex items-center gap-2 ${indent ? 'pl-8 pr-3' : 'px-3'} py-1.5 text-left hover:bg-brand-500/15 transition-colors cursor-pointer`}
                      >
                        <span className="w-3.5 flex items-center justify-center shrink-0">
                          {active && <Check className="w-3.5 h-3.5 text-brand-400" />}
                        </span>
                        {dir === 'desc' ? (
                          <ArrowDown className="w-3 h-3 text-slate-500 shrink-0" />
                        ) : (
                          <ArrowUp className="w-3 h-3 text-slate-500 shrink-0" />
                        )}
                        <span className={active ? 'font-semibold text-slate-100' : 'text-slate-300'}>{label}</span>
                      </button>
                    );
                    const isDate = isDateSortField(sortField);
                    // Mais recentes / Mais antigos: primeira ordem, sempre no topo e válida para todas as pastas.
                    // Nos critérios de data é a própria ordem; nos demais, a ordem dos e-mails dentro dos grupos.
                    const dateActive = isDate ? sortOrder : dateOrder;
                    return (
                      <>
                        <div className="px-3 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          Ordem
                        </div>
                        {renderOption('date-desc', dateActive === 'desc', 'desc', 'Mais recentes', () =>
                          handleSelectDateOrder('desc')
                        )}
                        {renderOption('date-asc', dateActive === 'asc', 'asc', 'Mais antigos', () =>
                          handleSelectDateOrder('asc')
                        )}

                        <div className="my-1 border-t border-slate-800" />
                        <div className="px-3 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          Ordenar por
                        </div>
                        {EMAIL_SORT_FIELDS.map((f) => {
                          const active = sortField === f.id;
                          return (
                            <React.Fragment key={f.id}>
                              {f.separatorBefore && <div className="my-1 border-t border-slate-800" />}
                              <button
                                type="button"
                                role="menuitemradio"
                                aria-checked={active}
                                onClick={() => handleSelectSortField(f.id)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-brand-500/15 transition-colors cursor-pointer"
                              >
                                <span
                                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                                    active ? 'border-brand-400' : 'border-slate-600'
                                  }`}
                                >
                                  {active && <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />}
                                </span>
                                <span className={active ? 'font-semibold text-slate-100' : 'text-slate-300'}>{f.label}</span>
                              </button>
                              {/* Critério que não é data: A → Z / Z → A (ou equivalente) logo abaixo dele */}
                              {active &&
                                !isDate &&
                                (['desc', 'asc'] as const).map((dir, i) =>
                                  renderOption(
                                    `dir-${dir}`,
                                    sortOrder === dir,
                                    dir,
                                    sortFieldInfo.directions[i],
                                    () => handleSelectSortOrder(dir),
                                    true
                                  )
                                )}
                            </React.Fragment>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            <div ref={moreMenuRef} className="relative flex items-center">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={isMoreMenuOpen}
                onClick={() => {
                  soundService.play('pop');
                  setIsSortMenuOpen(false);
                  setIsMoreMenuOpen((prev) => !prev);
                }}
                title="Opções da caixa de e-mails e layout"
                className={`p-1 rounded transition-colors cursor-pointer ${
                  isMoreMenuOpen
                    ? 'bg-brand-500/20 text-brand-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-brand-500/15'
                }`}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {isMoreMenuOpen && (
                <div
                  role="menu"
                  aria-label="Opções da caixa de e-mails"
                  className="absolute right-0 top-full mt-1 w-64 bg-slate-900 border border-slate-700/90 rounded-lg shadow-2xl py-1.5 z-50 text-xs text-slate-200"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onMarkAllAsRead?.();
                    }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 text-left hover:bg-brand-500/15 transition-colors cursor-pointer"
                  >
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>Marcar tudo como lido</span>
                  </button>

                  <div className="my-1 border-t border-slate-800" />

                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={layoutMode === 'compact'}
                    onClick={() => {
                      soundService.play('pop');
                      onChangeLayoutMode?.('compact');
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-brand-500/15 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <PanelLeft className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className={layoutMode === 'compact' ? 'font-medium text-slate-100' : ''}>
                        Layout compacto
                      </span>
                    </span>
                    {layoutMode === 'compact' && <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />}
                  </button>

                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={layoutMode === 'horizontal'}
                    onClick={() => {
                      soundService.play('pop');
                      onChangeLayoutMode?.('horizontal');
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-brand-500/15 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <PanelTop className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className={layoutMode === 'horizontal' ? 'font-medium text-slate-100' : ''}>
                        Layout horizontal
                      </span>
                    </span>
                    {layoutMode === 'horizontal' && <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />}
                  </button>

                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={layoutMode === 'fullscreen'}
                    onClick={() => {
                      soundService.play('pop');
                      onChangeLayoutMode?.('fullscreen');
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-brand-500/15 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <Maximize2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className={layoutMode === 'fullscreen' ? 'font-medium text-slate-100' : ''}>
                        Layout de tela cheia
                      </span>
                    </span>
                    {layoutMode === 'fullscreen' && <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />}
                  </button>

                  <div className="my-1 border-t border-slate-800" />

                  {onToggleGroupByThread && (
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={groupByThread}
                      onClick={() => {
                        soundService.play('pop');
                        onToggleGroupByThread();
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-brand-500/15 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center space-x-2.5">
                        <MessagesSquare className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className={groupByThread ? 'font-medium text-slate-100' : ''}>
                          Agrupar em conversas
                        </span>
                      </span>
                      {groupByThread && <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />}
                    </button>
                  )}

                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={isMinimalLayout}
                    onClick={() => {
                      soundService.play('pop');
                      onToggleMinimalLayout?.();
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-brand-500/15 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center space-x-2.5">
                      <AlignJustify className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className={isMinimalLayout ? 'font-medium text-slate-100' : ''}>
                        Layout mínimo
                      </span>
                    </span>
                    <span className="flex items-center space-x-1.5 shrink-0">
                      {isMinimalLayout && <Check className="w-3.5 h-3.5 text-brand-400" />}
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-400 rounded border border-slate-700">
                        Ctrl+Shift+F
                      </kbd>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Download completo automático em segundo plano (todas as pastas e contas) */}
          {backfillProgress && (() => {
            const total = backfillProgress.total;
            const remaining = backfillProgress.remaining;
            const done =
              typeof total === 'number' && total > 0 && typeof remaining === 'number'
                ? Math.max(0, total - remaining)
                : undefined;
            const pct = done !== undefined && total ? Math.min(100, Math.round((done / total) * 100)) : undefined;
            return (
              <div className="px-2.5 py-2 bg-brand-500/15 border border-brand-500/35 rounded-md space-y-1.5 text-xs text-brand-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold min-w-0">
                    <Loader2 className="w-3.5 h-3.5 text-brand-400 animate-spin shrink-0" />
                    <span className="truncate" title={backfillProgress.label}>
                      Baixando e-mails do servidor — {backfillProgress.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-brand-300">+{backfillProgress.downloaded}</span>
                    {onCancelBackfill && (
                      <button
                        type="button"
                        disabled={isCancellingBackfill}
                        onClick={onCancelBackfill}
                        className="px-2 py-0.5 rounded bg-rose-600/90 hover:bg-rose-500 disabled:opacity-50 text-white text-[10px] font-semibold transition-colors"
                        title="Pausa o download mantendo os e-mails já baixados. Ele continua na próxima sincronização."
                      >
                        {isCancellingBackfill ? 'Cancelando...' : 'Cancelar'}
                      </button>
                    )}
                  </div>
                </div>
                {pct !== undefined && (
                  <div className="space-y-1">
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center justify-between">
                      <span>
                        {done} de {total} nesta pasta · faltam {remaining}
                      </span>
                      <span>{pct}%</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Aviso de andamento enquanto exclui e-mails em lote */}
          {isDeletingBulk && (
            <div className="px-2.5 py-2 bg-rose-500/15 border border-rose-500/35 rounded-md flex items-center gap-2 text-xs text-rose-200 font-semibold">
              <Loader2 className="w-3.5 h-3.5 text-rose-400 animate-spin shrink-0" />
              <span>
                Excluindo {deletingBulkCount}{' '}
                {deletingBulkCount === 1 ? 'e-mail selecionado' : 'e-mails selecionados'}...
              </span>
            </div>
          )}

          {/* Banner de resultado de busca + Selecionar todos & Excluir */}
          {!isDeletingBulk && (searchQuery.trim() || activeAdvFilterCount > 0) && (() => {
            const visibleIds = filteredEmails.map((e) => e.id);
            const selectedSet = new Set(selectedIds);
            const selectedInSearchIds = visibleIds.filter((id) => selectedSet.has(id));
            const allSelectedInSearch =
              visibleIds.length > 0 && selectedInSearchIds.length === visibleIds.length;

            return (
              <div className="px-2 py-1.5 bg-brand-500/10 border border-brand-500/20 rounded-md space-y-1.5 text-[11px] text-brand-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 truncate">
                    <Search className="w-3 h-3 text-brand-400 shrink-0" />
                    <span className="truncate">
                      <strong>{filteredEmails.length}</strong>{' '}
                      {filteredEmails.length === 1 ? 'e-mail' : 'e-mails'} encontrado(s) na conta marcada
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSearchChange('');
                      setAdvSender('');
                      setAdvDateFrom('');
                      setAdvDateTo('');
                      setAdvHasAttachment(false);
                      setAdvUnreadOnly(false);
                      onClearSelection?.();
                    }}
                    className="text-slate-400 hover:text-white shrink-0 ml-1.5 p-0.5 rounded hover:bg-slate-800 transition-colors"
                    title="Limpar pesquisa"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                {filteredEmails.length > 0 && (onSelectAllVisible || onDeleteSelected) && (
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-brand-500/20">
                    {onSelectAllVisible && (
                      <button
                        type="button"
                        disabled={isDeletingBulk}
                        onClick={() => {
                          soundService.play('click');
                          if (allSelectedInSearch) {
                            onClearSelection?.();
                          } else {
                            onSelectAllVisible(visibleIds);
                          }
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900/80 hover:bg-slate-800 disabled:opacity-50 border border-slate-700/80 text-slate-200 text-[11px] font-semibold transition-colors"
                        title={
                          allSelectedInSearch
                            ? 'Desmarcar todos os e-mails da busca'
                            : 'Selecionar todos os e-mails encontrados na busca'
                        }
                      >
                        {allSelectedInSearch ? (
                          <CheckSquare className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span>
                          {allSelectedInSearch
                            ? `Desmarcar todos (${visibleIds.length})`
                            : `Selecionar todos (${visibleIds.length})`}
                        </span>
                      </button>
                    )}

                    {onDeleteSelected && (
                      <button
                        type="button"
                        disabled={selectedInSearchIds.length === 0 || isDeletingBulk}
                        onClick={async () => {
                          if (selectedInSearchIds.length === 0 || isDeletingBulk) return;
                          setDeletingBulkCount(selectedInSearchIds.length);
                          setIsDeletingBulk(true);
                          try {
                            const deleted = await onDeleteSelected(selectedInSearchIds);
                            if (deleted !== false) {
                              // Limpa busca e filtros e retorna ao início da lista para nova pesquisa
                              onSearchChange('');
                              setAdvSender('');
                              setAdvDateFrom('');
                              setAdvDateTo('');
                              setAdvHasAttachment(false);
                              setAdvUnreadOnly(false);
                              setIsAdvSearchOpen(false);
                              onClearSelection?.();
                              requestAnimationFrame(() => {
                                listScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                                searchInputRef.current?.focus();
                              });
                            }
                          } finally {
                            setIsDeletingBulk(false);
                            setDeletingBulkCount(0);
                          }
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600/90 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-semibold transition-colors shrink-0"
                        title="Excluir os e-mails selecionados"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Excluir{selectedInSearchIds.length > 0 ? ` (${selectedInSearchIds.length})` : ''}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Barra de seleção (fora da busca): vários e-mails marcados → Desmarcar / Excluir */}
          {!isDeletingBulk &&
            !(searchQuery.trim() || activeAdvFilterCount > 0) &&
            selectedIds.length > 0 && (
              <div className="px-2 py-1.5 bg-brand-500/10 border border-brand-500/20 rounded-md flex items-center justify-between gap-2 text-[11px] text-brand-300">
                <div className="flex items-center space-x-1.5 truncate">
                  <CheckSquare className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                  <span className="truncate">
                    <strong>{selectedIds.length}</strong>{' '}
                    {selectedIds.length === 1 ? 'selecionado' : 'selecionados'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {onClearSelection && (
                    <button
                      type="button"
                      onClick={() => {
                        soundService.play('click');
                        onClearSelection();
                      }}
                      className="px-2 py-1 rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-200 font-semibold transition-colors"
                      title="Desmarcar todos (Esc)"
                    >
                      Desmarcar
                    </button>
                  )}
                  {onDeleteSelected && (
                    <button
                      type="button"
                      onClick={async () => {
                        const ids = [...selectedIds];
                        if (ids.length === 0 || isDeletingBulk) return;
                        setDeletingBulkCount(ids.length);
                        setIsDeletingBulk(true);
                        try {
                          const deleted = await onDeleteSelected(ids);
                          if (deleted !== false) onClearSelection?.();
                        } finally {
                          setIsDeletingBulk(false);
                          setDeletingBulkCount(0);
                        }
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600/90 hover:bg-rose-500 text-white font-semibold transition-colors"
                      title="Excluir os e-mails selecionados"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Excluir ({selectedIds.length})</span>
                    </button>
                  )}
                </div>
              </div>
            )}
        </div>

        {/* Grouped Email Cards by Date Period */}
        <div ref={listScrollRef} className="flex-1 overflow-y-auto custom-scroll">
          {filteredEmails.length === 0 ? (
            <div className="p-8 text-center text-slate-500 space-y-2">
              <Mail className="w-8 h-8 mx-auto text-slate-600" />
              {searchQuery.trim() ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-300">
                    Nenhum e-mail encontrado para "{searchQuery}"
                  </p>
                  <p className="text-[11px] text-slate-500">
                    na conta {activeAccountEmail || 'marcada'}
                  </p>
                  <button
                    onClick={() => onSearchChange('')}
                    className="mt-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors"
                  >
                    Limpar pesquisa
                  </button>
                </div>
              ) : (
                <p className="text-xs font-medium">Nenhuma mensagem nesta pasta</p>
              )}
            </div>
          ) : (
            visibleGroups.map((group) => {
              const isCollapsed = collapsedPeriods[group.id];
              return (
                <div key={group.id} className="bg-slate-925">
                  {/* Period Header (ex: ▾ Hoje, ▾ Semana Passada) */}
                  <div
                    onClick={() => togglePeriod(group.id)}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-slate-950/80 text-[11px] font-semibold text-slate-400 hover:text-slate-200 cursor-pointer sticky top-0 z-10 border-b border-slate-900"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{group.label}</span>
                    <span className="text-[10px] text-slate-600 font-normal">
                      ({group.total})
                    </span>
                  </div>

                  {/* Emails inside period */}
                  {!isCollapsed && (
                    <div className="p-2 space-y-2">
                      {group.items.map(({ email, thread }) => {
                        const isThread = Boolean(thread && thread.count > 1);
                        const isSelected = isThread
                          ? thread!.messages.some((m) => m.id === selectedEmailId)
                          : selectedEmailId === email.id;
                        const isChecked = selectedIds.includes(email.id);
                        const isUnread = isThread ? thread!.hasUnread : !email.isRead;
                        const isStarred = isThread ? thread!.isStarred : Boolean(email.isStarred);
                        const hasRealAttachment = isThread
                          ? thread!.hasAttachment
                          : email.attachments && email.attachments.length > 0
                          ? filterRealAttachments(email.attachments, email.bodyHtml).length > 0
                          : Boolean(email.hasAttachment);
                        const senderDisplay = isThread
                          ? thread!.participants.length <= 2
                            ? thread!.participants.join(', ')
                            : `${thread!.participants[0]}, ${thread!.participants[thread!.participants.length - 1]}`
                          : email.sender;

                        return (
                          <div
                            key={email.id}
                            data-email-ids={isThread ? thread!.messages.map((m) => m.id).join(' ') : email.id}
                            draggable
                            onDragStart={(e) => {
                              // Arrastar para uma pasta: leva os marcados (se este estiver marcado)
                              // ou só este e-mail / esta conversa inteira.
                              const ids =
                                isChecked && selectedIds.length > 0
                                  ? expandThreadIds(selectedIds)
                                  : isThread
                                  ? thread!.messages.map((m) => m.id)
                                  : [email.id];
                              e.dataTransfer.setData(EMAIL_DRAG_MIME, JSON.stringify(ids));
                              e.dataTransfer.effectAllowed = 'move';
                              const ghost = document.createElement('div');
                              ghost.textContent =
                                ids.length === 1 ? 'Movendo 1 e-mail' : `Movendo ${ids.length} e-mails`;
                              ghost.style.cssText =
                                'position:fixed;top:-1000px;left:-1000px;padding:6px 12px;border-radius:9999px;background:#0ea5e9;color:#fff;font:600 12px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.35);';
                              document.body.appendChild(ghost);
                              e.dataTransfer.setDragImage(ghost, 12, 12);
                              setTimeout(() => ghost.remove(), 0);
                            }}
                            onClick={(e) => {
                              if ((e.ctrlKey || e.metaKey) && onToggleSelectId) {
                                e.stopPropagation();
                                onToggleSelectId(email.id);
                                return;
                              }
                              soundService.play('click');
                              onSelectEmail(email.id);
                            }}
                            onDoubleClick={() => {
                              onDoubleClickEmail?.(email.id);
                            }}
                            onAuxClick={(e) => {
                              if (e.button === 1 && onOpenInNewTab) {
                                e.preventDefault();
                                e.stopPropagation();
                                soundService.play('pop');
                                onOpenInNewTab(email.id);
                              }
                            }}
                            className={`group/card p-3 cursor-pointer transition-all relative rounded-xl border flex items-start space-x-2.5 scroll-mt-10 scroll-mb-2 ${
                              isChecked
                                ? 'bg-brand-600/10 border-brand-500/50 shadow-md'
                                : isSelected
                                ? 'bg-slate-850 border-slate-700 border-l-4 border-l-brand-400 shadow-md'
                                : 'bg-slate-900/70 hover:bg-slate-900 border-slate-800/90 hover:border-slate-700'
                            }`}
                          >
                          {/* Checkbox de seleção múltipla */}
                          {onToggleSelectId && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleSelectId(email.id);
                              }}
                              title={isChecked ? 'Desmarcar e-mail' : 'Selecionar e-mail'}
                              className={`shrink-0 mt-2 transition-opacity ${
                                isChecked || selectedIds.length > 0
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover/card:opacity-100'
                              }`}
                            >
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 text-brand-400" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-500 hover:text-slate-300" />
                              )}
                            </button>
                          )}

                          {/* Sender Avatar */}
                          <div className="shrink-0 pt-0.5">
                            <SenderAvatar
                              name={email.sender}
                              email={email.senderEmail || email.sender}
                              avatar={email.avatar}
                              size={36}
                            />
                          </div>

                          {/* Email Content Info */}
                          <div className="flex-1 min-w-0">
                            {/* Top Row: Sender & Timestamp */}
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center space-x-2 min-w-0">
                                {isUnread && (
                                  <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />
                                )}
                                <span
                                  className={`truncate text-xs ${
                                    isUnread
                                      ? 'font-bold text-white'
                                      : 'font-semibold text-slate-300'
                                  }`}
                                >
                                  {senderDisplay}
                                </span>
                                {isThread && thread && (
                                  <span
                                    className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-brand-500/20 text-brand-300 border border-brand-500/30 shrink-0"
                                    title={`Conversa com ${thread.count} mensagens${
                                      thread.unreadCount > 0
                                        ? ` (${thread.unreadCount} não lida${thread.unreadCount > 1 ? 's' : ''})`
                                        : ''
                                    }`}
                                  >
                                    <MessagesSquare className="w-2.5 h-2.5" />
                                    <span>{thread.count}</span>
                                  </span>
                                )}
                                {isUnifiedView && email.accountId && (
                                  (() => {
                                    const accInfo = accounts.find((a) => a.id === email.accountId);
                                    if (!accInfo) return null;
                                    return (
                                      <span
                                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-800/80 text-slate-300 border border-slate-700/70 truncate max-w-[110px] shrink-0"
                                        style={accInfo.color ? { borderLeftWidth: 3, borderLeftColor: accInfo.color } : undefined}
                                        title={accInfo.email}
                                      >
                                        {accInfo.email.split('@')[0]}
                                      </span>
                                    );
                                  })()
                                )}
                              </div>

                              <div className="flex items-center space-x-1.5 shrink-0">
                                <span className="text-[11px] font-mono text-slate-400">
                                  {formatReceivedLabel(email)}
                                </span>
                                {hasRealAttachment && (
                                  <span title="Possui anexo" className="inline-flex items-center">
                                    <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                                  </span>
                                )}
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
                                    const isTrackingPopoverOpen = openTrackingId === email.id;

                                    return (
                                      <div className="relative inline-flex items-center">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            soundService.play('pop');
                                            setOpenTrackingId((prev) => (prev === email.id ? null : email.id));
                                          }}
                                          title={
                                            isAnyOpened
                                              ? `Aberto por ${openedCount}/${trackingList.length} destinatário(s)`
                                              : 'Entregue — Clique para ver status de abertura'
                                          }
                                          className={`p-0.5 rounded-md transition-colors ${
                                            isTrackingPopoverOpen
                                              ? 'bg-sky-500/20 text-sky-400'
                                              : isAnyOpened
                                              ? 'text-sky-400 hover:bg-sky-500/15'
                                              : 'text-slate-500 hover:text-slate-300'
                                          }`}
                                        >
                                          <CheckCheck className="w-3.5 h-3.5" />
                                        </button>

                                        {isTrackingPopoverOpen && (
                                          <div
                                            onClick={(e) => e.stopPropagation()}
                                            className="absolute right-0 top-full mt-1.5 z-40 w-64 rounded-xl bg-slate-900 border border-slate-700/90 shadow-2xl overflow-hidden text-left animate-in fade-in duration-150"
                                          >
                                            <div className="px-3 py-2 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between text-[11px] font-bold text-slate-200">
                                              <span>Destinatários</span>
                                              <span>Aberto em</span>
                                            </div>
                                            <div className="divide-y divide-slate-800/70 max-h-48 overflow-y-auto custom-scroll">
                                              {trackingList.map((rec, idx) => (
                                                <div
                                                  key={`${rec.email}-${idx}`}
                                                  className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                                                >
                                                  <div className="min-w-0">
                                                    <div className="font-medium text-slate-200 truncate">
                                                      {rec.name}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 font-mono truncate">
                                                      {rec.email}
                                                    </div>
                                                  </div>
                                                  {rec.status === 'opened' ? (
                                                    <span className="inline-flex items-center space-x-1 text-[11px] font-bold font-mono text-emerald-400 shrink-0">
                                                      <CheckCheck className="w-3 h-3" />
                                                      <span>{rec.openedAt || 'Lido'}</span>
                                                    </span>
                                                  ) : (
                                                    <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-slate-400 shrink-0">
                                                      <Clock className="w-3 h-3 text-slate-500" />
                                                      <span>Pendente</span>
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
                                {onOpenInNewTab && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      soundService.play('pop');
                                      onOpenInNewTab(email.id);
                                    }}
                                    title="Abrir em nova aba (ou clique do meio)"
                                    className="opacity-0 group-hover/card:opacity-100 text-slate-500 hover:text-brand-400 p-0.5 transition-opacity"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    soundService.play('pop');
                                    onToggleStar(email.id, e);
                                  }}
                                  className="text-slate-600 hover:text-amber-400 p-0.5"
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      isStarred
                                        ? 'fill-amber-400 text-amber-400'
                                        : 'text-slate-600'
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>

                            {/* Subject Line */}
                            <div
                              className={`text-xs mb-1 truncate ${
                                isUnread
                                  ? 'font-semibold text-slate-100'
                                  : 'text-slate-300'
                              }`}
                            >
                              {email.subject}
                            </div>

                            {/* Snippet */}
                            <p className="text-[11px] text-slate-500 line-clamp-1 leading-relaxed">
                              {email.snippet}
                            </p>

                            {/* Chips de Arquivos Anexados no modo Busca Dedicada de Anexos */}
                            {attachmentsOnly && email.attachments && email.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {filterRealAttachments(email.attachments, email.bodyHtml)
                                  .slice(0, 3)
                                  .map((att, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-brand-500/10 border border-brand-500/25 text-[10px] text-brand-300 font-mono max-w-[160px]"
                                      title={att.name}
                                    >
                                      <Paperclip className="w-2.5 h-2.5 shrink-0" />
                                      <span className="truncate">{att.name}</span>
                                    </span>
                                  ))}
                              </div>
                            )}

                            {/* Bottom Badges */}
                            {(email.category || email.priority === 'high') && (
                              <div className="flex items-center justify-between mt-1.5 pt-1">
                                <div className="flex items-center space-x-1.5">
                                  {email.category && (
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                                      {email.category}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center space-x-1.5 text-slate-500">
                                  {email.priority === 'high' && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  )}
                </div>
              );
            })
          )}
          {filteredEmails.length > 0 && hasMoreToRender && (
            <div
              ref={loadMoreRef}
              onClick={() => growRenderLimit(renderLimit + LIST_RENDER_PAGE)}
              className="py-3 text-center text-[11px] text-slate-500 cursor-pointer hover:text-slate-300"
            >
              Carregando mais mensagens…
            </div>
          )}

        </div>
      </section>
    );
  }
);

EmailList.displayName = 'EmailList';
