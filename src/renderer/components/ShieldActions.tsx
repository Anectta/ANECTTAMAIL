import React, { useEffect, useRef, useState } from 'react';

export type ShieldTone = 'green' | 'amber' | 'red';

export interface ShieldActionItem {
  key: string;
  icon: React.ReactNode;
  /** Nome curto mostrado embaixo do ícone. */
  label: string;
  tone: ShieldTone;
  /** Pulsar ao abrir o e-mail (alertas de perigo). */
  pulse?: boolean;
  /** Texto do tooltip. */
  title?: string;
  /** Conteúdo do painel aberto ao clicar (recebe a função para fechar). */
  render: (close: () => void) => React.ReactNode;
}

const TONE: Record<ShieldTone, { tile: string; label: string; panel: string }> = {
  green: {
    tile: 'border-emerald-500/45 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20',
    label: 'text-emerald-300',
    panel: 'border-emerald-500/40',
  },
  amber: {
    tile: 'border-amber-500/45 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20',
    label: 'text-amber-300',
    panel: 'border-amber-500/40',
  },
  red: {
    tile: 'border-rose-500/60 text-rose-400 bg-rose-500/15 hover:bg-rose-500/25',
    label: 'text-rose-300',
    panel: 'border-rose-500/50',
  },
};

/**
 * Escudo Anectta em ícones: cada aviso vira um ícone com nome curto embaixo,
 * que só aparece quando a situação existe. Ao clicar, abre um painel com detalhes e ações.
 */
export const ShieldActions: React.FC<{ items: ShieldActionItem[]; resetKey?: string }> = ({ items, resetKey }) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [pulseOn, setPulseOn] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  // Novo e-mail: fecha o painel e volta a pulsar os alertas de perigo por alguns segundos
  useEffect(() => {
    setOpenKey(null);
    setPulseOn(true);
    const t = window.setTimeout(() => setPulseOn(false), 6000);
    return () => window.clearTimeout(t);
  }, [resetKey]);

  useEffect(() => {
    if (!openKey) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenKey(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenKey(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openKey]);

  if (items.length === 0) return null;
  const open = items.find((i) => i.key === openKey) || null;

  return (
    <div ref={rootRef} className="relative flex items-start gap-2" aria-label="Escudo Anectta">
      {items.map((item) => {
        const tone = TONE[item.tone];
        const isOpen = openKey === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => setOpenKey(isOpen ? null : item.key)}
            title={item.title || item.label}
            aria-expanded={isOpen}
            className="flex flex-col items-center gap-1 w-[74px] cursor-pointer group"
          >
            <span
              className={`relative w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${tone.tile} ${
                isOpen ? 'ring-2 ring-white/20' : ''
              }`}
            >
              {item.pulse && pulseOn && (
                <span className="absolute inset-0 rounded-xl border-2 border-rose-400/70 animate-ping" aria-hidden="true" />
              )}
              {item.icon}
            </span>
            <span className={`text-[10px] font-semibold leading-tight text-center ${tone.label}`}>{item.label}</span>
          </button>
        );
      })}

      {open && (
        <div
          role="dialog"
          aria-label={open.label}
          className={`absolute right-0 top-full mt-2 z-40 w-[340px] max-w-[80vw] rounded-xl border bg-slate-950 shadow-2xl p-3.5 text-xs text-slate-200 space-y-2.5 ${TONE[open.tone].panel}`}
        >
          {open.render(() => setOpenKey(null))}
        </div>
      )}
    </div>
  );
};
