import React, { useEffect, useRef, useState } from 'react';

/** Cada situação tem a sua cor (definidas em index.css → .shield-tone-*, com versão para temas claros). */
export type ShieldTone = 'golpe' | 'suspeito' | 'desvio' | 'bloqueio' | 'protecao' | 'imagem' | 'inscricao';
/** Estilo por gravidade: perigo = quadrado preenchido · atenção = contorno · informação = só o desenho. */
export type ShieldKind = 'danger' | 'attention' | 'info' | 'plain';

export interface ShieldActionItem {
  key: string;
  icon: React.ReactNode;
  /** Nome curto mostrado embaixo do ícone. */
  label: string;
  tone: ShieldTone;
  /** 'plain' = ícone em imagem (desenho original), sem quadrado. */
  kind: ShieldKind;
  /** Pulsar ao abrir o e-mail (alertas de perigo). */
  pulse?: boolean;
  /** Número pequeno no canto (ex.: quantas imagens foram bloqueadas). */
  count?: number;
  /** Texto do tooltip. */
  title?: string;
  /** Conteúdo do painel aberto ao clicar (recebe a função para fechar). */
  render: (close: () => void) => React.ReactNode;
}

/**
 * Escudo Anectta em ícones: cada aviso vira um ícone com nome curto embaixo,
 * que só aparece quando a situação existe. Ao clicar, abre um painel com detalhes e ações.
 */
export const ShieldActions: React.FC<{
  items: ShieldActionItem[];
  resetKey?: string;
  /** 'toolbar' = botões iguais aos da barra de ações (só o ícone; o nome aparece ao passar o mouse). */
  variant?: 'card' | 'toolbar';
}> = ({ items, resetKey, variant = 'card' }) => {
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

  if (variant === 'toolbar') {
    return (
      <div ref={rootRef} className="shield-toolbar relative flex items-center gap-2" aria-label="Escudo Anectta">
        {items.map((item) => {
          const isOpen = openKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setOpenKey(isOpen ? null : item.key)}
              title={item.title || item.label}
              aria-label={item.label}
              aria-expanded={isOpen}
              className={`action-tile${isOpen ? ' is-active' : ''} shield-tone-${item.tone} relative w-8 h-8 shrink-0 flex items-center justify-center rounded-[10px] border transition-all duration-150`}
              style={{ ['--tile-color' as string]: 'var(--sc)' } as React.CSSProperties}
            >
              {(item.pulse ?? item.kind === 'danger') && pulseOn && (
                <span className="shield-pulse shield-pulse-tile animate-ping" aria-hidden="true" />
              )}
              {item.icon}
              {typeof item.count === 'number' && item.count > 0 && (
                <span className="shield-badge shield-badge-tile">{item.count > 99 ? '99+' : item.count}</span>
              )}
            </button>
          );
        })}

        {open && (
          <div
            role="dialog"
            aria-label={open.label}
            className={`shield-tone-${open.tone} shield-panel absolute right-0 top-full mt-2 z-40 w-[340px] max-w-[80vw] rounded-xl border bg-slate-950 shadow-2xl p-3.5 text-xs text-slate-200 space-y-2.5`}
          >
            {open.render(() => setOpenKey(null))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative flex items-start gap-1" aria-label="Escudo Anectta">
      {items.map((item) => {
        const isOpen = openKey === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => setOpenKey(isOpen ? null : item.key)}
            title={item.title || item.label}
            aria-expanded={isOpen}
            className={`shield-btn shield-tone-${item.tone} flex flex-col items-center gap-1 w-[70px] cursor-pointer`}
          >
            <span className="relative inline-flex">
              <span className={`shield-tile shield-tile-${item.kind} ${isOpen ? 'shield-tile-open' : ''}`}>
                {(item.pulse ?? item.kind === 'danger') && pulseOn && (
                  <span className="shield-pulse animate-ping" aria-hidden="true" />
                )}
                {item.icon}
              </span>
              {typeof item.count === 'number' && item.count > 0 && (
                <span className="shield-badge">{item.count > 99 ? '99+' : item.count}</span>
              )}
            </span>
            <span className="shield-label text-[10px] font-semibold leading-tight text-center">{item.label}</span>
          </button>
        );
      })}

      {open && (
        <div
          role="dialog"
          aria-label={open.label}
          className={`shield-tone-${open.tone} shield-panel absolute right-0 top-full mt-2 z-40 w-[340px] max-w-[80vw] rounded-xl border bg-slate-950 shadow-2xl p-3.5 text-xs text-slate-200 space-y-2.5`}
        >
          {open.render(() => setOpenKey(null))}
        </div>
      )}
    </div>
  );
};
