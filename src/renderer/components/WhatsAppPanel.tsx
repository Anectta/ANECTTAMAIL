import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2,
  Maximize2,
  MessageCircle,
  Minimize2,
  Minus,
  Plus,
  RotateCw,
  X,
} from 'lucide-react';

interface WhatsAppPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type ConnectionState = 'qr' | 'syncing' | 'connected';

const WHATSAPP_URL = 'https://web.whatsapp.com';
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Largura virtual alvo do WhatsApp Web para exibir Contatos + Mensagens lado a lado dentro da caixa
const TARGET_VIRTUAL_WIDTH_QR = 600;
const TARGET_VIRTUAL_WIDTH_CONNECTED = 780;
const DEFAULT_SIDEBAR_WIDTH = 520;
const MIN_SIDEBAR_WIDTH = 360;
const MAX_SIDEBAR_WIDTH = 860;

// CSS injetado na WebView:
// 1. Mantém Contatos (#side) e Mensagens (#main) lado a lado (sem nunca esconder #main)
// 2. Fixa todos os ícones de navegação do WhatsApp agrupados no topo na horizontal
const WHATSAPP_FIT_CSS = `
  html, body {
    min-width: 0 !important;
    max-width: 100vw !important;
    overflow-x: hidden !important;
  }

  #app,
  #app > div,
  .landing-wrapper,
  .landing-window,
  .landing-main {
    min-width: 0 !important;
    max-width: 100vw !important;
    box-sizing: border-box !important;
  }

  .landing-wrapper {
    width: 100% !important;
    padding-left: 10px !important;
    padding-right: 10px !important;
  }

  [role="dialog"],
  [data-animate-modal-popup="true"],
  [data-animate-modal-body="true"] {
    max-width: calc(100vw - 24px) !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
  }

  /* Desloca o conteúdo 44px para baixo para acomodar a barra de ícones horizontal no topo */
  body[data-anectta-wa-ready="true"] #app {
    padding-top: 44px !important;
    height: 100vh !important;
    box-sizing: border-box !important;
  }

  /* Barra de ícones do WhatsApp fixa no topo na horizontal */
  [data-anectta-wa="nav-rail"] {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    width: 100vw !important;
    min-width: 100vw !important;
    max-width: 100vw !important;
    height: 44px !important;
    min-height: 44px !important;
    max-height: 44px !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 0 10px !important;
    margin: 0 !important;
    box-sizing: border-box !important;
    background-color: #f0f2f5 !important;
    border-right: none !important;
    border-bottom: 1px solid rgba(134, 150, 160, 0.3) !important;
    z-index: 9999 !important;
  }

  [data-anectta-wa-row="true"] {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: center !important;
    width: auto !important;
    height: 44px !important;
    min-height: 0 !important;
    max-height: 44px !important;
    margin: 0 !important;
    padding: 0 !important;
    gap: 4px !important;
  }

  [data-anectta-wa="nav-rail"] hr {
    width: 1px !important;
    height: 20px !important;
    margin: 0 4px !important;
  }

  /* Garante que a lista de contatos e a janela de mensagens fiquem lado a lado ocupando 100% da caixa */
  .two,
  ._aigs,
  [data-anectta-wa="two-container"] {
    min-width: 0 !important;
    max-width: 100vw !important;
    width: 100vw !important;
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    border: none !important;
  }

  [data-anectta-wa="side-col"] {
    flex: 0 0 40% !important;
    width: 40% !important;
    max-width: 40% !important;
    min-width: 0 !important;
    overflow: hidden !important;
    border-right: none !important;
    border-left: none !important;
  }

  [data-anectta-wa="side-col"] #side,
  [data-anectta-wa="side-col"] #pane-side {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    border-right: none !important;
    border-left: none !important;
  }

  [data-anectta-wa="main-col"],
  [data-anectta-wa="main-col"] #main {
    flex: 1 1 60% !important;
    width: 60% !important;
    max-width: 60% !important;
    min-width: 0 !important;
    border-left: none !important;
    border-right: none !important;
  }

  [data-anectta-wa="main-col"] #main {
    width: 100% !important;
    max-width: 100% !important;
  }

  /* Remove qualquer friso/linha divisória vertical interna ou pseudo-elemento do WhatsApp Web */
  #side,
  #main,
  .two::after,
  .two::before,
  #side::after,
  #side::before,
  #main::after,
  #main::before,
  [data-anectta-wa="side-col"]::after,
  [data-anectta-wa="main-col"]::before,
  [data-anectta-wa="divider"] {
    border-left: none !important;
    border-right: none !important;
  }

  [data-anectta-wa="divider"] {
    display: none !important;
    width: 0 !important;
  }
`;

