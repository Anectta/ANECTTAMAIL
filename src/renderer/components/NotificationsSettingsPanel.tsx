import React, { useState } from 'react';
import {
  Bell,
  Volume2,
  CircleDot,
  ExternalLink,
  CheckCircle2,
  ShieldQuestion,
  AlertTriangle,
  SlidersHorizontal,
} from 'lucide-react';
import {
  NotificationSettings,
  NotificationSoundPreset,
  ConfirmationSettings,
  DEFAULT_CONFIRMATION_SETTINGS,
  ConversationDeleteArchiveAction,
  JunkMoveAction,
  DefaultFilterRulesApplyTarget,
  DefaultRuleCreationMode,
  RecipientVariableSubstitutionMode,
} from '@/types/settings';
import { soundService } from '../services/soundService';
import { DEFAULT_QUIET_HOURS, isQuietNow } from '../utils/mailHygiene';

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

const ASK_BEFORE_ITEMS: Array<{
  key: keyof ConfirmationSettings;
  label: string;
}> = [
  { key: 'askBeforeDeleteFolder', label: 'Perguntar antes de excluir uma pasta' },
  { key: 'askBeforeDragDropFolder', label: 'Perguntar antes de Arrastar & Soltar pasta' },
  { key: 'askBeforeDeleteMessage', label: 'Perguntar antes de apagar uma mensagem' },
  {
    key: 'askBeforePermanentDeleteMessages',
    label: 'Perguntar antes de apagar mensagens de uma vez por todas',
  },
  { key: 'askBeforeDeleteAppointment', label: 'Perguntar antes de excluir um compromisso' },
  { key: 'askBeforeDeleteContact', label: 'Perguntar antes de excluir um contato' },
  { key: 'askBeforeDeleteTask', label: 'Perguntar antes de excluir uma tarefa' },
  { key: 'askBeforeDeleteNote', label: 'Perguntar antes de apagar nota' },
  { key: 'askBeforeDeleteAttachment', label: 'Perguntar antes de apagar anexo' },
  { key: 'askBeforeDeleteRule', label: 'Perguntar antes de apagar regra' },
  { key: 'askBeforeDeleteQuickActions', label: 'Perguntar antes de apagar Comandos Rápidos' },
  { key: 'askBeforeDeleteTextTemplate', label: 'Perguntar antes de apagar Modelo de Texto' },
  { key: 'askBeforeDeleteSignature', label: 'Perguntar antes de apagar assinatura' },
  { key: 'askBeforeDeleteTemplates', label: 'Perguntar antes de apagar modelos' },
  { key: 'askBeforeEmptyTrash', label: 'Perguntar antes de esvaziar a Lixeira' },
  { key: 'askBeforeApplyRuleOnMessages', label: 'Perguntar antes de aplicar uma regra em mensagens' },
  {
    key: 'askBeforeModifyMessageProperties',
    label: 'Perguntar antes de modificar propriedades de mensagens',
  },
  {
    key: 'askBeforeChangeMessageCategory',
    label: 'Perguntar antes de mudar a categoria de mensagens',
  },
  {
    key: 'askBeforeSendOnCtrlEnter',
    label: 'Perguntar antes de enviar uma mensagem se Ctrl+Enter estiverem premidos',
  },
  {
    key: 'askBeforeDeleteOperationalLogFile',
    label: 'Perguntar antes de apagar arquivo de registros operacionais',
  },
];

