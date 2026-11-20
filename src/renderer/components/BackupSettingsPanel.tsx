import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FolderOpen,
  HardDriveDownload,
  History,
  Loader2,
  RotateCcw,
  FileArchive,
  FolderInput,
  Mail,
} from 'lucide-react';
import { AppSettings, BackupSettings } from '../types/settings';
import { EmailItem } from '../types/email';

interface BackupSettingsPanelProps {
  backup?: BackupSettings;
  onChangeBackup: (next: BackupSettings) => void;
  onRestoredData?: (payload: { settings?: AppSettings | null; emails?: EmailItem[] }) => void;
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
}) => {
  const [defaultDir, setDefaultDir] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isMigrating, setIsMigrating] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const handleRunMigration = async (mode: 'pst' | 'mbox' | 'folder' | 'eml') => {
    if (isMigrating) return;
    if (!window.electronAPI?.importMigrationFolder) {
      setFeedback({ ok: false, text: 'Assistente de migração disponível apenas no aplicativo desktop.' });
      return;
    }
    setIsMigrating(mode);
    setFeedback(null);
    try {
      const res = await window.electronAPI.importMigrationFolder({
        accountId: 'acc-migrated',
        mode,
      });
      if (res?.canceled) return;
      if (res?.success) {
        if (res.emails && res.emails.length > 0) {
          onRestoredData?.({ emails: res.emails });
        }
        setFeedback({
          ok: true,
          text: `Migração concluída: ${res.count} e-mail(s) importado(s) de ${res.filesScanned || 1} arquivo(s) (${res.sourceLabel || mode.toUpperCase()}).`,
        });
      } else {
        setFeedback({
          ok: false,
          text: res?.error || 'Não foi possível concluir a migração.',
        });
      }
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || 'Erro durante a migração.' });
    } finally {
      setIsMigrating(null);
    }
  };

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

      {/* Assistente de Migração Guiado (Outlook .PST / Thunderbird .MBOX / Pasta / .EML em lote) */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
        <div className="flex items-start gap-2.5">
          <FolderInput className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-semibold text-slate-100">
              Assistente de Migração de E-mails (Outlook, Thunderbird & Apple Mail)
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Importe seu histórico completo preservando datas, anexos e pastas de origem (suporte streaming para arquivos grandes).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={Boolean(isMigrating)}
            onClick={() => handleRunMigration('pst')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-sky-500/40 text-left transition-all disabled:opacity-50"
          >
            <FileArchive className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-100">
                {isMigrating === 'pst' ? 'Importando .PST...' : 'Migrar do Outlook (.PST)'}
              </div>
              <div className="text-[10px] text-slate-400">
                Arquivo binário PST do Microsoft Outlook
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={Boolean(isMigrating)}
            onClick={() => handleRunMigration('mbox')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/40 text-left transition-all disabled:opacity-50"
          >
            <Mail className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-100">
                {isMigrating === 'mbox' ? 'Importando .MBOX...' : 'Migrar do Thunderbird / Apple Mail (.MBOX)'}
              </div>
              <div className="text-[10px] text-slate-400">
                Arquivos .mbox ou caixas Thunderbird sem extensão
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={Boolean(isMigrating)}
            onClick={() => handleRunMigration('folder')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500/40 text-left transition-all disabled:opacity-50"
          >
            <FolderOpen className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-100">
                {isMigrating === 'folder' ? 'Varrendo pasta...' : 'Importar Pasta Completa (Perfil / Subpastas)'}
              </div>
              <div className="text-[10px] text-slate-400">
                Varre subpastas automaticamente (.eml, .mbox, .pst)
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={Boolean(isMigrating)}
            onClick={() => handleRunMigration('eml')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/40 text-left transition-all disabled:opacity-50"
          >
            <HardDriveDownload className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-100">
                {isMigrating === 'eml' ? 'Importando .EML...' : 'Importar Lote de Arquivos .EML'}
              </div>
              <div className="text-[10px] text-slate-400">
                Seleção múltipla de mensagens individuais .eml
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