// Script injetado na WebView para identificar a barra de ícones e as colunas de contatos (#side) e mensagens (#main)
const WHATSAPP_HORIZONTAL_RAIL_SCRIPT = `
(function () {
  function applyHorizontalRail() {
    var side = document.getElementById('side');
    if (!side) {
      document.body.removeAttribute('data-anectta-wa-ready');
      return;
    }

    var main = document.getElementById('main');
    var railRoot = null;

    // 1. Localiza o <header> ou <nav> da barra de ícones que está fora de #side e fora de #main
    var headers = Array.from(document.querySelectorAll('header, nav'));
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      if (!h.closest('#side') && !h.closest('#main') && !h.contains(side)) {
        var candidate = h;
        while (
          candidate.parentElement &&
          candidate.parentElement !== document.body &&
          !candidate.parentElement.contains(side)
        ) {
          candidate = candidate.parentElement;
        }
        railRoot = candidate;
        break;
      }
    }

    // 2. Fallback: sobe a partir de #side procurando o irmão com os botões da barra de navegação
    if (!railRoot) {
      var curr = side;
      while (curr && curr.parentElement && curr.parentElement !== document.body) {
        var parent = curr.parentElement;
        var children = Array.from(parent.children);
        var found = children.find(function (ch) {
          if (ch === curr || ch.contains(side)) return false;
          if (main && (ch === main || ch.contains(main))) return false;
          if (ch.querySelector && ch.querySelector('[role="dialog"]')) return false;
          var btnCount = ch.querySelectorAll ? ch.querySelectorAll('button, [role="button"]').length : 0;
          return btnCount >= 3;
        });
        if (found) {
          railRoot = found;
          break;
        }
        curr = parent;
      }
    }

    if (railRoot) {
      document.body.setAttribute('data-anectta-wa-ready', 'true');
      if (railRoot.getAttribute('data-anectta-wa') !== 'nav-rail') {
        railRoot.setAttribute('data-anectta-wa', 'nav-rail');
      }
      var innerContainers = railRoot.querySelectorAll('header, nav, div');
      innerContainers.forEach(function (el) {
        if (el.closest('button, [role="button"]')) return;
        if (el.getAttribute('data-anectta-wa-row') !== 'true') {
          el.setAttribute('data-anectta-wa-row', 'true');
        }
      });
    }

    // 3. Marca as colunas de Contatos (#side) e Mensagens (#main) para ficarem lado a lado (40% / 60%)
    var two = side.closest('.two') || (side.parentElement ? side.parentElement.parentElement : null);
    if (two) {
      if (two.getAttribute('data-anectta-wa') !== 'two-container') {
        two.setAttribute('data-anectta-wa', 'two-container');
      }
      var twoChildren = Array.from(two.children);
      twoChildren.forEach(function (ch) {
        if (ch === railRoot) return;
        if (ch.contains(side)) {
          if (ch.getAttribute('data-anectta-wa') !== 'side-col') {
            ch.setAttribute('data-anectta-wa', 'side-col');
          }
        } else if (main && ch.contains(main)) {
          if (ch.getAttribute('data-anectta-wa') !== 'main-col') {
            ch.setAttribute('data-anectta-wa', 'main-col');
          }
        } else {
          var rect = ch.getBoundingClientRect();
          if (rect.width > 0 && rect.width <= 12 && !ch.querySelector('[role="dialog"]')) {
            ch.setAttribute('data-anectta-wa', 'divider');
          }
        }
      });

      // Remove bordas laterais residuais de elementos internos que tinham largura fixa
      var bordered = two.querySelectorAll('*');
      bordered.forEach(function (el) {
        var st = window.getComputedStyle(el);
        if (
          (st.borderRightWidth && st.borderRightWidth !== '0px' && el.clientHeight > 200) ||
          (st.borderLeftWidth && st.borderLeftWidth !== '0px' && el.clientHeight > 200)
        ) {
          el.style.setProperty('border-right', 'none', 'important');
          el.style.setProperty('border-left', 'none', 'important');
        }
      });
    }
  }

  applyHorizontalRail();
  if (!window.__anecttaWaRailObserver) {
    window.__anecttaWaRailObserver = new MutationObserver(function () {
      applyHorizontalRail();
    });
    window.__anecttaWaRailObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
})();
`;