export const NotificationsSettingsPanel: React.FC<NotificationsSettingsPanelProps> = ({
  notifications,
  onChangeNotifications,
}) => {
  const [systemStatus, setSystemStatus] = useState<string | null>(null);

  const confirmations: ConfirmationSettings = {
    ...DEFAULT_CONFIRMATION_SETTINGS,
    ...(notifications.confirmations || {}),
  };

  const updateField = <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ) => {
    onChangeNotifications({
      ...notifications,
      [key]: value,
    });
  };

  const updateConfirmation = <K extends keyof ConfirmationSettings>(
    key: K,
    value: ConfirmationSettings[K]
  ) => {
    onChangeNotifications({
      ...notifications,
      confirmations: {
        ...confirmations,
        [key]: value,
      },
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

      {/* Horário silencioso */}
      {(() => {
        const qh = notifications.quietHours || DEFAULT_QUIET_HOURS;
        const setQh = (patch: Partial<typeof qh>) => updateField('quietHours', { ...qh, ...patch });
        return (
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">Horário silencioso</span>
                <span className="text-[11px] text-slate-500">
                  Nesse período o Anectta não toca som nem mostra aviso de e-mail novo. Os e-mails continuam chegando
                  normalmente.
                </span>
              </div>
              <input
                type="checkbox"
                checked={qh.enabled}
                onChange={(e) => setQh({ enabled: e.target.checked })}
                className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
              />
            </label>
            {qh.enabled && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <label className="flex items-center gap-2">
                  <span>Das</span>
                  <input
                    type="time"
                    value={qh.start}
                    onChange={(e) => setQh({ start: e.target.value })}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span>às</span>
                  <input
                    type="time"
                    value={qh.end}
                    onChange={(e) => setQh({ end: e.target.value })}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100"
                  />
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qh.weekends}
                    onChange={(e) => setQh({ weekends: e.target.checked })}
                    className="w-4 h-4 rounded text-brand-600 bg-slate-900 border-slate-700"
                  />
                  <span>Sábado e domingo inteiros</span>
                </label>
                <span className="text-[11px] text-slate-500 w-full">
                  {isQuietNow(qh) ? '🔕 Agora está no horário silencioso.' : '🔔 Agora as notificações estão ativas.'}
                </span>
              </div>
            )}
          </div>
        );
      })()}

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

      {/* Card 4: Confirmações ("Perguntar antes de...") */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-800/80">
          <div className="flex items-center space-x-2">
            <ShieldQuestion className="w-4 h-4 text-brand-400 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Confirmações de Ações
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                const next = { ...confirmations };
                for (const item of ASK_BEFORE_ITEMS) {
                  (next[item.key] as boolean) = true;
                }
                onChangeNotifications({ ...notifications, confirmations: next });
              }}
              className="text-[11px] text-brand-400 hover:text-brand-300 font-medium"
            >
              Marcar todos
            </button>
            <span className="text-slate-700">|</span>
            <button
              type="button"
              onClick={() => {
                const next = { ...confirmations };
                for (const item of ASK_BEFORE_ITEMS) {
                  (next[item.key] as boolean) = false;
                }
                onChangeNotifications({ ...notifications, confirmations: next });
              }}
              className="text-[11px] text-slate-400 hover:text-slate-200 font-medium"
            >
              Desmarcar todos
            </button>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          {ASK_BEFORE_ITEMS.map((item) => {
            const checked = Boolean(confirmations[item.key]);
            return (
              <label
                key={item.key}
                className="flex items-center space-x-2.5 text-xs text-slate-200 hover:text-white cursor-pointer py-0.5"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => updateConfirmation(item.key, e.target.checked as any)}
                  className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
                />
                <span>{item.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Card 5: Avisos de Envio, Processamento e Limites */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5">
        <div className="flex items-center space-x-2 pb-1 border-b border-slate-800/80">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Avisos e Alertas Inteligentes
          </span>
        </div>

        <div className="space-y-2.5 pt-1">
          <label className="flex items-center space-x-2.5 text-xs text-slate-200 hover:text-white cursor-pointer">
            <input
              type="checkbox"
              checked={confirmations.warnIfBlankSubjectOnSend}
              onChange={(e) => updateConfirmation('warnIfBlankSubjectOnSend', e.target.checked)}
              className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
            />
            <span>Avisar-me se o assunto estiver em branco antes de enviar uma mensagem</span>
          </label>

          <label className="flex items-center space-x-2.5 text-xs text-slate-200 hover:text-white cursor-pointer">
            <input
              type="checkbox"
              checked={confirmations.warnOnGroupHeaderSelectedForProcessing}
              onChange={(e) =>
                updateConfirmation('warnOnGroupHeaderSelectedForProcessing', e.target.checked)
              }
              className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
            />
            <span>
              Avisar quando cabeçalho de grupo for selecionado em listas de dados para processamento específico
            </span>
          </label>

          <label className="flex items-center space-x-2.5 text-xs text-slate-200 hover:text-white cursor-pointer">
            <input
              type="checkbox"
              checked={confirmations.warnOnForwardOrReplyDecryptedText}
              onChange={(e) =>
                updateConfirmation('warnOnForwardOrReplyDecryptedText', e.target.checked)
              }
              className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
            />
            <span>
              Avisar quando encaminhar ou responder uma mensagem que contenha texto descriptografado
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
            <label className="flex items-center space-x-2.5 hover:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={confirmations.warnOnSendMessageLargerThanEnabled}
                onChange={(e) =>
                  updateConfirmation('warnOnSendMessageLargerThanEnabled', e.target.checked)
                }
                className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
              />
              <span>Avisar em tentativa de enviar mensagem maior que</span>
            </label>
            <input
              type="number"
              min={1}
              max={500}
              disabled={!confirmations.warnOnSendMessageLargerThanEnabled}
              value={confirmations.warnOnSendMessageLargerThanMb}
              onChange={(e) =>
                updateConfirmation(
                  'warnOnSendMessageLargerThanMb',
                  Math.max(1, Math.min(500, Number(e.target.value) || 10))
                )
              }
              className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 text-center font-mono focus:outline-none focus:border-brand-500 disabled:opacity-50"
            />
            <span>MB</span>
          </div>

          <label className="flex items-start space-x-2.5 text-xs text-slate-200 hover:text-white cursor-pointer">
            <input
              type="checkbox"
              checked={confirmations.warnOnMissingAttachmentKeyword}
              onChange={(e) =>
                updateConfirmation('warnOnMissingAttachmentKeyword', e.target.checked)
              }
              className="w-4 h-4 mt-0.5 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
            />
            <span>
              Avisar antes de se enviar mensagem sem anexo e se houver palavras semelhantes a "anexo" no conteúdo da mensagem
            </span>
          </label>

          <label className="flex items-center space-x-2.5 text-xs text-slate-200 hover:text-white cursor-pointer">
            <input
              type="checkbox"
              checked={confirmations.notifyOnGmailRateLimit}
              onChange={(e) => updateConfirmation('notifyOnGmailRateLimit', e.target.checked)}
              className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
            />
            <span>Notificar quando for detectada limitação de taxa nas contas do Gmail</span>
          </label>
        </div>
      </div>

      {/* Card 6: Comportamento Padrão em Ações (Dropdowns) */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center space-x-2 pb-1 border-b border-slate-800/80">
          <SlidersHorizontal className="w-4 h-4 text-brand-400 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Comportamento Padrão em Ações
          </span>
        </div>

        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-2">
            <label className="text-xs text-slate-200">
              Exclusão e arquivamento de mensagens em uma conversa:
            </label>
            <select
              value={confirmations.conversationDeleteArchiveAction}
              onChange={(e) =>
                updateConfirmation(
                  'conversationDeleteArchiveAction',
                  e.target.value as ConversationDeleteArchiveAction
                )
              }
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="always_ask">Sempre perguntar</option>
              <option value="current_folder_only">Excluir apenas as mensagens da pasta atual</option>
              <option value="all_messages">Excluir todas as mensagens</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-2">
            <label className="text-xs text-slate-200">
              Ação de mover para o Lixo eletrônico:
            </label>
            <select
              value={confirmations.junkMoveAction}
              onChange={(e) =>
                updateConfirmation('junkMoveAction', e.target.value as JunkMoveAction)
              }
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="always_ask">Sempre perguntar</option>
              <option value="move_to_spam">Mover para Spam</option>
              <option value="move_and_blacklist_email">
                Mover sem perguntar e incluir na lista negra de e-mails
              </option>
              <option value="move_and_blacklist_domain">
                Mover para lá e incluir o domínio na lista negra
              </option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-2">
            <label className="text-xs text-slate-200">
              Aplicar as regras de filtro padrão:
            </label>
            <select
              value={confirmations.defaultFilterRulesApplyTarget}
              onChange={(e) =>
                updateConfirmation(
                  'defaultFilterRulesApplyTarget',
                  e.target.value as DefaultFilterRulesApplyTarget
                )
              }
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="always_ask">Sempre perguntar</option>
              <option value="local_accounts">Em contas locais</option>
              <option value="server">No servidor</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-2">
            <label className="text-xs text-slate-200">
              Criação de regra padrão:
            </label>
            <select
              value={confirmations.defaultRuleCreationMode}
              onChange={(e) =>
                updateConfirmation(
                  'defaultRuleCreationMode',
                  e.target.value as DefaultRuleCreationMode
                )
              }
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="always_ask">Sempre perguntar</option>
              <option value="from_library">A partir da biblioteca de regras</option>
              <option value="custom_rule">Regra personalizada</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-2">
            <label className="text-xs text-slate-200">
              Substituição das variáveis de destinatário antes do envio:
            </label>
            <select
              value={confirmations.recipientVariableSubstitutionMode}
              onChange={(e) =>
                updateConfirmation(
                  'recipientVariableSubstitutionMode',
                  e.target.value as RecipientVariableSubstitutionMode
                )
              }
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="always_ask">Sempre perguntar</option>
              <option value="replace">Substituir</option>
              <option value="do_not_replace">Não substituir</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
