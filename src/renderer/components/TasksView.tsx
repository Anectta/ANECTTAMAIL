import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  Plus,
  Search,
  Calendar as CalendarIcon,
  Mail,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  LayoutGrid,
  List as ListIcon,
  Flag,
  ArrowRight,
} from 'lucide-react';
import { PriorityLevel, TaskItem } from '@/types/email';

interface TasksViewProps {
  tasks: TaskItem[];
  onAddTask: (task: Omit<TaskItem, 'id' | 'createdAt'>) => void;
  onUpdateTask: (id: string, updates: Partial<TaskItem>) => void;
  onDeleteTask: (id: string) => void;
  onOpenSourceEmail?: (emailId: string) => void;
  onSyncTaskToCalendar?: (task: TaskItem) => void;
}

const PRIORITY_STYLES: Record<PriorityLevel, { label: string; badge: string; dot: string }> = {
  high: {
    label: 'Alta',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
  medium: {
    label: 'Média',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  low: {
    label: 'Baixa',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
  },
};

export const TasksView: React.FC<TasksViewProps> = ({
  tasks,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onOpenSourceEmail,
  onSyncTaskToCalendar,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [filterMode, setFilterMode] = useState<'all' | 'open' | 'done' | 'from_email'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Quick-add form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<PriorityLevel>('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDueTime, setNewDueTime] = useState('09:00');
  const [showExtraFields, setShowExtraFields] = useState(false);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filterMode === 'open' && t.status === 'done') return false;
      if (filterMode === 'done' && t.status !== 'done') return false;
      if (filterMode === 'from_email' && !t.sourceEmailId) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.sourceEmailSubject || '').toLowerCase().includes(q) ||
        (t.sourceEmailSender || '').toLowerCase().includes(q)
      );
    });
  }, [tasks, filterMode, searchQuery]);

  const stats = useMemo(() => {
    const todo = tasks.filter((t) => t.status === 'todo').length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const overdue = tasks.filter((t) => {
      if (t.status === 'done' || !t.dueDate) return false;
      const today = new Date().toISOString().slice(0, 10);
      return t.dueDate < today;
    }).length;
    return { todo, inProgress, done, overdue };
  }, [tasks]);

  const handleQuickCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddTask({
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      status: 'todo',
      priority: newPriority,
      dueDate: newDueDate || undefined,
      dueTime: newDueDate ? newDueTime || '09:00' : undefined,
    });
    setNewTitle('');
    setNewDesc('');
    setNewDueDate('');
    setNewPriority('medium');
    setShowExtraFields(false);
  };

  const toggleDone = (task: TaskItem) => {
    const nextStatus = task.status === 'done' ? 'todo' : 'done';
    onUpdateTask(task.id, {
      status: nextStatus,
      completedAt: nextStatus === 'done' ? new Date().toISOString() : undefined,
    });
  };

  const cycleStatus = (task: TaskItem) => {
    const order: TaskItem['status'][] = ['todo', 'in_progress', 'done'];
    const idx = order.indexOf(task.status);
    const next = order[(idx + 1) % order.length];
    onUpdateTask(task.id, {
      status: next,
      completedAt: next === 'done' ? new Date().toISOString() : undefined,
    });
  };

  const renderTaskCard = (task: TaskItem) => {
    const prio = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
    const today = new Date().toISOString().slice(0, 10);
    const isOverdue = Boolean(task.dueDate && task.dueDate < today && task.status !== 'done');

    return (
      <div
        key={task.id}
        className={`group rounded-xl border p-3.5 transition-all bg-white shadow-2xs hover:shadow-sm ${
          task.status === 'done'
            ? 'border-slate-200/80 bg-slate-50/70 opacity-75'
            : isOverdue
            ? 'border-rose-200 bg-rose-50/20'
            : 'border-slate-200'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            onClick={() => toggleDone(task)}
            className={`mt-0.5 shrink-0 transition-colors ${
              task.status === 'done'
                ? 'text-emerald-600'
                : 'text-slate-300 hover:text-blue-600'
            }`}
            title={task.status === 'done' ? 'Marcar como pendente' : 'Concluir tarefa'}
          >
            {task.status === 'done' ? (
              <CheckCircle2 className="w-4.5 h-4.5" />
            ) : (
              <Circle className="w-4.5 h-4.5" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p
                className={`text-xs font-semibold leading-snug ${
                  task.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900'
                }`}
              >
                {task.title}
              </p>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold shrink-0 ${prio.badge}`}
              >
                <Flag className="w-2.5 h-2.5" />
                {prio.label}
              </span>
            </div>

            {task.description && (
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{task.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              {task.dueDate && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                    isOverdue
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  <Clock className="w-2.5 h-2.5" />
                  {task.dueDate.split('-').reverse().join('/')}
                  {task.dueTime ? ` às ${task.dueTime}` : ''}
                </span>
              )}

              {task.sourceEmailId && (
                <button
                  type="button"
                  onClick={() => onOpenSourceEmail?.(task.sourceEmailId!)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors max-w-[200px] truncate"
                  title={`Abrir e-mail de origem: ${task.sourceEmailSubject || ''}`}
                >
                  <Mail className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">
                    {task.sourceEmailSender || task.sourceEmailSubject || 'Ver E-mail'}
                  </span>
                </button>
              )}

              {task.syncedToCalendar && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CalendarIcon className="w-2.5 h-2.5" />
                  No Calendário
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => cycleStatus(task)}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-blue-600 transition-colors"
                title="Avançar etapa"
              >
                <ArrowRight className="w-3 h-3" />
                <span>
                  {task.status === 'todo'
                    ? 'Mover para Em andamento'
                    : task.status === 'in_progress'
                    ? 'Concluir'
                    : 'Reabrir'}
                </span>
              </button>

              <div className="flex items-center gap-1">
                {onSyncTaskToCalendar && !task.syncedToCalendar && (
                  <button
                    type="button"
                    onClick={() => onSyncTaskToCalendar(task)}
                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                    title="Adicionar prazo ao Calendário"
                  >
                    <CalendarIcon className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDeleteTask(task.id)}
                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                  title="Excluir tarefa"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Tarefas & Pendências</h1>
            <p className="text-xs text-slate-500">
              {stats.todo} a fazer · {stats.inProgress} em andamento · {stats.done} concluída(s)
              {stats.overdue > 0 ? ` · ${stats.overdue} atrasada(s)` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar tarefas..."
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:bg-white w-48"
            />
          </div>

          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Create + Filter Bar */}
      <div className="px-6 py-3 bg-white border-b border-slate-200/80 space-y-2.5 shrink-0">
        <form onSubmit={handleQuickCreate} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onFocus={() => setShowExtraFields(true)}
              placeholder="Nova tarefa... (ex.: Enviar contrato revisado para cliente)"
              className="flex-1 min-w-[240px] px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:bg-white"
            />
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as PriorityLevel)}
              className="px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
              title="Prioridade"
            >
              <option value="high">Alta</option>
              <option value="medium">Média</option>
              <option value="low">Baixa</option>
            </select>
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
              title="Prazo"
            />
            {newDueDate && (
              <input
                type="time"
                value={newDueTime}
                onChange={(e) => setNewDueTime(e.target.value)}
                className="px-2 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                title="Horário"
              />
            )}
            <button
              type="submit"
              disabled={!newTitle.trim()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar</span>
            </button>
          </div>
          {showExtraFields && (
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Notas ou detalhes opcionais..."
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:bg-white"
            />
          )}
        </form>

        <div className="flex items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'Todas' },
              { id: 'open', label: 'Pendentes' },
              { id: 'done', label: 'Concluídas' },
              { id: 'from_email', label: 'Vindas de E-mail' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterMode(f.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                filterMode === f.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredTasks.length === 0 ? (
          <div className="max-w-md mx-auto mt-12 text-center bg-white rounded-2xl border border-slate-200 p-8">
            <CheckSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">Nenhuma tarefa encontrada</h3>
            <p className="text-xs text-slate-500 mt-1">
              Crie uma tarefa acima ou clique em <strong>Transformar em Tarefa</strong> ao abrir qualquer e-mail.
            </p>
          </div>
        ) : viewMode === 'kanban' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {(
              [
                { key: 'todo', title: 'A Fazer', color: 'bg-slate-400' },
                { key: 'in_progress', title: 'Em Andamento', color: 'bg-blue-500' },
                { key: 'done', title: 'Concluídas', color: 'bg-emerald-500' },
              ] as const
            ).map((col) => {
              const colItems = filteredTasks.filter((t) => t.status === col.key);
              return (
                <div
                  key={col.key}
                  className="bg-slate-100/80 border border-slate-200/80 rounded-2xl p-3 space-y-2.5 min-h-[260px]"
                >
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${col.color}`} />
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        {col.title}
                      </h3>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] font-bold text-slate-600">
                      {colItems.length}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {colItems.map(renderTaskCard)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-2.5">
            {filteredTasks.map(renderTaskCard)}
          </div>
        )}
      </div>
    </div>
  );
};
