import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  const panelRef = useRef<HTMLDivElement>(null);
  // Posição do ícone clicado (o painel da barra abre solto, por cima de tudo, sempre dentro da janela)
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

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
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpenKey(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenKey(null);
    const onResize = () => setOpenKey(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
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
              onClick={(e) => {
                setAnchor(e.currentTarget.getBoundingClientRect());
                setOpenKey(isOpen ? null : item.key);
              }}
              title={item.title || item.label}
              aria-label={item.label}
              aria-expanded={isOpen}
              className={`action-tile${isOpen ? ' is-active' : ''} shield-tone-${item.tone} relative w-8 h-8 shrink-0 flex items-center justify-center rounded-[7px] border transition-all duration-150`}
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

        {open &&
          anchor &&
          (() => {
            const margin = 8;
            const width = Math.min(340, window.innerWidth - margin * 2);
            // Preferência: alinhado à esquerda do ícone; se não couber, à direita; sempre dentro da janela
            let left = anchor.left;
            if (left + width > window.innerWidth - margin) left = anchor.right - width;
            left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
            const top = anchor.bottom + 8;
            return createPortal(
              <div
                ref={panelRef}
                role="dialog"
                aria-label={open.label}
                style={{ position: 'fixed', top, left, width, maxHeight: Math.max(160, window.innerHeight - top - 12) }}
                className={`shield-tone-${open.tone} shield-panel z-[70] overflow-y-auto rounded-xl border bg-slate-950 shadow-2xl p-3.5 text-xs text-slate-200 space-y-2.5`}
              >
                {open.render(() => setOpenKey(null))}
              </div>,
              document.body
            );
          })()}
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
