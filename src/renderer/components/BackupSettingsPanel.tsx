import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FolderOpen,
  HardDriveDownload,
  History,
  Loader2,
  RotateCcw,
  FolderInput,
} from 'lucide-react';
import { AccountSettings, AppSettings, BackupSettings } from '../types/settings';
import type { MailImportResult } from '../../types/electron';
import { MailImportStep } from './MailImportStep';
import { EmailItem } from '../types/email';

interface BackupSettingsPanelProps {
  backup?: BackupSettings;
  onChangeBackup: (next: BackupSettings) => void;
  onRestoredData?: (payload: { settings?: AppSettings | null; emails?: EmailItem[] }) => void;
  /** Contas para escolher o destino da importação. */
  accounts?: AccountSettings[];
  activeAccountId?: string;
  /** E-mails importados de outro programa para uma conta. */
  onImportResult?: (result: MailImportResult, account: AccountSettings) => void;
  getKnownMessageIds?: (accountId: string) => string[];
}

const DEFAULT_BACKUP: BackupSettings = {
  enabled: false,
  destinationDir: '',
  frequencyDays: 14,
  keepLastCount: 3,
};

const FREQUENCY_OPTIONS: Array<{ days: 1 | 3 | 7 | 14 | 30; label: string }> = [
  { days: 1, label: 'Diário' },
  { days: 3, label: 'A cada 3 dias' },
  { days: 7, label: 'Semanal' },
  { days: 14, label: 'Quinzenal' },
  { days: 30, label: 'Mensal' },
];

