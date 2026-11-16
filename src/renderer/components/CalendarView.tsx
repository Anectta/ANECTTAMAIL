import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  Eye,
  EyeOff,
  MapPin,
  MoreVertical,
  Plus,
  Repeat,
  Search,
  Trash2,
  Upload,
  Users,
  Video,
  X,
} from 'lucide-react';
import { CalendarSettings } from '@/types/settings';
import {
  addDaysIso,
  addMinutesToTime,
  addMonthsIso,
  buildIcsExport,
  CALENDAR_CATEGORIES,
  CalendarCategory,
  CalendarColorKey,
  CalendarEvent,
  COLOR_STYLES,
  expandEventsForRange,
  formatDisplayDate,
  formatTimeDisplay,
  getEventColor,
  getIsoWeekNumber,
  getMonthGridDates,
  getRecurrenceLabel,
  getTodayIso,
  getTomorrowIso,
  getWeekDates,
  parseIcsContent,
  parseIsoDate,
  RecurrencePreset,
  RecurrenceRule,
} from '@/utils/calendarUtils';

export type { CalendarEvent };

type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';

const EVENTS_STORAGE_KEY = 'anectta_mail_calendar_events_v1';
const CALENDARS_STORAGE_KEY = 'anectta_mail_calendars_v1';

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAY_LABELS_MON = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WEEKDAY_LABELS_SUN = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAY_LABELS_SAT = ['Sáb', 'Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
const MINI_LABELS_MON = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const MINI_LABELS_SUN = ['D', 'S', 'T', 'Q', 'Q', 'S'];
const MINI_LABELS_SAT = ['S', 'D', 'S', 'T', 'Q', 'Q', 'S'];

const REMINDER_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'Sem lembrete', value: null },
  { label: 'Na hora do evento', value: 0 },
  { label: '5 minutos antes', value: 5 },
  { label: '15 minutos antes', value: 15 },
  { label: '30 minutos antes', value: 30 },
  { label: '1 hora antes', value: 60 },
  { label: '1 dia antes', value: 1440 },
];

const DEFAULT_EVENTS: CalendarEvent[] = [
  {
    id: 'ev-default-1',
    title: 'Alinhamento Estratégico & Metas',
    date: getTodayIso(),
    endDate: getTodayIso(),
    startTime: '14:00',
    endTime: '15:00',
    organizer: 'Diretoria Executiva',
    location: 'Google Meet / Sala Executiva',
    badge: 'Diretoria',
    calendarId: 'work',
    color: 'emerald',
  },
  {
    id: 'ev-default-2',
    title: 'Revisão Técnica & Segurança',
    date: getTomorrowIso(),
    endDate: getTomorrowIso(),
    startTime: '10:00',
    endTime: '11:00',
    organizer: 'Equipe de Engenharia',
    location: 'Microsoft Teams',
    badge: 'Técnico',
    calendarId: 'default',
    color: 'blue',
  },
];

