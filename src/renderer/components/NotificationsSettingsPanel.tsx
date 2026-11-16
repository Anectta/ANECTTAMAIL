import React, { useState } from 'react';
import { Bell, Volume2, CircleDot, ExternalLink, CheckCircle2 } from 'lucide-react';
import { NotificationSettings, NotificationSoundPreset } from '@/types/settings';
import { soundService } from '../services/soundService';

interface NotificationsSettingsPanelProps {
  notifications: NotificationSettings;
  onChangeNotifications: (next: NotificationSettings) => void;
}

const SOUND_OPTIONS: Array<{ value: NotificationSoundPreset; label: string }> = [
  { value: 'theme', label: 'Padrão do Tema' },
  { value: 'chirp', label: 'Chilrear' },
  { value: 'chime', label: 'Sino Suave' },
  { value: 'pulse', label: 'Pulso Digital' },
  { value: 'bell', label: 'Campainha' },
  { value: 'none', label: 'Silencioso' },
];

export const NotificationsSettingsPanel: React.FC<NotificationsSettingsPanelProps> = ({
  notifications,
  onChangeNotifications,
}) => {
  const [systemStatus, setSystemStatus] = useState<string | null>(null);

  const updateField = <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ) => {
    onChangeNotifications({
      ...notifications,
      [key]: value,
    });
  };

  const handleOpenSystemSettings = async () => {
    try {
      const api = window.electronAPI as
        | (typeof window.electronAPI & { openSystemNotificationSettings?: () => Promise<boolean> })
        | undefined;
      if (api?.openSystemNotificationSettings) {
        const ok = await api.openSystemNotificationSettings();
        if (ok) return;
      }
      setSystemStatus('Ajuste as permissões de notificação diretamente nas Configurações do Sistema.');
      setTimeout(() => setSystemStatus(null), 4000);
    } catch {
      setSystemStatus('Não foi possível abrir as configurações do sistema.');
      setTimeout(() => setSystemStatus(null), 4000);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
          <Bell className="w-4 h-4 text-brand-400" />
          <span>Notificações & Avisos</span>
        </h3>
        <p className="text-xs text-slate-400">
          Configure alertas visuais, efeitos sonoros de chegada e o contador de mensagens não lidas do Anectta Mail.
        </p>
      </div>

      {/* Card 1: Notificações e Som */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-4">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div className="flex items-start space-x-2.5">
            <Bell className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-xs text-slate-100 block font-semibold">
                Notificações de novas mensagens
              </span>
              <span className="text-[11px] text-slate-400">
                O Anectta Mail exibirá um alerta nativo no sistema sempre que chegar um novo e-mail.
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={notifications.notificationsEnabled}
            onChange={(e) => updateField('notificationsEnabled', e.target.checked)}
            className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
          />
        </label>

        <div className="pt-3 border-t border-slate-800/80 space-y-2">
          <div>
            <span className="text-xs font-semibold text-slate-200 block">
              Som de nova mensagem
            </span>
            <span className="text-[11px] text-slate-400">
              Escolha o efeito sonoro reproduzido ao receber novos e-mails.
            </span>
          </div>

          <div className="flex items-center space-x-2 max-w-xs">
            <select
              value={notifications.notificationSound}
              onChange={(e) => {
                const nextPreset = e.target.value as NotificationSoundPreset;
                updateField('notificationSound', nextPreset);
                soundService.playNotificationPreset(nextPreset);
              }}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              {SOUND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => soundService.playNotificationPreset(notifications.notificationSound)}
              title="Testar som selecionado"
              className="px-2.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors flex items-center space-x-1 text-xs"
            >
              <Volume2 className="w-3.5 h-3.5 text-brand-400" />
              <span>Testar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Card 2: Avisos / Badge */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Avisos na Barra de Tarefas / Dock
        </div>

        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div className="flex items-start space-x-2.5">
            <CircleDot className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-xs text-slate-100 block font-semibold">
                Aviso de mensagens não lidas
              </span>
              <span className="text-[11px] text-slate-400">
                Exibe o indicador numérico com a quantidade de e-mails não lidos no ícone do aplicativo.
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={notifications.unreadBadgeEnabled}
            onChange={(e) => updateField('unreadBadgeEnabled', e.target.checked)}
            className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
          />
        </label>
      </div>

      {/* Card 3: Sistema Operacional */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-400 max-w-md">
            Preferências detalhadas de banners e modo Não Perturbe estão disponíveis nas Configurações do Sistema.
          </p>
          <button
            type="button"
            onClick={handleOpenSystemSettings}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center space-x-1.5 transition-colors shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            <span>Abrir configurações</span>
          </button>
        </div>

        {systemStatus && (
          <div className="flex items-center space-x-2 text-xs text-emerald-400 pt-1">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{systemStatus}</span>
          </div>
        )}
      </div>
    </div>
  );
};
