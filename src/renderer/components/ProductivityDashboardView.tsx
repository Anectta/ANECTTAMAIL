import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Mail,
  Send,
  CheckSquare,
  Calendar,
  Sparkles,
  Newspaper,
  Bell,
  Users,
  TrendingUp,
  Inbox,
  ShieldCheck,
} from 'lucide-react';
import { EmailItem, TaskItem } from '@/types/email';
import { AccountSettings } from '@/types/settings';
import { SenderAvatar } from './SenderAvatar';
import { getEmailTimestampMs } from '../utils/dateSortUtils';
import { classifyEmailTriage } from '../utils/triageAndTemplates';

interface ProductivityDashboardViewProps {
  emails: EmailItem[];
  tasks: TaskItem[];
  accounts: AccountSettings[];
  offlineQueueCount?: number;
  onFilterBySender?: (senderEmail: string) => void;
  onOpenModule?: (module: 'mail' | 'calendar' | 'tasks') => void;
}

export const ProductivityDashboardView: React.FC<ProductivityDashboardViewProps> = ({
  emails,
  tasks,
  accounts,
  offlineQueueCount = 0,
  onFilterBySender,
  onOpenModule,
}) => {
  const [rangeDays, setRangeDays] = useState<7 | 30 | 0>(30); // 0 = all

  const scopedEmails = useMemo(() => {
    if (rangeDays === 0) return emails;
    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    return emails.filter((e) => getEmailTimestampMs(e) >= cutoff);
  }, [emails, rangeDays]);

  const metrics = useMemo(() => {
    const received = scopedEmails.filter((e) => e.folder !== 'sent' && e.folder !== 'drafts' && e.folder !== 'trash');
    const sent = scopedEmails.filter((e) => e.folder === 'sent');
    const inboxAll = emails.filter((e) => e.folder === 'inbox');
    const unreadInbox = inboxAll.filter((e) => !e.isRead).length;
    const readRate =
      inboxAll.length > 0 ? Math.round(((inboxAll.length - unreadInbox) / inboxAll.length) * 100) : 100;

    // Triage breakdown
    let priority = 0;
    let newsletters = 0;
    let notifications = 0;
    for (const e of received) {
      const cat = classifyEmailTriage(e);
      if (cat === 'priority') priority++;
      else if (cat === 'newsletters') newsletters++;
      else if (cat === 'notifications') notifications++;
    }

    // Last 7 days volume
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: Array<{ key: string; label: string; received: number; sent: number }> = [];
    const dayMap = new Map<string, { key: string; label: string; received: number; sent: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
      const entry = { key, label, received: 0, sent: 0 };
      days.push(entry);
      dayMap.set(key, entry);
    }
    for (const e of emails) {
      const ts = getEmailTimestampMs(e);
      if (!ts) continue;
      const key = new Date(ts).toISOString().slice(0, 10);
      const bucket = dayMap.get(key);
      if (!bucket) continue;
      if (e.folder === 'sent') bucket.sent++;
      else if (e.folder !== 'drafts' && e.folder !== 'trash') bucket.received++;
    }
    const maxDayVol = Math.max(1, ...days.map((d) => Math.max(d.received, d.sent)));

    // Top senders
    const senderCounts = new Map<string, { name: string; email: string; avatar?: string; count: number }>();
    for (const e of received) {
      const addr = (e.senderEmail || '').trim().toLowerCase();
      if (!addr) continue;
      const existing = senderCounts.get(addr);
      if (existing) {
        existing.count++;
      } else {
        senderCounts.set(addr, {
          name: e.sender || addr.split('@')[0],
          email: addr,
          avatar: e.avatar,
          count: 1,
        });
      }
    }
    const topSenders = Array.from(senderCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const maxSenderCount = Math.max(1, topSenders[0]?.count || 1);

    // By account
    const accountStats = accounts.map((acc) => {
      const accEmails = scopedEmails.filter((e) => e.accountId === acc.id);
      const accUnread = accEmails.filter((e) => e.folder === 'inbox' && !e.isRead).length;
      return {
        id: acc.id,
        name: acc.displayName || acc.email,
        email: acc.email,
        total: accEmails.length,
        unread: accUnread,
      };
    });

    // Tasks stats
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === 'done').length;
    const taskRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 100;

    // Calendar upcoming 7 days
    let upcomingEvents = 0;
    try {
      const rawCal = localStorage.getItem('anectta_mail_calendar_events_v1');
      if (rawCal) {
        const parsed: any[] = JSON.parse(rawCal);
        const startIso = today.toISOString().slice(0, 10);
        const endIso = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        upcomingEvents = parsed.filter((ev) => ev?.date >= startIso && ev?.date <= endIso).length;
      }
    } catch {}

    // Inbox Zero / Health Score (0-100)
    const healthScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(readRate * 0.6 + taskRate * 0.3 + (offlineQueueCount === 0 ? 10 : 0))
      )
    );

    return {
      receivedCount: received.length,
      sentCount: sent.length,
      unreadInbox,
      readRate,
      priority,
      newsletters,
      notifications,
      days,
      maxDayVol,
      topSenders,
      maxSenderCount,
      accountStats,
      totalTasks,
      doneTasks,
      taskRate,
      upcomingEvents,
      healthScore,
    };
  }, [scopedEmails, emails, tasks, accounts, offlineQueueCount]);

  const triageTotal = Math.max(1, metrics.priority + metrics.newsletters + metrics.notifications);

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center shadow-xs">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Dashboard de Produtividade & Estatísticas</h1>
            <p className="text-xs text-slate-500">
              Visão consolidada do volume de e-mails, triagem inteligente, tarefas e agenda.
            </p>
          </div>
        </div>

        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          {(
            [
              { val: 7, label: '7 dias' },
              { val: 30, label: '30 dias' },
              { val: 0, label: 'Tudo' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.val}
              type="button"
              onClick={() => setRangeDays(opt.val)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                rangeDays === opt.val
                  ? 'bg-white text-brand-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6 max-w-6xl w-full mx-auto">
        {/* KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Recebidos / Enviados</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Mail className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{metrics.receivedCount}</span>
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
                <Send className="w-3 h-3" /> {metrics.sentCount} enviados
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Taxa de leitura na Caixa: <strong className="text-slate-700">{metrics.readRate}%</strong>
            </p>
          </div>

          <button
            type="button"
            onClick={() => onOpenModule?.('mail')}
            className="text-left bg-white hover:border-brand-300 rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-2 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Não Lidos na Caixa</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Inbox className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{metrics.unreadInbox}</div>
            <p className="text-[11px] text-slate-400">
              {metrics.unreadInbox === 0
                ? 'Parabéns! Caixa de entrada em dia.'
                : 'Clique para abrir a Caixa de Entrada'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onOpenModule?.('tasks')}
            className="text-left bg-white hover:border-indigo-300 rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-2 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Tarefas Concluídas</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckSquare className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">
                {metrics.doneTasks}/{metrics.totalTasks}
              </span>
              <span className="text-xs font-semibold text-emerald-600">{metrics.taskRate}%</span>
            </div>
            <p className="text-[11px] text-slate-400">Gerenciar tarefas no Kanban/Lista</p>
          </button>

          <button
            type="button"
            onClick={() => onOpenModule?.('calendar')}
            className="text-left bg-white hover:border-violet-300 rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-2 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Agenda (Próximos 7 dias)</span>
              <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900">{metrics.upcomingEvents}</span>
              <span className="text-xs font-semibold text-violet-600">compromisso(s)</span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-500" />
              Saúde da Caixa: <strong className="text-slate-700">{metrics.healthScore}/100</strong>
            </p>
          </button>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 7-Day Activity Bar Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-brand-600" />
                  <span>Fluxo de E-mails (Últimos 7 dias)</span>
                </h2>
                <p className="text-[11px] text-slate-500">Comparativo diário de mensagens recebidas e enviadas</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-semibold">
                <span className="flex items-center gap-1 text-blue-600">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Recebidos
                </span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Enviados
                </span>
              </div>
            </div>

            <div className="h-44 flex items-end justify-between gap-2 pt-4">
              {metrics.days.map((d) => {
                const recPct = Math.max(4, Math.round((d.received / metrics.maxDayVol) * 100));
                const sentPct = Math.max(4, Math.round((d.sent / metrics.maxDayVol) * 100));
                return (
                  <div key={d.key} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <div className="w-full flex items-end justify-center gap-1.5 h-32">
                      <div
                        className="w-4 sm:w-5 rounded-t-md bg-blue-500/90 hover:bg-blue-600 transition-all relative group"
                        style={{ height: `${d.received > 0 ? recPct : 3}%` }}
                        title={`${d.received} recebido(s)`}
                      >
                        {d.received > 0 && (
                          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-600">
                            {d.received}
                          </span>
                        )}
                      </div>
                      <div
                        className="w-4 sm:w-5 rounded-t-md bg-emerald-500/90 hover:bg-emerald-600 transition-all relative group"
                        style={{ height: `${d.sent > 0 ? sentPct : 3}%` }}
                        title={`${d.sent} enviado(s)`}
                      >
                        {d.sent > 0 && (
                          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-emerald-700">
                            {d.sent}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500 capitalize">{d.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Smart Triage Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Triagem Inteligente</h2>
              <p className="text-[11px] text-slate-500">Distribuição automática das mensagens recebidas</p>
            </div>

            <div className="space-y-3.5">
              {[
                {
                  label: 'Prioritários (Pessoas)',
                  count: metrics.priority,
                  color: 'bg-brand-600',
                  icon: Sparkles,
                  textColor: 'text-brand-700',
                },
                {
                  label: 'Newsletters & Listas',
                  count: metrics.newsletters,
                  color: 'bg-amber-500',
                  icon: Newspaper,
                  textColor: 'text-amber-700',
                },
                {
                  label: 'Notificações & Alertas',
                  count: metrics.notifications,
                  color: 'bg-sky-500',
                  icon: Bell,
                  textColor: 'text-sky-700',
                },
              ].map((row) => {
                const Icon = row.icon;
                const pct = Math.round((row.count / triageTotal) * 100);
                return (
                  <div key={row.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-semibold flex items-center gap-1.5 ${row.textColor}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {row.label}
                      </span>
                      <span className="font-bold text-slate-700">
                        {row.count} <span className="text-slate-400 font-normal">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${row.color} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {metrics.newsletters > 5 && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                💡 Você recebeu <strong>{metrics.newsletters} newsletters</strong> neste período. Use o botão{' '}
                <strong>Cancelar inscrição</strong> no leitor para reduzir ruído.
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row: Top Senders + Accounts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-brand-600" />
              <span>Remetentes Mais Frequentes</span>
            </h2>
            {metrics.topSenders.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Nenhum e-mail no período selecionado.</p>
            ) : (
              <div className="space-y-2.5">
                {metrics.topSenders.map((s) => {
                  const pct = Math.round((s.count / metrics.maxSenderCount) * 100);
                  return (
                    <button
                      key={s.email}
                      type="button"
                      onClick={() => onFilterBySender?.(s.email)}
                      className="w-full flex items-center gap-3 p-1.5 rounded-xl hover:bg-slate-50 transition-colors text-left"
                      title={`Pesquisar e-mails de ${s.email}`}
                    >
                      <SenderAvatar name={s.name} email={s.email} avatar={s.avatar} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-800 truncate">{s.name}</span>
                          <span className="text-xs font-bold text-brand-600 shrink-0">{s.count}</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-indigo-600" />
              <span>Volume por Conta Conectada</span>
            </h2>
            {metrics.accountStats.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Nenhuma conta configurada.</p>
            ) : (
              <div className="space-y-2.5">
                {metrics.accountStats.map((acc) => (
                  <div
                    key={acc.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">{acc.name}</div>
                      <div className="text-[11px] font-mono text-slate-500 truncate">{acc.email}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-xs font-bold text-slate-700">
                        {acc.total} msgs
                      </span>
                      {acc.unread > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-xs font-bold text-amber-700">
                          {acc.unread} não lidos
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
