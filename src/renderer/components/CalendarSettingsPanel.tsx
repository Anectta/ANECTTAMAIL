import React from 'react';
import { Calendar, Clock, Globe, Mail } from 'lucide-react';
import { AccountSettings, CalendarSettings } from '@/types/settings';

interface CalendarSettingsPanelProps {
  calendar: CalendarSettings;
  accounts: AccountSettings[];
  onChangeCalendar: (next: CalendarSettings) => void;
}

export const CalendarSettingsPanel: React.FC<CalendarSettingsPanelProps> = ({
  calendar,
  accounts,
  onChangeCalendar,
}) => {
  const connectedIds = calendar.connectedAccountIds || [];

  const toggleAccount = (accountId: string) => {
    const exists = connectedIds.includes(accountId);
    const nextIds = exists
      ? connectedIds.filter((id) => id !== accountId)
      : [...connectedIds, accountId];
    onChangeCalendar({
      ...calendar,
      connectedAccountIds: nextIds,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-brand-400" />
          <span>Calendário</span>
        </h3>
        <p className="text-xs text-slate-400">
          Gerencie contas conectadas, formato de horário, início da semana e duração padrão de eventos no Anectta Mail.
        </p>
      </div>

      {/* Card 1: Contas conectadas */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Contas conectadas
        </div>

        {accounts.length === 0 ? (
          <div className="text-xs text-slate-500 italic">
            Nenhuma conta configurada no momento.
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map((acc) => {
              const isEnabled = connectedIds.includes(acc.id) || connectedIds.length === 0;
              return (
                <label
                  key={acc.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-900/70 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white"
                      style={{ backgroundColor: acc.color || '#2563eb' }}
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-100 truncate">
                        {acc.accountName || acc.displayName || 'Conta'}
                        <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                          ({acc.oauthProvider ? acc.oauthProvider.toUpperCase() : 'Local / .ics'})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{acc.email}</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => toggleAccount(acc.id)}
                    className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
                  />
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Card 2: Aparência do calendário */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
          <Globe className="w-3.5 h-3.5" />
          <span>Aparência do calendário</span>
        </div>

        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <span className="text-xs text-slate-200 block font-medium">
              Usar formato de 24 horas
            </span>
            <span className="text-[10px] text-slate-500">
              Exibir horários como 14:00 em vez de 2:00 PM
            </span>
          </div>
          <input
            type="checkbox"
            checked={calendar.use24HourFormat}
            onChange={(e) =>
              onChangeCalendar({ ...calendar, use24HourFormat: e.target.checked })
            }
            className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
          />
        </label>

        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <span className="text-xs text-slate-200 block font-medium">
              Mostrar números das semanas
            </span>
            <span className="text-[10px] text-slate-500">
              Exibir o número da semana nos compromissos e visualizações de calendário
            </span>
          </div>
          <input
            type="checkbox"
            checked={calendar.showWeekNumbers}
            onChange={(e) =>
              onChangeCalendar({ ...calendar, showWeekNumbers: e.target.checked })
            }
            className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
          />
        </label>

        <div className="pt-1">
          <label className="block text-[11px] font-medium text-slate-400 mb-1">
            Iniciar semana em:
          </label>
          <select
            value={calendar.weekStartsOn}
            onChange={(e) =>
              onChangeCalendar({
                ...calendar,
                weekStartsOn: e.target.value as CalendarSettings['weekStartsOn'],
              })
            }
            className="w-full max-w-xs bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="sunday">Domingo</option>
            <option value="monday">Segunda-feira</option>
            <option value="saturday">Sábado</option>
          </select>
        </div>
      </div>

      {/* Card 3: Eventos */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>Eventos</span>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-400 mb-1">
            Duração padrão do evento:
          </label>
          <select
            value={calendar.defaultEventDurationMinutes}
            onChange={(e) =>
              onChangeCalendar({
                ...calendar,
                defaultEventDurationMinutes: Number(
                  e.target.value
                ) as CalendarSettings['defaultEventDurationMinutes'],
              })
            }
            className="w-full max-w-xs bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value={15}>15 minutos</option>
            <option value={30}>30 minutos</option>
            <option value={60}>60 minutos</option>
            <option value={90}>90 minutos</option>
            <option value={120}>120 minutos</option>
          </select>
        </div>
      </div>
    </div>
  );
};
