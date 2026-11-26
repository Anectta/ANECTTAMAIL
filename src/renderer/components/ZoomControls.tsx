import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Maximize, Minimize, Minus, Plus } from 'lucide-react';

/** Mesmos limites do zoom do processo principal (Ctrl + / Ctrl - / Ctrl 0). */
const MIN = 0.7;
const MAX = 1.5;
const STEP = 0.1;
const PRESETS = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5];

const round = (v: number) => Math.round(Math.min(MAX, Math.max(MIN, v)) * 100) / 100;

/**
 * Controle de zoom da barra superior: diminuir, aumentar, porcentagem (lista),
 * voltar a 100% e tela cheia. No app usa o zoom da janela; fora dele (navegador), o zoom da página.
 */
export const ZoomControls: React.FC = () => {
  const api = window.electronAPI;
  const [zoom, setZoomState] = useState(1);
  const [fullScreen, setFullScreen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let off: (() => void) | undefined;
    void api?.getZoom?.().then((f) => typeof f === 'number' && setZoomState(f));
    void api?.isFullScreen?.().then((v) => setFullScreen(Boolean(v)));
    off = api?.onZoomChanged?.((f) => setZoomState(f));
    const onFs = () => {
      if (!api?.isFullScreen) setFullScreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      off?.();
      document.removeEventListener('fullscreenchange', onFs);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menuOpen]);

  const applyZoom = async (value: number) => {
    const next = round(value);
    if (api?.setZoom) {
      const applied = await api.setZoom(next);
      setZoomState(typeof applied === 'number' ? applied : next);
    } else {
      (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(next);
      setZoomState(next);
    }
  };

  const toggleFullScreen = async () => {
    if (api?.toggleFullScreen) {
      setFullScreen(Boolean(await api.toggleFullScreen()));
    } else if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen?.();
    }
  };

  const percent = `${Math.round(zoom * 100)}%`;
  const btn = 'header-icon-btn p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Zoom da tela">
      <button type="button" className={btn} onClick={() => applyZoom(zoom + STEP)} disabled={zoom >= MAX} title="Aumentar zoom (Ctrl +)">
        <Plus className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={btn} onClick={() => applyZoom(zoom - STEP)} disabled={zoom <= MIN} title="Diminuir zoom (Ctrl -)">
        <Minus className="w-3.5 h-3.5" />
      </button>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="header-ghost flex items-center gap-1 px-2 py-0.5 border rounded-md text-[11px] font-semibold tabular-nums min-w-[62px] justify-between"
          title="Escolher o zoom"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
        >
          <span>{percent}</span>
          <ChevronDown className="w-3 h-3 opacity-80" />
        </button>
        {menuOpen && (
          <div
            role="listbox"
            aria-label="Zoom"
            className="absolute right-0 top-full mt-1 z-[90] w-28 rounded-lg border border-slate-700 bg-slate-900 shadow-2xl py-1 text-xs text-slate-200"
          >
            {PRESETS.map((p) => {
              const active = Math.round(p * 100) === Math.round(zoom * 100);
              return (
                <button
                  key={p}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setMenuOpen(false);
                    void applyZoom(p);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-slate-800 ${
                    active ? 'text-sky-300 font-semibold' : ''
                  }`}
                >
                  <span>{Math.round(p * 100)}%</span>
                  {active && <Check className="w-3 h-3" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        className={btn}
        onClick={toggleFullScreen}
        title={fullScreen ? 'Sair da tela cheia' : 'Tela cheia'}
      >
        {fullScreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};