const RETENTION_OPTIONS = [1, 3, 5, 10, 20];

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const BackupSettingsPanel: React.FC<BackupSettingsPanelProps> = ({
  backup,
  onChangeBackup,
  onRestoredData,
  accounts,
  activeAccountId,
  onImportResult,
  getKnownMessageIds,
}) => {
  const [defaultDir, setDefaultDir] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  // Importação: conta de destino (a ativa por padrão)
  const importAccounts = (accounts || []).filter((a) => a?.email && a.id !== 'acc-1');
  const [importAccountId, setImportAccountId] = useState<string>(activeAccountId || '');
  const importAccount = importAccounts.find((a) => a.id === importAccountId) || importAccounts[0];
  const [importRound, setImportRound] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const current: BackupSettings = {
    ...DEFAULT_BACKUP,
    ...backup,
  };

  const effectiveDir = current.destinationDir || defaultDir;

  useEffect(() => {
    let active = true;
    window.electronAPI?.getDefaultBackupDir?.().then((dir) => {
      if (active && dir) setDefaultDir(dir);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSelectFolder = async () => {
    const res = await window.electronAPI?.selectBackupFolder?.(effectiveDir);
    if (res && !res.canceled && res.path) {
      onChangeBackup({ ...current, destinationDir: res.path });
    }
  };

  const handleOpenFolder = async () => {
    await window.electronAPI?.openBackupFolder?.(effectiveDir);
  };

  const handleBackupNow = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setFeedback(null);
    try {
      const res = await window.electronAPI?.runBackupNow?.({
        destinationDir: effectiveDir,
        keepLastCount: current.keepLastCount,
      });
      if (res?.success) {
        onChangeBackup({
          ...current,
          destinationDir: effectiveDir,
          lastBackupAt: res.createdAt || new Date().toISOString(),
          lastBackupFile: res.fileName,
          lastBackupSizeBytes: res.sizeBytes,
        });
        setFeedback({
          ok: true,
          text: `Backup concluído (${res.emailsCount ?? 0} mensagens salvas em ${res.fileName}).`,
        });
      } else {
        setFeedback({
          ok: false,
          text: res?.error || 'Não foi possível concluir o backup.',
        });
      }
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || 'Erro ao executar backup.' });
    } finally {
      setIsRunning(false);
    }
  };

  const handleRestore = async () => {
    if (isRestoring) return;
    setIsRestoring(true);
    setFeedback(null);
    try {
      const res = await window.electronAPI?.restoreBackupFile?.();
      if (res?.canceled) {
        setIsRestoring(false);
        return;
      }
      if (res?.success) {
        onRestoredData?.({ settings: res.settings, emails: res.emails });
        setFeedback({
          ok: true,
          text: `Backup restaurado com sucesso (${res.emailsCount ?? 0} mensagens).`,
        });
      } else {
        setFeedback({
          ok: false,
          text: res?.error || 'Falha ao restaurar arquivo de backup.',
        });
      }
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || 'Erro ao restaurar backup.' });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
          <HardDriveDownload className="w-4 h-4 text-brand-400" />
          <span>Backup & Restauração Local</span>
        </h3>
        <p className="text-xs text-slate-400">
          Proteja suas contas, configurações e mensagens em arquivos compactados locais com retenção automática.
        </p>
      </div>

      {/* Card 1: Status & Ações Imediatas */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start space-x-2.5">
            <History className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-white">
                {current.lastBackupAt
                  ? `Último backup: ${new Date(current.lastBackupAt).toLocaleString('pt-BR')}`
                  : 'Nenhum backup realizado ainda'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {current.lastBackupFile
                  ? `${current.lastBackupFile}${current.lastBackupSizeBytes ? ` (${formatBytes(current.lastBackupSizeBytes)})` : ''}`
                  : 'Clique em "Fazer Backup Agora" para gerar sua primeira cópia de segurança.'}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => void handleBackupNow()}
              disabled={isRunning}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-60"
            >
              {isRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <HardDriveDownload className="w-3.5 h-3.5" />
              )}
              <span>{isRunning ? 'Gerando...' : 'Fazer Backup Agora'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleRestore()}
              disabled={isRestoring}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors disabled:opacity-60"
              title="Restaurar contas e e-mails a partir de um arquivo .anectta-bak"
            >
              {isRestoring ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              <span>Restaurar</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={`px-3 py-2 rounded-lg border text-[11px] flex items-center space-x-2 ${
              feedback.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      {/* Card 2: Pasta de Destino */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
        <div className="text-xs font-bold text-slate-200">Pasta de Destino</div>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            readOnly
            value={effectiveDir}
            placeholder="Documentos\Anectta MAIL Backups"
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleSelectFolder()}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            Alterar...
          </button>
          <button
            type="button"
            onClick={() => void handleOpenFolder()}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors"
            title="Abrir pasta de backups no Explorer"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Card 3: Agendamento Automático */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <label className="flex items-center justify-between cursor-pointer">
          <div className="flex items-start space-x-2.5">
            <Clock className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-white">
                Backup periódico automático
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Executa automaticamente em segundo plano quando o intervalo escolhido vencer.
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={current.enabled}
            onChange={(e) =>
              onChangeBackup({ ...current, enabled: e.target.checked })
            }
            className="w-4 h-4 accent-brand-500 rounded cursor-pointer"
          />
        </label>

        <div
          className={`space-y-3 pt-2 border-t border-slate-800/80 transition-opacity ${
            current.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'
          }`}
        >
          <div>
            <div className="text-[11px] font-semibold text-slate-300 mb-2">
              Frequência do Backup
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FREQUENCY_OPTIONS.map((opt) => {
                const active = current.frequencyDays === opt.days;
                return (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() =>
                      onChangeBackup({ ...current, frequencyDays: opt.days })
                    }
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                      active
                        ? 'bg-brand-600/20 border-brand-500/50 text-brand-300 font-semibold'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <div className="text-xs font-medium text-slate-200">
                Retenção de versões
              </div>
              <div className="text-[11px] text-slate-400">
                Quantidade máxima de arquivos preservados na pasta
              </div>
            </div>
            <select
              value={current.keepLastCount}
              onChange={(e) =>
                onChangeBackup({
                  ...current,
                  keepLastCount: Number(e.target.value),
                })
              }
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500 cursor-pointer"
            >
              {RETENTION_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  Manter últimos {count} {count === 1 ? 'backup' : 'backups'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Importar e-mails de outro programa (.pst/.mbox/.eml/pasta) para uma conta */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
        <div className="flex items-start gap-2.5">
          <FolderInput className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-semibold text-slate-100">
              Importar e-mails de outro programa (Outlook, Thunderbird e outros)
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Traz o histórico para a conta escolhida, mantendo pastas, anexos e lido/não lido. E-mails que já
              existem na conta não são duplicados.
            </p>
          </div>
        </div>
        {importAccounts.length === 0 ? (
          <p className="text-[11px] text-slate-400">Adicione uma conta de e-mail antes de importar.</p>
        ) : (
          <>
            <label className="flex items-center gap-2 text-[11px] text-slate-300">
              <span className="shrink-0 font-semibold">Para a conta</span>
              <select
                value={importAccount?.id || ''}
                onChange={(e) => setImportAccountId(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200"
              >
                {importAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email} ({(a.incomingServer?.protocol || 'imap').toUpperCase()})
                  </option>
                ))}
              </select>
            </label>
            {importAccount && (
              <MailImportStep
                key={`${importAccount.id}-${importRound}`}
                account={importAccount}
                variant="panel"
                getKnownMessageIds={getKnownMessageIds}
                onFinish={(result) => {
                  if (result && result.count > 0) onImportResult?.(result, importAccount);
                  setImportRound((n) => n + 1);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};
