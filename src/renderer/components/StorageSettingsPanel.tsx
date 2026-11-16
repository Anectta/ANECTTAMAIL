import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  HardDrive,
  Loader2,
  Network,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';

export const StorageSettingsPanel: React.FC = () => {
  const [defaultDir, setDefaultDir] = useState('');
  const [currentDir, setCurrentDir] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [migrateData, setMigrateData] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [requiresRestart, setRequiresRestart] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    window.electronAPI?.getStorageConfig?.().then((cfg) => {
      if (!active || !cfg) return;
      setDefaultDir(cfg.defaultDir);
      setCurrentDir(cfg.currentDir);
      setTargetInput(cfg.currentDir);
      setIsCustom(cfg.isCustom);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleBrowse = async () => {
    const res = await window.electronAPI?.selectStorageFolder?.(targetInput || currentDir);
    if (res && !res.canceled && res.path) {
      setTargetInput(res.path);
      setFeedback(null);
    }
  };

  const applyDirectory = async (dirToApply: string) => {
    if (isApplying) return;
    setIsApplying(true);
    setFeedback(null);
    try {
      const res = await window.electronAPI?.setStorageFolder?.({
        targetDir: dirToApply,
        migrateData,
      });
      if (res?.success) {
        setCurrentDir(res.currentDir || dirToApply);
        setTargetInput(res.currentDir || dirToApply);
        setIsCustom(Boolean(res.isCustom));
        setRequiresRestart(Boolean(res.requiresRestart));
        setFeedback({
          ok: true,
          text: res.isCustom
            ? 'Local de armazenamento atualizado. Reinicie o aplicativo para ativar o novo caminho.'
            : 'Armazenamento restaurado para o perfil padrão. Reinicie o aplicativo para aplicar.',
        });
      } else {
        setFeedback({
          ok: false,
          text: res?.error || 'Não foi possível validar o acesso à pasta informada.',
        });
      }
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || 'Erro ao alterar pasta de armazenamento.' });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
          <Network className="w-4 h-4 text-brand-400" />
          <span>Armazenamento em Rede & Banco de Dados</span>
        </h3>
        <p className="text-xs text-slate-400">
          Defina onde o cache de mensagens, anexos e modelos serão armazenados (pasta local, unidade mapeada ou caminho de rede UNC).
        </p>
      </div>

      {/* Card 1: Local Atual */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <HardDrive className="w-4 h-4 text-brand-400" />
            <span className="text-xs font-bold text-slate-200">Local em Uso no Momento</span>
          </div>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              isCustom
                ? 'bg-brand-500/15 text-brand-300 border-brand-500/30'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            {isCustom ? 'Personalizado / Rede' : 'Padrão do Perfil'}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 truncate">
            {currentDir || 'Carregando...'}
          </div>
          <button
            type="button"
            onClick={() => void window.electronAPI?.openStorageFolder?.(currentDir)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors"
            title="Abrir pasta atual no Windows Explorer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Abrir</span>
          </button>
        </div>
      </div>

      {/* Card 2: Alterar Pasta / Caminho de Rede */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3.5">
        <div className="text-xs font-bold text-slate-200">
          Novo Local (Pasta Local, Unidade Mapeada ou Rede UNC)
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            placeholder="Ex.: Z:\AnecttaMail ou \\servidor\compartilhamento\AnecttaMail"
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={() => void handleBrowse()}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            Procurar...
          </button>
        </div>

        <label className="flex items-center justify-between cursor-pointer pt-1">
          <div>
            <div className="text-xs font-medium text-slate-200">
              Migrar mensagens, anexos e modelos atuais para a nova pasta
            </div>
            <div className="text-[11px] text-slate-400">
              Desmarque se quiser iniciar um banco de dados vazio no novo local.
            </div>
          </div>
          <input
            type="checkbox"
            checked={migrateData}
            onChange={(e) => setMigrateData(e.target.checked)}
            className="w-4 h-4 accent-brand-500 rounded cursor-pointer"
          />
        </label>

        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 gap-2 flex-wrap">
          {isCustom ? (
            <button
              type="button"
              onClick={() => void applyDirectory(defaultDir)}
              disabled={isApplying}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors disabled:opacity-60"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Padrão</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={() => void applyDirectory(targetInput)}
            disabled={isApplying || !targetInput.trim()}
            className="px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-60"
          >
            {isApplying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{isApplying ? 'Validando...' : 'Aplicar Novo Local'}</span>
          </button>
        </div>
      </div>

      {/* Nota técnica sobre settings.json */}
      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start space-x-2.5 text-[11px] text-amber-200">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          O arquivo de perfil (<code>settings.json</code>) e o ponteiro de armazenamento permanecem na pasta padrão do usuário Windows para garantir que o aplicativo localize suas credenciais com segurança após reiniciar.
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            feedback.ok
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
          {requiresRestart && (
            <button
              type="button"
              onClick={() => void window.electronAPI?.restartApp?.()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shrink-0 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reiniciar Agora</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
