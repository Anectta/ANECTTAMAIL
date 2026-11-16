import React, { useMemo, useState } from 'react';
import { ExternalLink, Globe, RotateCw, ShieldAlert } from 'lucide-react';

interface WebAppPanelProps {
  name: string;
  url: string;
}

/**
 * Painel de aplicativo web externo.
 * Usa <webview> isolado (sem preload/Node, em sandbox, com sessão persistente por domínio)
 * em vez de <iframe>, que era bloqueado pela CSP do aplicativo.
 * Somente URLs https:// são carregadas dentro do app.
 */
export const WebAppPanel: React.FC<WebAppPanelProps> = ({ name, url }) => {
  const [reloadKey, setReloadKey] = useState(0);

  const parsed = useMemo(() => {
    try {
      const u = new URL(url);
      return { ok: u.protocol === 'https:', hostname: u.hostname };
    } catch {
      return { ok: false, hostname: '' };
    }
  }, [url]);

  const partition = useMemo(
    () => `persist:webapp-${parsed.hostname.toLowerCase().replace(/[^a-z0-9.-]/g, '_')}`,
    [parsed.hostname]
  );

  const openExternal = () => {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950">
      <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <Globe className="w-4 h-4 text-brand-400 shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold text-slate-100 truncate">{name}</span>
          <span className="text-[11px] text-slate-400 font-mono truncate hidden sm:inline">{url}</span>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          {parsed.ok && (
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              aria-label={`Recarregar ${name}`}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center space-x-1 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Recarregar</span>
            </button>
          )}
          <button
            type="button"
            onClick={openExternal}
            className="px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center space-x-1 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Abrir no navegador</span>
          </button>
        </div>
      </div>

      {parsed.ok ? (
        <webview
          key={`${url}-${reloadKey}`}
          src={url}
          partition={partition}
          className="flex-1 w-full h-full border-0 bg-white"
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-300 space-y-3">
          <ShieldAlert className="w-10 h-10 text-amber-400" aria-hidden="true" />
          <p className="text-sm font-semibold">Este endereço não pode ser aberto dentro do aplicativo.</p>
          <p className="text-xs text-slate-400 max-w-md">
            Por segurança, apenas endereços <span className="font-mono">https://</span> são carregados aqui.
            Use &quot;Abrir no navegador&quot; ou edite o aplicativo com um endereço seguro.
          </p>
        </div>
      )}
    </div>
  );
};