interface CalendarViewProps {
  calendarSettings?: CalendarSettings;
  defaultOrganizer?: string;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  calendarSettings,
  defaultOrganizer,
}) => {
  const use24HourFormat = calendarSettings?.use24HourFormat ?? true;
  const showWeekNumbers = calendarSettings?.showWeekNumbers ?? false;
  const weekStartsOn = calendarSettings?.weekStartsOn ?? 'monday';
  const defaultDuration = calendarSettings?.defaultEventDurationMinutes ?? 60;

  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    try {
      const saved = localStorage.getItem(EVENTS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_EVENTS;
  });

  const [calendars, setCalendars] = useState<CalendarCategory[]>(() => {
    try {
      const saved = localStorage.getItem(CALENDARS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return CALENDAR_CATEGORIES;
  });

  const [hiddenCalendarIds, setHiddenCalendarIds] = useState<Record<string, boolean>>({});
  const [openCalMenuId, setOpenCalMenuId] = useState<string | null>(null);
  const [isAddingCal, setIsAddingCal] = useState(false);
  const [newCalName, setNewCalName] = useState('');
  const [newCalColor, setNewCalColor] = useState<CalendarColorKey>('blue');
  const [renamingCalId, setRenamingCalId] = useState<string | null>(null);
  const [renamingCalValue, setRenamingCalValue] = useState('');

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [anchorDate, setAnchorDate] = useState<string>(getTodayIso);
  const [miniMonthDate, setMiniMonthDate] = useState<string>(getTodayIso);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Event modal state (create or edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(getTodayIso());
  const [endDate, setEndDate] = useState(getTodayIso());
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState(() => addMinutesToTime('09:00', defaultDuration));
  const [organizer, setOrganizer] = useState(defaultOrganizer || '');
  const [participants, setParticipants] = useState<string[]>([]);
  const [participantInput, setParticipantInput] = useState('');
  const [location, setLocation] = useState('');
  const [badge, setBadge] = useState('Reunião');
  const [calendarId, setCalendarId] = useState<string>(() => {
    const def = calendars.find((c) => c.isDefault) || calendars[0];
    return def?.id || 'default';
  });
  const [color, setColor] = useState<CalendarColorKey>('blue');
  const [recurrencePreset, setRecurrencePreset] = useState<RecurrencePreset>('none');
  const [customInterval, setCustomInterval] = useState(1);
  const [customUnit, setCustomUnit] = useState<'day' | 'week' | 'month' | 'year'>('week');
  const [recurrenceUntil, setRecurrenceUntil] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(15);
  const [description, setDescription] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events));
    } catch {
      // ignore
    }
  }, [events]);

  useEffect(() => {
    try {
      localStorage.setItem(CALENDARS_STORAGE_KEY, JSON.stringify(calendars));
    } catch {
      // ignore
    }
  }, [calendars]);

  const showToast = (msg: string) => {
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg(null), 3500);
  };

  const openNewEventModal = (presetDate?: string, presetStartTime?: string) => {
    const targetDate = presetDate || anchorDate || getTodayIso();
    const targetStart = presetStartTime || '09:00';
    const defCal = calendars.find((c) => c.isDefault) || calendars[0];
    setEditingEventId(null);
    setTitle('');
    setDate(targetDate);
    setEndDate(targetDate);
    setAllDay(false);
    setStartTime(targetStart);
    setEndTime(addMinutesToTime(targetStart, defaultDuration));
    setOrganizer(defaultOrganizer || '');
    setParticipants([]);
    setParticipantInput('');
    setLocation('');
    setBadge('Reunião');
    setCalendarId(defCal?.id || 'default');
    setColor(defCal?.color || 'blue');
    setRecurrencePreset('none');
    setCustomInterval(1);
    setCustomUnit('week');
    setRecurrenceUntil('');
    setReminderMinutes(15);
    setDescription('');
    setMeetingUrl('');
    setIsModalOpen(true);
  };

  const openEditEventModal = (ev: CalendarEvent) => {
    setEditingEventId(ev.id);
    setTitle(ev.title);
    setDate(ev.date);
    setEndDate(ev.endDate || ev.date);
    setAllDay(Boolean(ev.allDay));
    setStartTime(ev.startTime || '09:00');
    setEndTime(ev.endTime || addMinutesToTime(ev.startTime || '09:00', defaultDuration));
    setOrganizer(ev.organizer || '');
    setParticipants(ev.participants || []);
    setParticipantInput('');
    setLocation(ev.location || '');
    setBadge(ev.badge || 'Reunião');
    setCalendarId(ev.calendarId || 'default');
    setColor(getEventColor(ev));
    setRecurrencePreset(ev.recurrence?.preset || 'none');
    setCustomInterval(ev.recurrence?.interval || 1);
    setCustomUnit(ev.recurrence?.unit || 'week');
    setRecurrenceUntil(ev.recurrence?.until || '');
    setReminderMinutes(ev.reminderMinutes ?? null);
    setDescription(ev.description || '');
    setMeetingUrl(ev.meetingUrl || '');
    setIsModalOpen(true);
  };

  const handleAddParticipant = () => {
    const raw = participantInput.trim();
    if (!raw) return;
    if (!participants.includes(raw)) {
      setParticipants((prev) => [...prev, raw]);
    }
    setParticipantInput('');
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const recurrence: RecurrenceRule | undefined =
      recurrencePreset === 'none'
        ? undefined
        : {
            preset: recurrencePreset,
            interval: recurrencePreset === 'custom' ? Math.max(1, customInterval) : undefined,
            unit: recurrencePreset === 'custom' ? customUnit : undefined,
            until: recurrenceUntil || undefined,
          };

    const safeStart = date || getTodayIso();
    const safeEnd = endDate && endDate >= safeStart ? endDate : safeStart;

    const payload: CalendarEvent = {
      id: editingEventId || `ev-${Date.now()}`,
      title: title.trim(),
      date: safeStart,
      endDate: safeEnd,
      allDay,
      startTime: allDay ? '00:00' : startTime || '09:00',
      endTime: allDay ? '23:59' : endTime || '10:00',
      organizer: organizer.trim() || defaultOrganizer || 'Você',
      participants,
      location: location.trim() || 'Online / A definir',
      badge: badge.trim() || 'Reunião',
      calendarId,
      color,
      recurrence,
      reminderMinutes,
      description: description.trim() || undefined,
      meetingUrl: meetingUrl.trim() || undefined,
    };

    if (editingEventId) {
      setEvents((prev) => prev.map((item) => (item.id === editingEventId ? payload : item)));
      showToast('Compromisso atualizado.');
    } else {
      setEvents((prev) => [...prev, payload]);
      showToast('Compromisso salvo no calendário local.');
    }
    setIsModalOpen(false);
  };

  const handleDeleteEvent = (id: string) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    if (editingEventId === id) {
      setIsModalOpen(false);
    }
    showToast('Compromisso excluído.');
  };

  const handleImportIcs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseIcsContent(text);
      if (imported.length === 0) {
        showToast('Nenhum evento VEVENT válido encontrado no arquivo .ics.');
      } else {
        setEvents((prev) => [...prev, ...imported]);
        showToast(`${imported.length} compromisso(s) importado(s) do arquivo .ics.`);
      }
    } catch {
      showToast('Erro ao ler o arquivo .ics.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportIcs = () => {
    const sorted = [...events].sort((a, b) =>
      `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)
    );
    const ics = buildIcsExport(sorted);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anectta-calendario-${getTodayIso()}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Navigation handlers
  const handleNavigate = (direction: -1 | 1) => {
    if (viewMode === 'month') {
      const next = addMonthsIso(anchorDate, direction);
      setAnchorDate(next);
      setMiniMonthDate(next);
    } else if (viewMode === 'week') {
      const next = addDaysIso(anchorDate, direction * 7);
      setAnchorDate(next);
      setMiniMonthDate(next);
    } else if (viewMode === 'day') {
      const next = addDaysIso(anchorDate, direction);
      setAnchorDate(next);
      setMiniMonthDate(next);
    } else {
      const next = addMonthsIso(anchorDate, direction);
      setAnchorDate(next);
      setMiniMonthDate(next);
    }
  };

  const handleGoToday = () => {
    const today = getTodayIso();
    setAnchorDate(today);
    setMiniMonthDate(today);
  };

  // Filtered events by visible calendars and search query
  const visibleEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter((ev) => {
      const calKey = ev.calendarId || 'default';
      if (hiddenCalendarIds[calKey]) return false;
      if (!q) return true;
      return (
        ev.title.toLowerCase().includes(q) ||
        ev.location.toLowerCase().includes(q) ||
        ev.organizer.toLowerCase().includes(q) ||
        (ev.description || '').toLowerCase().includes(q) ||
        (ev.participants || []).some((p) => p.toLowerCase().includes(q))
      );
    });
  }, [events, hiddenCalendarIds, searchQuery]);

  // Date grids
  const anchorParsed = parseIsoDate(anchorDate);
  const anchorYear = anchorParsed.getFullYear();
  const anchorMonth = anchorParsed.getMonth();

  const monthGridDates = useMemo(
    () => getMonthGridDates(anchorYear, anchorMonth, weekStartsOn),
    [anchorYear, anchorMonth, weekStartsOn]
  );

  const weekDates = useMemo(
    () => getWeekDates(anchorDate, weekStartsOn),
    [anchorDate, weekStartsOn]
  );

  const miniParsed = parseIsoDate(miniMonthDate);
  const miniGridDates = useMemo(
    () => getMonthGridDates(miniParsed.getFullYear(), miniParsed.getMonth(), weekStartsOn),
    [miniParsed, weekStartsOn]
  );

  // Expanded occurrences for active range
  const rangeBounds = useMemo(() => {
    if (viewMode === 'month') {
      return { start: monthGridDates[0], end: monthGridDates[monthGridDates.length - 1] };
    }
    if (viewMode === 'week') {
      return { start: weekDates[0], end: weekDates[6] };
    }
    if (viewMode === 'day') {
      return { start: anchorDate, end: anchorDate };
    }
    // Agenda: 90 days from anchorDate (or all if searching)
    return {
      start: searchQuery.trim() ? addDaysIso(anchorDate, -365) : addDaysIso(anchorDate, -7),
      end: addDaysIso(anchorDate, 90),
    };
  }, [viewMode, monthGridDates, weekDates, anchorDate, searchQuery]);

  const expandedOccurrences = useMemo(
    () => expandEventsForRange(visibleEvents, rangeBounds.start, rangeBounds.end),
    [visibleEvents, rangeBounds]
  );

  const occurrencesByDate = useMemo(() => {
    const map: Record<string, typeof expandedOccurrences> = {};
    for (const occ of expandedOccurrences) {
      if (!map[occ.occurrenceDate]) map[occ.occurrenceDate] = [];
      map[occ.occurrenceDate].push(occ);
    }
    return map;
  }, [expandedOccurrences]);

  // Mini-calendar event dots
  const miniEventDays = useMemo(() => {
    const occs = expandEventsForRange(
      visibleEvents,
      miniGridDates[0],
      miniGridDates[miniGridDates.length - 1]
    );
    const set = new Set<string>();
    for (const o of occs) set.add(o.occurrenceDate);
    return set;
  }, [visibleEvents, miniGridDates]);

  const periodTitle = useMemo(() => {
    if (viewMode === 'month' || viewMode === 'agenda') {
      return `${MONTH_NAMES[anchorMonth]} de ${anchorYear}`;
    }
    if (viewMode === 'day') {
      return formatDisplayDate(anchorDate);
    }
    const first = parseIsoDate(weekDates[0]);
    const last = parseIsoDate(weekDates[6]);
    if (first.getMonth() === last.getMonth()) {
      return `${first.getDate()} – ${last.getDate()} de ${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`;
    }
    return `${first.getDate()} ${MONTH_NAMES[first.getMonth()].slice(0, 3)} – ${last.getDate()} ${MONTH_NAMES[last.getMonth()].slice(0, 3)} ${last.getFullYear()}`;
  }, [viewMode, anchorMonth, anchorYear, anchorDate, weekDates]);

  const todayIso = getTodayIso();
  const weekdayHeaders =
    weekStartsOn === 'monday'
      ? WEEKDAY_LABELS_MON
      : weekStartsOn === 'saturday'
      ? WEEKDAY_LABELS_SAT
      : WEEKDAY_LABELS_SUN;
  const miniWeekdayHeaders =
    weekStartsOn === 'monday'
      ? MINI_LABELS_MON
      : weekStartsOn === 'saturday'
      ? MINI_LABELS_SAT
      : MINI_LABELS_SUN;

  // Calendar management helpers
  const handleCreateCalendar = () => {
    const trimmed = newCalName.trim();
    if (!trimmed) return;
    const newCal: CalendarCategory = {
      id: `cal-${Date.now()}`,
      name: trimmed,
      color: newCalColor,
      isDefault: false,
    };
    setCalendars((prev) => [...prev, newCal]);
    setNewCalName('');
    setIsAddingCal(false);
  };

  const handleSetDefaultCalendar = (id: string) => {
    setCalendars((prev) => prev.map((c) => ({ ...c, isDefault: c.id === id })));
    setOpenCalMenuId(null);
  };

  const handleChangeCalendarColor = (id: string, nextColor: CalendarColorKey) => {
    setCalendars((prev) => prev.map((c) => (c.id === id ? { ...c, color: nextColor } : c)));
    setOpenCalMenuId(null);
  };

  const handleDeleteCalendar = (id: string) => {
    if (calendars.length <= 1) return;
    setCalendars((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (!filtered.some((c) => c.isDefault) && filtered[0]) {
        filtered[0] = { ...filtered[0], isDefault: true };
      }
      return filtered;
    });
    setOpenCalMenuId(null);
  };

  const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 07:00 to 22:00

  return (
    <div className="flex-1 flex flex-col h-full bg-white text-slate-800 select-none overflow-hidden">
      {/* Top Bar */}
      <div className="px-5 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">Calendário Anectta</h2>
          </div>

          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          <button
            type="button"
            onClick={handleGoToday}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors"
          >
            Hoje
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleNavigate(-1)}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              title="Período anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleNavigate(1)}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              title="Próximo período"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <span className="text-sm font-bold text-slate-800 min-w-[140px]">{periodTitle}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Switcher */}
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
            {(
              [
                { id: 'month', label: 'Mês' },
                { id: 'week', label: 'Semana' },
                { id: 'day', label: 'Dia' },
                { id: 'agenda', label: 'Agenda' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  viewMode === tab.id
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar eventos..."
              className="pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-44 text-slate-800"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={handleImportIcs}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors"
            title="Importar eventos de arquivo .ics"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Importar</span>
          </button>

          <button
            type="button"
            onClick={handleExportIcs}
            disabled={events.length === 0}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors"
            title="Exportar compromissos para arquivo .ics"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Exportar</span>
          </button>

          <button
            type="button"
            onClick={() => openNewEventModal()}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Compromisso</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="mx-5 mt-3 px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium shrink-0">
          {statusMsg}
        </div>
      )}

      {/* Main Split: Left Mini-Calendar & Calendars List + Right Calendar Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-60 shrink-0 border-r border-slate-200 bg-slate-50/70 p-4 overflow-y-auto hidden md:flex flex-col gap-5">
          {/* Mini Calendar */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => setMiniMonthDate((d) => addMonthsIso(d, -1))}
                className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-bold text-slate-800">
                {MONTH_NAMES[miniParsed.getMonth()].slice(0, 3)} {miniParsed.getFullYear()}
              </span>
              <button
                type="button"
                onClick={() => setMiniMonthDate((d) => addMonthsIso(d, 1))}
                className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-slate-400 mb-1">
              {miniWeekdayHeaders.map((lbl, idx) => (
                <div key={idx} className="py-0.5">
                  {lbl}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-0.5 text-center">
              {miniGridDates.map((iso) => {
                const d = parseIsoDate(iso);
                const inMonth = d.getMonth() === miniParsed.getMonth();
                const isToday = iso === todayIso;
                const isSelected = iso === anchorDate;
                const hasEvent = miniEventDays.has(iso);
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      setAnchorDate(iso);
                      setMiniMonthDate(iso);
                    }}
                    className={`relative h-7 w-7 mx-auto rounded-full text-[11px] flex items-center justify-center transition-colors ${
                      isToday
                        ? 'bg-blue-600 text-white font-bold'
                        : isSelected
                        ? 'bg-blue-100 text-blue-800 font-bold'
                        : inMonth
                        ? 'text-slate-700 hover:bg-slate-100'
                        : 'text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {d.getDate()}
                    {hasEvent && !isToday && (
                      <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-blue-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calendars List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Meus Calendários
              </span>
              <button
                type="button"
                onClick={() => setIsAddingCal((p) => !p)}
                className="p-1 text-slate-500 hover:text-blue-600 rounded hover:bg-slate-200/60"
                title="Criar novo calendário"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {isAddingCal && (
              <div className="p-2.5 bg-white rounded-xl border border-slate-200 space-y-2">
                <input
                  type="text"
                  value={newCalName}
                  onChange={(e) => setNewCalName(e.target.value)}
                  placeholder="Nome do calendário"
                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {(['blue', 'emerald', 'violet', 'amber', 'rose'] as CalendarColorKey[]).map(
                      (c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewCalColor(c)}
                          className={`w-4 h-4 rounded-full ${COLOR_STYLES[c].dot} ${
                            newCalColor === c ? 'ring-2 ring-offset-1 ring-slate-700' : ''
                          }`}
                        />
                      )
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateCalendar}
                    className="px-2 py-0.5 bg-blue-600 text-white text-[11px] font-semibold rounded"
                  >
                    Criar
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1">
              {calendars.map((cal) => {
                const isHidden = Boolean(hiddenCalendarIds[cal.id]);
                const style = COLOR_STYLES[cal.color] || COLOR_STYLES.blue;
                return (
                  <div
                    key={cal.id}
                    className="relative group flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
                  >
                    {renamingCalId === cal.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={renamingCalValue}
                        onChange={(e) => setRenamingCalValue(e.target.value)}
                        onBlur={() => {
                          if (renamingCalValue.trim()) {
                            setCalendars((prev) =>
                              prev.map((c) =>
                                c.id === cal.id ? { ...c, name: renamingCalValue.trim() } : c
                              )
                            );
                          }
                          setRenamingCalId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenamingCalId(null);
                        }}
                        className="flex-1 text-xs px-1.5 py-0.5 bg-white border border-blue-400 rounded focus:outline-none"
                      />
                    ) : (
                      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!isHidden}
                          onChange={() =>
                            setHiddenCalendarIds((prev) => ({
                              ...prev,
                              [cal.id]: !prev[cal.id],
                            }))
                          }
                          className="sr-only"
                        />
                        <span
                          className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                            isHidden
                              ? 'bg-white border-slate-300'
                              : `${style.dot} border-transparent`
                          }`}
                        >
                          {!isHidden && (
                            <span className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </span>
                        <span className="text-xs text-slate-700 truncate font-medium">
                          {cal.name}
                        </span>
                        {cal.isDefault && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-slate-200 text-slate-600 rounded font-semibold shrink-0">
                            Padrão
                          </span>
                        )}
                      </label>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setOpenCalMenuId((prev) => (prev === cal.id ? null : cal.id))
                      }
                      className="p-0.5 text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Opções do calendário"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>

                    {openCalMenuId === cal.id && (
                      <div className="absolute right-1 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-30 text-xs text-slate-700">
                        <button
                          type="button"
                          onClick={() => {
                            setHiddenCalendarIds((prev) => ({
                              ...prev,
                              [cal.id]: !prev[cal.id],
                            }));
                            setOpenCalMenuId(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 text-left"
                        >
                          {isHidden ? (
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span>{isHidden ? 'Exibir calendário' : 'Ocultar calendário'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextHidden: Record<string, boolean> = {};
                            for (const other of calendars) {
                              nextHidden[other.id] = other.id !== cal.id;
                            }
                            setHiddenCalendarIds(nextHidden);
                            setOpenCalMenuId(null);
                          }}
                          className="w-full px-3 py-1.5 hover:bg-slate-100 text-left"
                        >
                          Mostrar apenas este
                        </button>
                        {!cal.isDefault && (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultCalendar(cal.id)}
                            className="w-full px-3 py-1.5 hover:bg-slate-100 text-left"
                          >
                            Tornar padrão
                          </button>
                        )}
                        <div className="border-t border-slate-100 my-1 px-3 py-1.5 flex items-center justify-between">
                          <span className="text-[11px] text-slate-500">Cor:</span>
                          <div className="flex items-center gap-1">
                            {(
                              ['blue', 'emerald', 'violet', 'amber', 'rose'] as CalendarColorKey[]
                            ).map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => handleChangeCalendarColor(cal.id, c)}
                                className={`w-3.5 h-3.5 rounded-full ${COLOR_STYLES[c].dot} ${
                                  cal.color === c ? 'ring-2 ring-offset-1 ring-slate-700' : ''
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingCalId(cal.id);
                            setRenamingCalValue(cal.name);
                            setOpenCalMenuId(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 text-left"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Renomear</span>
                        </button>
                        {calendars.length > 1 && !cal.isDefault && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCalendar(cal.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-rose-50 text-rose-600 text-left"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Excluir</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right Main View Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* VIEW 1: MONTH */}
          {viewMode === 'month' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div
                className={`grid border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wide shrink-0 ${
                  showWeekNumbers ? 'grid-cols-[44px_repeat(7,minmax(0,1fr))]' : 'grid-cols-7'
                }`}
              >
                {showWeekNumbers && <div className="py-2 text-center border-r border-slate-200">Sem</div>}
                {weekdayHeaders.map((day) => (
                  <div key={day} className="py-2 text-center border-r border-slate-100 last:border-r-0">
                    {day}
                  </div>
                ))}
              </div>

              <div className="flex-1 grid grid-rows-6 overflow-y-auto">
                {Array.from({ length: 6 }, (_, weekIdx) => {
                  const rowDates = monthGridDates.slice(weekIdx * 7, weekIdx * 7 + 7);
                  return (
                    <div
                      key={weekIdx}
                      className={`grid border-b border-slate-200 last:border-b-0 min-h-[96px] ${
                        showWeekNumbers
                          ? 'grid-cols-[44px_repeat(7,minmax(0,1fr))]'
                          : 'grid-cols-7'
                      }`}
                    >
                      {showWeekNumbers && (
                        <div className="border-r border-slate-200 bg-slate-50/70 flex items-start justify-center pt-2 text-[10px] font-mono text-slate-400">
                          {getIsoWeekNumber(rowDates[0])}
                        </div>
                      )}
                      {rowDates.map((iso) => {
                        const d = parseIsoDate(iso);
                        const inMonth = d.getMonth() === anchorMonth;
                        const isToday = iso === todayIso;
                        const dayOccs = occurrencesByDate[iso] || [];
                        return (
                          <div
                            key={iso}
                            onClick={() => openNewEventModal(iso)}
                            className={`border-r border-slate-100 last:border-r-0 p-1.5 flex flex-col gap-1 cursor-pointer transition-colors hover:bg-blue-50/30 ${
                              inMonth ? 'bg-white' : 'bg-slate-50/60'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-xs w-6 h-6 rounded-full flex items-center justify-center font-semibold ${
                                  isToday
                                    ? 'bg-blue-600 text-white'
                                    : inMonth
                                    ? 'text-slate-700'
                                    : 'text-slate-400'
                                }`}
                              >
                                {d.getDate()}
                              </span>
                            </div>

                            <div className="space-y-1 overflow-hidden">
                              {dayOccs.slice(0, 3).map((occ, idx) => {
                                const style = COLOR_STYLES[getEventColor(occ.event)];
                                return (
                                  <button
                                    key={`${occ.event.id}-${idx}`}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditEventModal(occ.event);
                                    }}
                                    className={`w-full text-left px-1.5 py-0.5 rounded border text-[11px] font-medium truncate flex items-center gap-1 ${style.pill}`}
                                  >
                                    {!occ.event.allDay && (
                                      <span className="text-[10px] opacity-75 shrink-0">
                                        {formatTimeDisplay(occ.event.startTime, use24HourFormat)}
                                      </span>
                                    )}
                                    <span className="truncate">{occ.event.title}</span>
                                  </button>
                                );
                              })}
                              {dayOccs.length > 3 && (
                                <div className="text-[10px] font-semibold text-blue-600 px-1">
                                  +{dayOccs.length - 3} mais
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 2: WEEK */}
          {viewMode === 'week' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Day headers */}
              <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-slate-200 bg-slate-50 shrink-0">
                <div className="border-r border-slate-200 py-2 text-center text-[10px] font-semibold text-slate-400">
                  {showWeekNumbers ? `S${getIsoWeekNumber(weekDates[0])}` : 'Hora'}
                </div>
                {weekDates.map((iso) => {
                  const d = parseIsoDate(iso);
                  const isToday = iso === todayIso;
                  return (
                    <div
                      key={iso}
                      className={`py-2 text-center border-r border-slate-100 last:border-r-0 ${
                        isToday ? 'bg-blue-50/70' : ''
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase text-slate-500">
                        {weekdayHeaders[(weekDates.indexOf(iso))]}
                      </div>
                      <div
                        className={`text-sm font-bold mx-auto w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${
                          isToday ? 'bg-blue-600 text-white' : 'text-slate-800'
                        }`}
                      >
                        {d.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* All-day row */}
              <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-slate-200 bg-slate-50/40 shrink-0">
                <div className="border-r border-slate-200 px-1 py-1.5 text-[10px] text-slate-400 text-center">
                  Dia todo
                </div>
                {weekDates.map((iso) => {
                  const allDayOccs = (occurrencesByDate[iso] || []).filter((o) => o.event.allDay);
                  return (
                    <div
                      key={iso}
                      className="border-r border-slate-100 last:border-r-0 p-1 space-y-1 min-h-[28px]"
                    >
                      {allDayOccs.map((occ, i) => {
                        const style = COLOR_STYLES[getEventColor(occ.event)];
                        return (
                          <button
                            key={`${occ.event.id}-${i}`}
                            type="button"
                            onClick={() => openEditEventModal(occ.event)}
                            className={`w-full text-left px-1.5 py-0.5 rounded border text-[10px] font-semibold truncate ${style.pill}`}
                          >
                            {occ.event.title}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Hourly grid */}
              <div className="flex-1 overflow-y-auto custom-scroll">
                {HOURS.map((hour) => {
                  const hourStr = `${String(hour).padStart(2, '0')}:00`;
                  return (
                    <div
                      key={hour}
                      className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-slate-100 min-h-[52px]"
                    >
                      <div className="border-r border-slate-200 pr-2 pt-1 text-right text-[10px] font-mono text-slate-400">
                        {formatTimeDisplay(hourStr, use24HourFormat)}
                      </div>
                      {weekDates.map((iso) => {
                        const slotOccs = (occurrencesByDate[iso] || []).filter((o) => {
                          if (o.event.allDay) return false;
                          const h = parseInt((o.event.startTime || '09:00').split(':')[0], 10);
                          return h === hour;
                        });
                        return (
                          <div
                            key={iso}
                            onClick={() => openNewEventModal(iso, hourStr)}
                            className="border-r border-slate-100 last:border-r-0 p-1 space-y-1 cursor-pointer hover:bg-blue-50/30"
                          >
                            {slotOccs.map((occ, idx) => {
                              const style = COLOR_STYLES[getEventColor(occ.event)];
                              return (
                                <button
                                  key={`${occ.event.id}-${idx}`}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditEventModal(occ.event);
                                  }}
                                  className={`w-full text-left px-2 py-1 rounded-md border text-[11px] shadow-2xs ${style.block}`}
                                >
                                  <div className="font-bold truncate">{occ.event.title}</div>
                                  <div className="text-[10px] opacity-80">
                                    {formatTimeDisplay(occ.event.startTime, use24HourFormat)} –{' '}
                                    {formatTimeDisplay(occ.event.endTime, use24HourFormat)}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 3: DAY */}
          {viewMode === 'day' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-5 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <div className="text-xs font-bold text-slate-700">
                  {formatDisplayDate(anchorDate)}
                  {anchorDate === todayIso && (
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px]">
                      Hoje
                    </span>
                  )}
                </div>
                {showWeekNumbers && (
                  <span className="text-[11px] font-mono text-slate-500">
                    Semana {getIsoWeekNumber(anchorDate)}
                  </span>
                )}
              </div>

              {/* All-day events */}
              {(occurrencesByDate[anchorDate] || []).some((o) => o.event.allDay) && (
                <div className="px-5 py-2 border-b border-slate-200 bg-slate-50/50 flex flex-wrap gap-2 shrink-0">
                  <span className="text-[11px] font-semibold text-slate-500 self-center">
                    Dia inteiro:
                  </span>
                  {(occurrencesByDate[anchorDate] || [])
                    .filter((o) => o.event.allDay)
                    .map((occ, i) => {
                      const style = COLOR_STYLES[getEventColor(occ.event)];
                      return (
                        <button
                          key={`${occ.event.id}-${i}`}
                          type="button"
                          onClick={() => openEditEventModal(occ.event)}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${style.pill}`}
                        >
                          {occ.event.title}
                        </button>
                      );
                    })}
                </div>
              )}

              <div className="flex-1 overflow-y-auto custom-scroll">
                {HOURS.map((hour) => {
                  const hourStr = `${String(hour).padStart(2, '0')}:00`;
                  const slotOccs = (occurrencesByDate[anchorDate] || []).filter((o) => {
                    if (o.event.allDay) return false;
                    const h = parseInt((o.event.startTime || '09:00').split(':')[0], 10);
                    return h === hour;
                  });
                  return (
                    <div
                      key={hour}
                      className="grid grid-cols-[72px_1fr] border-b border-slate-100 min-h-[56px]"
                    >
                      <div className="border-r border-slate-200 pr-3 pt-2 text-right text-xs font-mono text-slate-400">
                        {formatTimeDisplay(hourStr, use24HourFormat)}
                      </div>
                      <div
                        onClick={() => openNewEventModal(anchorDate, hourStr)}
                        className="p-1.5 space-y-1.5 cursor-pointer hover:bg-blue-50/30"
                      >
                        {slotOccs.map((occ, idx) => {
                          const style = COLOR_STYLES[getEventColor(occ.event)];
                          return (
                            <button
                              key={`${occ.event.id}-${idx}`}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditEventModal(occ.event);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg border flex items-center justify-between gap-3 ${style.block}`}
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-bold truncate">{occ.event.title}</div>
                                <div className="text-[11px] opacity-80 flex items-center gap-3 mt-0.5">
                                  <span>
                                    {formatTimeDisplay(occ.event.startTime, use24HourFormat)} –{' '}
                                    {formatTimeDisplay(occ.event.endTime, use24HourFormat)}
                                  </span>
                                  {occ.event.location && <span>• {occ.event.location}</span>}
                                </div>
                              </div>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white/70 shrink-0">
                                {occ.event.badge}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 4: AGENDA */}
          {viewMode === 'agenda' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scroll">
              {expandedOccurrences.length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-slate-300 text-center text-slate-500 text-sm max-w-2xl mx-auto">
                  Nenhum compromisso encontrado neste período. Clique em{' '}
                  <strong>Novo Compromisso</strong> ou importe um arquivo <code>.ics</code>.
                </div>
              ) : (
                <div className="max-w-4xl space-y-3">
                  {expandedOccurrences.map((occ, idx) => {
                    const ev = occ.event;
                    const style = COLOR_STYLES[getEventColor(ev)];
                    return (
                      <div
                        key={`${ev.id}-${occ.occurrenceDate}-${idx}`}
                        onClick={() => openEditEventModal(ev)}
                        className="p-4 rounded-xl bg-white border border-slate-200 hover:border-blue-300 shadow-xs transition-all flex items-center justify-between gap-4 cursor-pointer"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
                            <span className="text-sm font-bold text-slate-800">{ev.title}</span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${style.pill}`}>
                              {ev.badge}
                            </span>
                            {ev.recurrence && ev.recurrence.preset !== 'none' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                <Repeat className="w-3 h-3" />
                                <span>{getRecurrenceLabel(ev.recurrence)}</span>
                              </span>
                            )}
                            {ev.reminderMinutes !== null && ev.reminderMinutes !== undefined && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                <Bell className="w-3 h-3" />
                                <span>
                                  {ev.reminderMinutes === 0
                                    ? 'Na hora'
                                    : `${ev.reminderMinutes} min`}
                                </span>
                              </span>
                            )}
                            {showWeekNumbers && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                Sem. {getIsoWeekNumber(occ.occurrenceDate)}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                            <span className="flex items-center space-x-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>
                                {formatDisplayDate(occ.occurrenceDate)} •{' '}
                                {ev.allDay
                                  ? 'Dia inteiro'
                                  : `${formatTimeDisplay(ev.startTime, use24HourFormat)} - ${formatTimeDisplay(ev.endTime, use24HourFormat)}`}
                              </span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              <span>
                                {ev.organizer}
                                {ev.participants && ev.participants.length > 0
                                  ? ` (+${ev.participants.length})`
                                  : ''}
                              </span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              <span>{ev.location}</span>
                            </span>
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-2 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {ev.meetingUrl && (
                            <a
                              href={ev.meetingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-lg transition-colors"
                            >
                              <Video className="w-3.5 h-3.5" />
                              <span>Entrar</span>
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteEvent(ev.id)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Excluir compromisso"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Criar / Editar Compromisso */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden text-slate-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
              <h3 className="text-sm font-bold text-slate-900">
                {editingEventId ? 'Editar Compromisso' : 'Novo Compromisso'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="p-5 space-y-3.5 overflow-y-auto custom-scroll">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Título *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Reunião de Alinhamento"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
              </div>

              {/* Datas & Dia inteiro */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Data de início
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      if (endDate < e.target.value) setEndDate(e.target.value);
                    }}
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Data de término
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    min={date}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Dia inteiro</span>
                </label>

                {!allDay && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        setEndTime(addMinutesToTime(e.target.value, defaultDuration));
                      }}
                      className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                    <span className="text-xs text-slate-400">até</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    />
                  </div>
                )}
              </div>

              {/* Recorrência */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Repetição
                  </label>
                  <select
                    value={recurrencePreset}
                    onChange={(e) => setRecurrencePreset(e.target.value as RecurrencePreset)}
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  >
                    <option value="none">Não se repete</option>
                    <option value="daily">Todos os dias</option>
                    <option value="weekdays">Todos os dias úteis (Seg – Sex)</option>
                    <option value="weekly">Toda semana</option>
                    <option value="biweekly">A cada 2 semanas</option>
                    <option value="monthly">Todos os meses</option>
                    <option value="yearly">Todos os anos</option>
                    <option value="custom">Personalizar...</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Lembrete
                  </label>
                  <select
                    value={reminderMinutes === null ? '' : String(reminderMinutes)}
                    onChange={(e) =>
                      setReminderMinutes(e.target.value === '' ? null : Number(e.target.value))
                    }
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  >
                    {REMINDER_OPTIONS.map((opt) => (
                      <option
                        key={String(opt.value)}
                        value={opt.value === null ? '' : String(opt.value)}
                      >
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {recurrencePreset === 'custom' && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-600 font-medium">A cada</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={customInterval}
                    onChange={(e) => setCustomInterval(Math.max(1, Number(e.target.value) || 1))}
                    className="w-14 px-2 py-1 bg-white border border-slate-300 rounded-md text-center"
                  />
                  <select
                    value={customUnit}
                    onChange={(e) =>
                      setCustomUnit(e.target.value as 'day' | 'week' | 'month' | 'year')
                    }
                    className="px-2 py-1 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="day">dia(s)</option>
                    <option value="week">semana(s)</option>
                    <option value="month">mês(es)</option>
                    <option value="year">ano(s)</option>
                  </select>
                  <span className="text-slate-500 ml-auto">Até:</span>
                  <input
                    type="date"
                    value={recurrenceUntil}
                    min={date}
                    onChange={(e) => setRecurrenceUntil(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-300 rounded-md"
                  />
                </div>
              )}

              {/* Calendário e Cor */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Calendário
                  </label>
                  <select
                    value={calendarId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setCalendarId(nextId);
                      const found = calendars.find((c) => c.id === nextId);
                      if (found) setColor(found.color);
                    }}
                    className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  >
                    {calendars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Categoria / Tag
                  </label>
                  <input
                    type="text"
                    value={badge}
                    onChange={(e) => setBadge(e.target.value)}
                    placeholder="Reunião, Cliente..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>
              </div>

              {/* Participantes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Participantes
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={participantInput}
                    onChange={(e) => setParticipantInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddParticipant();
                      }
                    }}
                    placeholder="email@empresa.com.br"
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={handleAddParticipant}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
                  >
                    Adicionar
                  </button>
                </div>
                {participants.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {participants.map((p) => (
                      <span
                        key={p}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px]"
                      >
                        <span>{p}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setParticipants((prev) => prev.filter((item) => item !== p))
                          }
                          className="hover:text-blue-900"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Organizador
                  </label>
                  <input
                    type="text"
                    value={organizer}
                    onChange={(e) => setOrganizer(e.target.value)}
                    placeholder="Seu nome ou e-mail"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Local</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Sala de reunião, Meet..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Link da Reunião (opcional)
                </label>
                <input
                  type="url"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descrição / Notas
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Pauta ou observações..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                {editingEventId ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(editingEventId)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
                  >
                    {editingEventId ? 'Salvar Alterações' : 'Salvar Compromisso'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