export const WhatsAppPanel: React.FC<WhatsAppPanelProps> = ({ isOpen, onClose }) => {
  const webviewRef = useRef<any>(null);
  const isDomReadyRef = useRef(false);

  const [hasActivated, setHasActivated] = useState(isOpen);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('qr');
  const [viewMode, setViewMode] = useState<'docked' | 'modal'>('docked');
  const [sidebarWidth, setSidebarWidth] = useState<number>(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [zoomOffset, setZoomOffset] = useState<number>(0);

  useEffect(() => {
    if (isOpen && !hasActivated) {
      setHasActivated(true);
    }
  }, [isOpen, hasActivated]);

  const targetVirtualWidth =
    connectionState === 'connected' ? TARGET_VIRTUAL_WIDTH_CONNECTED : TARGET_VIRTUAL_WIDTH_QR;

  const autoZoom =
    viewMode === 'modal'
      ? 1
      : Math.min(1, Math.max(0.5, Number((sidebarWidth / targetVirtualWidth).toFixed(2))));

  const effectiveZoom = Math.min(
    1.15,
    Math.max(0.45, Number((autoZoom + zoomOffset).toFixed(2)))
  );

  const applyWebviewFit = useCallback((zoom: number) => {
    const webview = webviewRef.current;
    if (!webview || !isDomReadyRef.current) return;
    try {
      webview.setZoomFactor(zoom);
      webview.insertCSS(WHATSAPP_FIT_CSS).catch(() => {});
      webview.executeJavaScript(WHATSAPP_HORIZONTAL_RAIL_SCRIPT).catch(() => {});
    } catch {
      // WebView ainda inicializando
    }
  }, []);

  useEffect(() => {
    applyWebviewFit(effectiveZoom);
  }, [effectiveZoom, applyWebviewFit]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - e.clientX)
      );
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    if (!hasActivated) return;
    const webview = webviewRef.current;
    if (!webview) return;

    let cancelled = false;
    let pollTimeout: number | undefined;

    const handleDomReady = () => {
      if (cancelled) return;
      isDomReadyRef.current = true;
      setIsInitialLoading(false);
      setIsRefreshing(false);
      applyWebviewFit(effectiveZoom);
    };

    const handleDidFinishLoad = () => {
      if (cancelled) return;
      setIsInitialLoading(false);
      setIsRefreshing(false);
      applyWebviewFit(effectiveZoom);
    };

    const handleDidStartLoading = () => {
      if (!cancelled) setIsRefreshing(true);
    };

    const handleDidFailLoad = (e: any) => {
      if (e?.errorCode === -3 || e?.isMainFrame === false) return;
      if (!cancelled) {
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-finish-load', handleDidFinishLoad);
    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-fail-load', handleDidFailLoad);

    const pollAuthState = () => {
      if (cancelled) return;

      const scheduleNext = (state: ConnectionState) => {
        if (cancelled) return;
        const delay = state === 'connected' ? 2000 : 500;
        pollTimeout = window.setTimeout(pollAuthState, delay);
      };

      try {
        webview
          .executeJavaScript(
            `(function () {
              if (document.querySelector('#pane-side, [data-testid="chat-list"], [data-testid="menu-bar-chats"], [aria-label="Lista de conversas"], [aria-label="Chat list"]')) {
                return 'connected';
              }
              if (document.querySelector('progress, [data-testid="startup-progress-bar"], [role="progressbar"]')) {
                return 'syncing';
              }
              return 'qr';
            })()`
          )
          .then((nextState: ConnectionState) => {
            if (cancelled) return;
            const normalized: ConnectionState =
              nextState === 'connected' || nextState === 'syncing' ? nextState : 'qr';
            if (normalized === 'connected') {
              webview.executeJavaScript(WHATSAPP_HORIZONTAL_RAIL_SCRIPT).catch(() => {});
            }
            setConnectionState((prev) => {
              if (prev !== normalized && normalized === 'connected') {
                applyWebviewFit(effectiveZoom);
              }
              return prev === normalized ? prev : normalized;
            });
            scheduleNext(normalized);
          })
          .catch(() => {
            scheduleNext('qr');
          });
      } catch {
        scheduleNext('qr');
      }
    };

    pollTimeout = window.setTimeout(pollAuthState, 500);

    return () => {
      cancelled = true;
      if (pollTimeout !== undefined) window.clearTimeout(pollTimeout);
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-finish-load', handleDidFinishLoad);
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
    };
  }, [hasActivated, applyWebviewFit, effectiveZoom]);

  if (!hasActivated) {
    return null;
  }

  const showAsModal = viewMode === 'modal';

  const outerClass = !isOpen
    ? 'hidden'
    : showAsModal
    ? 'fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4'
    : 'relative shrink-0 h-full bg-slate-950 border-l border-slate-800/80 flex flex-col overflow-hidden';

  const cardClass = showAsModal
    ? 'w-[860px] max-w-[94vw] h-[700px] max-h-[90vh] rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl flex flex-col overflow-hidden'
    : 'w-full h-full flex flex-col overflow-hidden';

  const statusBadge =
    connectionState === 'connected'
      ? {
          label: 'Conectado',
          className: 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30',
        }
      : connectionState === 'syncing'
      ? {
          label: 'Sincronizando...',
          className: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
        }
      : {
          label: 'Escaneie o QR Code',
          className: 'bg-amber-500/15 text-amber-500 border border-amber-500/30',
        };

  return (
    <div
      className={outerClass}
      style={!showAsModal && isOpen ? { width: `${sidebarWidth}px`, maxWidth: '60vw' } : undefined}
      aria-label="WhatsApp Web"
    >
      {!showAsModal && (
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
          onDoubleClick={() => {
            setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
            setZoomOffset(0);
          }}
          title="Arraste para ajustar a largura (duplo clique para restaurar)"
          className="absolute left-0 top-0 bottom-0 w-1.5 z-30 cursor-col-resize hover:bg-emerald-500/40 transition-colors"
        />
      )}

      <div className={cardClass}>
        <div className="h-10 px-2.5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-1.5 shrink-0">
          <div className="flex items-center space-x-1.5 min-w-0">
            <MessageCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-xs font-semibold text-slate-100 truncate">
              WhatsApp
            </span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium truncate ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
          </div>

          <div className="flex items-center space-x-0.5 shrink-0">
            <div className="flex items-center bg-slate-800/70 rounded-md px-0.5 mr-1">
              <button
                type="button"
                onClick={() => setZoomOffset((z) => Number(Math.max(-0.25, z - 0.05).toFixed(2)))}
                title="Diminuir zoom para caber mais conteúdo"
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <Minus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setZoomOffset(0)}
                title="Restaurar ajuste automático à caixa"
                className="px-1 text-[10px] font-mono text-slate-300 hover:text-white"
              >
                {Math.round(effectiveZoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoomOffset((z) => Number(Math.min(0.35, z + 0.05).toFixed(2)))}
                title="Aumentar zoom"
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {showAsModal ? (
              <button
                type="button"
                onClick={() => setViewMode('docked')}
                title="Voltar para a barra lateral direita"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setViewMode('modal')}
                title="Expandir janela"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                try {
                  setIsRefreshing(true);
                  webviewRef.current?.reload();
                } catch {
                  // Ignora erro caso webview não esteja pronta
                }
              }}
              title="Recarregar WhatsApp Web"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Fechar barra lateral do WhatsApp"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="relative flex-1 w-full h-full bg-white overflow-hidden">
          {isInitialLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90 text-slate-300 gap-2">
              <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
              <span className="text-xs">Carregando WhatsApp Web...</span>
            </div>
          )}

          {isResizing && <div className="absolute inset-0 z-20 bg-transparent" />}

          <webview
            ref={webviewRef}
            src={WHATSAPP_URL}
            partition="persist:whatsapp"
            useragent={CHROME_USER_AGENT}
            className="w-full h-full border-0"
            allowpopups={false}
          />
        </div>
      </div>
    </div>
  );
};
