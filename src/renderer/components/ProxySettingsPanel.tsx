import React, { useState } from 'react';
import { Globe, Eye, EyeOff, CheckCircle2, ExternalLink } from 'lucide-react';
import { ProxySettings, DEFAULT_PROXY_SETTINGS } from '@/types/settings';

interface ProxySettingsPanelProps {
  proxy?: ProxySettings;
  onChangeProxy: (next: ProxySettings) => void;
}

export const ProxySettingsPanel: React.FC<ProxySettingsPanelProps> = ({
  proxy,
  onChangeProxy,
}) => {
  const current: ProxySettings = {
    ...DEFAULT_PROXY_SETTINGS,
    ...(proxy || {}),
  };

  const [showPassword, setShowPassword] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const updateField = <K extends keyof ProxySettings>(
    key: K,
    value: ProxySettings[K]
  ) => {
    const next: ProxySettings = {
      ...current,
      [key]: value,
    };
    onChangeProxy(next);
    const api = window.electronAPI as
      | (typeof window.electronAPI & { applyProxySettings?: (cfg: ProxySettings) => Promise<any> })
      | undefined;
    api?.applyProxySettings?.(next).catch(() => {});
  };

  const handleOpenSystemProxy = async () => {
    try {
      const api = window.electronAPI as
        | (typeof window.electronAPI & { openSystemProxySettings?: () => Promise<boolean> })
        | undefined;
      if (api?.openSystemProxySettings) {
        const ok = await api.openSystemProxySettings();
        if (ok) return;
      }
      setStatusMsg('Ajuste as configurações de proxy diretamente nas Configurações de Rede do Sistema.');
      setTimeout(() => setStatusMsg(null), 4000);
    } catch {
      setStatusMsg('Não foi possível abrir as configurações de proxy do sistema.');
      setTimeout(() => setStatusMsg(null), 4000);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
          <Globe className="w-4 h-4 text-brand-400" />
          <span>Serviços de Rede &amp; Servidor Proxy</span>
        </h3>
        <p className="text-xs text-slate-400">
          Configure a conexão via servidor proxy do sistema operacional ou informe as credenciais de autenticação da sua rede corporativa.
        </p>
      </div>

      {/* Bloco Principal: Servidor proxy (fiel ao layout solicitado) */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs font-semibold text-slate-100">
          Servidor proxy
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-3">
            <p className="text-xs text-slate-200 leading-relaxed">
              O <strong className="text-white">Anectta MAIL</strong> está usando as configurações de proxy do sistema do seu computador para se conectar à rede
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleOpenSystemProxy}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#1d6f7a] hover:bg-[#238491] text-white border border-[#2d8d9b] transition-colors flex items-center space-x-1.5 shadow-sm"
              >
                <span>Alterar as configurações de proxy...</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </button>

              <select
                value={current.mode}
                onChange={(e) => updateField('mode', e.target.value as ProxySettings['mode'])}
                className="bg-slate-900 border border-slate-700/90 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                title="Modo de conexão de proxy"
              >
                <option value="system">Usar configurações de proxy do sistema</option>
                <option value="direct">Sem proxy (conexão direta)</option>
                <option value="manual">Configuração manual de proxy</option>
              </select>
            </div>

            {statusMsg && (
              <div className="flex items-center space-x-2 text-xs text-emerald-400 pt-1">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{statusMsg}</span>
              </div>
            )}
          </div>

          {current.mode === 'manual' && (
            <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[11px] font-medium text-slate-300 block">
                    Endereço do servidor proxy (HTTP/HTTPS):
                  </label>
                  <input
                    type="text"
                    value={current.host || ''}
                    onChange={(e) => updateField('host', e.target.value)}
                    placeholder="Ex: proxy.empresa.com.br ou 192.168.1.10"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300 block">
                    Porta:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={current.port || 8080}
                    onChange={(e) => updateField('port', Math.max(1, Math.min(65535, Number(e.target.value) || 8080)))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-slate-300 block">
                  Ignorar proxy para estes endereços (separados por vírgula):
                </label>
                <input
                  type="text"
                  value={current.bypassList || ''}
                  onChange={(e) => updateField('bypassList', e.target.value)}
                  placeholder="localhost,127.0.0.1,<local>"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 font-mono"
                />
              </div>
            </div>
          )}

          {/* Autenticação do Proxy */}
          <div className="space-y-3 pt-1">
            <label className="flex items-center space-x-2.5 text-xs text-slate-200 hover:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={current.requiresAuth}
                onChange={(e) => updateField('requiresAuth', e.target.checked)}
                className="w-4 h-4 rounded text-[#1d6f7a] focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
              />
              <span>O proxy exige autenticação</span>
            </label>

            <div className="space-y-2.5 max-w-xl pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-center gap-2">
                <label className="text-xs text-slate-300">Nome de usuário:</label>
                <input
                  type="text"
                  disabled={!current.requiresAuth}
                  value={current.username || ''}
                  onChange={(e) => updateField('username', e.target.value)}
                  placeholder={current.requiresAuth ? 'Digite o usuário do proxy' : ''}
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] items-center gap-2">
                <label className="text-xs text-slate-300">Senha:</label>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    disabled={!current.requiresAuth}
                    value={current.password || ''}
                    onChange={(e) => updateField('password', e.target.value)}
                    placeholder={current.requiresAuth ? 'Digite a senha do proxy' : ''}
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg pl-3 pr-9 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 disabled:opacity-50"
                  />
                  {current.requiresAuth && (
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 text-slate-400 hover:text-slate-200"
                      title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
