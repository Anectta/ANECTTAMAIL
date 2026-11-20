import React, { useState } from 'react';
import { Calendar, Clock, Globe, Mail, Plus, Trash2, Cloud, CheckCircle, AlertCircle } from 'lucide-react';
import { AccountSettings, CalendarSettings, DavSyncSource } from '@/types/settings';

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
  const davSources = calendar.davSources || [];

  const [isAddingDav, setIsAddingDav] = useState(false);
  const [davName, setDavName] = useState('');
  const [davCalUrl, setDavCalUrl] = useState('');
  const [davCardUrl, setDavCardUrl] = useState('');
  const [davUser, setDavUser] = useState('');
  const [davPass, setDavPass] = useState('');
  const [davTestResult, setDavTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isTestingDav, setIsTestingDav] = useState(false);

  const handleTestDav = async () => {
    const targetUrl = davCalUrl.trim() || davCardUrl.trim();
    if (!targetUrl || !window.electronAPI?.testDavConnection) return;
    setIsTestingDav(true);
    setDavTestResult(null);
    try {
      const res = await window.electronAPI.testDavConnection({
        url: targetUrl,
        username: davUser.trim(),
        password: davPass,
      });
      setDavTestResult({ ok: res.success, msg: res.message });
    } catch (err: any) {
      setDavTestResult({ ok: false, msg: err?.message || 'Erro ao testar servidor DAV.' });
    } finally {
      setIsTestingDav(false);
    }
  };

  const handleAddDavSource = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = davName.trim() || 'Servidor DAV';
    const cleanCal = davCalUrl.trim();
    const cleanCard = davCardUrl.trim();
    if (!cleanCal && !cleanCard) return;

    const newSource: DavSyncSource = {
      id: `dav-${Date.now()}`,
      name: cleanName,
      provider: cleanCal && cleanCard ? 'dav_both' : cleanCal ? 'caldav' : 'carddav',
      caldavUrl: cleanCal || undefined,
      carddavUrl: cleanCard || undefined,
      username: davUser.trim(),
      password: davPass,
      syncCalendar: Boolean(cleanCal),
      syncContacts: Boolean(cleanCard),
    };

    onChangeCalendar({
      ...calendar,
      davSources: [...davSources, newSource],
    });
    setDavName('');
    setDavCalUrl('');
    setDavCardUrl('');
    setDavUser('');
    setDavPass('');
    setDavTestResult(null);
    setIsAddingDav(false);
  };

  const handleRemoveDavSource = (id: string) => {
    onChangeCalendar({
      ...calendar,
      davSources: davSources.filter((s) => s.id !== id),
    });
  };

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
      {/* Card 4: Sincronização em Nuvem (CalDAV / CardDAV / Google / M365) */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center space-x-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <Cloud className="w-3.5 h-3.5 text-sky-400" />
            <span>Servidores CalDAV / CardDAV (Sincronização em Nuvem)</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsAddingDav((v) => !v);
              setDavTestResult(null);
            }}
            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-brand-600 hover:bg-brand-500 text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isAddingDav ? 'Cancelar' : 'Adicionar CalDAV / CardDAV'}</span>
          </button>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          Contas <strong>Google</strong> e <strong>Microsoft 365</strong> conectadas via OAuth 2.0 sincronizam Calendário e Contatos automaticamente ao clicar em <em>Sincronizar Nuvem</em>. Use esta seção para servidores <strong>CalDAV / CardDAV</strong> (iCloud, Nextcloud, Zimbra, Fastmail, OwnCloud).
        </p>

        {isAddingDav && (
          <form
            onSubmit={handleAddDavSource}
            className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5 text-xs"
          >
            <input
              type="text"
              required
              value={davName}
              onChange={(e) => setDavName(e.target.value)}
              placeholder="Nome da conexão (ex: Nextcloud Empresa, iCloud, Zimbra)"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            />
            <input
              type="url"
              value={davCalUrl}
              onChange={(e) => setDavCalUrl(e.target.value)}
              placeholder="URL CalDAV do Calendário (ex: https://cloud.empresa.com/remote.php/dav/calendars/user/personal/)"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
            />
            <input
              type="url"
              value={davCardUrl}
              onChange={(e) => setDavCardUrl(e.target.value)}
              placeholder="URL CardDAV de Contatos (ex: https://cloud.empresa.com/remote.php/dav/addressbooks/users/user/contacts/)"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-500"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={davUser}
                onChange={(e) => setDavUser(e.target.value)}
                placeholder="Usuário / E-mail"
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
              <input
                type="password"
                required
                value={davPass}
                onChange={(e) => setDavPass(e.target.value)}
                placeholder="Senha ou senha de aplicativo"
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>

            {davTestResult && (
              <div
                className={`px-2.5 py-1.5 rounded-lg text-[11px] flex items-center space-x-1.5 border ${
                  davTestResult.ok
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                }`}
              >
                {davTestResult.ok ? (
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{davTestResult.msg}</span>
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                disabled={isTestingDav || (!davCalUrl.trim() && !davCardUrl.trim())}
                onClick={handleTestDav}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 text-xs font-medium"
              >
                {isTestingDav ? 'Testando...' : 'Testar conexão'}
              </button>
              <button
                type="submit"
                disabled={!davCalUrl.trim() && !davCardUrl.trim()}
                className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-semibold"
              >
                Salvar servidor
              </button>
            </div>
          </form>
        )}

        {davSources.length > 0 && (
          <div className="space-y-2">
            {davSources.map((src) => (
              <div
                key={src.id}
                className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    {src.name}{' '}
                    <span className="text-[10px] font-normal text-sky-400">
                      ({src.caldavUrl && src.carddavUrl ? 'CalDAV + CardDAV' : src.caldavUrl ? 'CalDAV' : 'CardDAV'})
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">
                    {src.username} • {src.caldavUrl || src.carddavUrl}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveDavSource(src.id)}
                  className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors shrink-0"
                  title="Remover servidor DAV"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Card 5: Sincronização Automática Bidirecional em Segundo Plano (V2) */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-200">
              Sincronização Automática Bidirecional (Nuvem V2)
            </div>
            <p className="text-[11px] text-slate-500">
              Mantém Google Calendar, Microsoft 365 e CalDAV/CardDAV sincronizados em segundo plano (criação, edição e exclusão).
            </p>
          </div>
          <input
            type="checkbox"
            checked={Boolean(calendar.autoSyncCloudEnabled)}
            onChange={(e) =>
              onChangeCalendar({
                ...calendar,
                autoSyncCloudEnabled: e.target.checked,
                autoSyncCloudIntervalMinutes: calendar.autoSyncCloudIntervalMinutes || 15,
              })
            }
            className="w-4 h-4 accent-brand-500 rounded cursor-pointer"
          />
        </div>

        <div
          className={`space-y-2.5 pt-2 border-t border-slate-800/80 transition-opacity ${
            calendar.autoSyncCloudEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-300">Intervalo de sincronização</span>
            <select
              value={calendar.autoSyncCloudIntervalMinutes || 15}
              onChange={(e) =>
                onChangeCalendar({
                  ...calendar,
                  autoSyncCloudIntervalMinutes: Number(e.target.value) as 5 | 15 | 30 | 60,
                })
              }
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
            >
              <option value={5}>A cada 5 minutos</option>
              <option value={15}>A cada 15 minutos (Recomendado)</option>
              <option value={30}>A cada 30 minutos</option>
              <option value={60}>A cada 1 hora</option>
            </select>
          </div>

          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-xs text-slate-300">Sincronizar Contatos (Google / M365 / CardDAV) junto</span>
            <input
              type="checkbox"
              checked={calendar.syncCloudContactsAuto ?? true}
              onChange={(e) =>
                onChangeCalendar({
                  ...calendar,
                  syncCloudContactsAuto: e.target.checked,
                })
              }
              className="w-4 h-4 accent-brand-500 rounded cursor-pointer"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
