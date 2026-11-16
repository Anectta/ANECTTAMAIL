import React, { useRef, useEffect } from 'react';
import { Minus, Square, X, Search } from 'lucide-react';
import logoImg from '../assets/logo.png';

interface TitleBarProps {
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  activeAccountEmail?: string;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  searchQuery = '',
  onSearchChange,
  activeAccountEmail,
}) => {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximizeWindow();
  };

  const handleClose = () => {
    window.electronAPI?.closeWindow();
  };

  return (
    <header className="h-10 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between px-3 select-none app-drag-region z-50">
      {/* Brand & Left Status */}
      <div className="flex items-center space-x-2.5 app-no-drag">
        <img
          src={logoImg}
          alt="Anectta MAIL"
          className="w-5 h-5 object-contain select-none"
        />
        <span className="text-xs font-semibold tracking-wide text-slate-200">
          Anectta <span className="text-brand-400 font-normal">MAIL</span>
        </span>
      </div>

      {/* Center Dedicated Email Search Bar (Restrita à conta marcada) */}
      <div className="flex-1 max-w-lg mx-4 app-no-drag">
        <div className="relative flex items-center w-full">
          <Search className="w-3.5 h-3.5 text-brand-400 absolute left-3 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onSearchChange?.('');
                searchInputRef.current?.blur();
              }
            }}
            placeholder={
              activeAccountEmail
                ? `Buscar e-mails em ${activeAccountEmail}...`
                : 'Buscar e-mails na conta marcada...'
            }
            className="w-full bg-slate-900/90 hover:bg-slate-850 focus:bg-slate-900 border border-slate-800 focus:border-brand-500 rounded-lg pl-8 pr-16 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition-all shadow-inner"
          />
          <div className="absolute right-2 flex items-center space-x-1">
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  onSearchChange?.('');
                  searchInputRef.current?.focus();
                }}
                className="p-0.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
                title="Limpar busca (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-400 rounded border border-slate-700 select-none">
                Ctrl + K
              </kbd>
            )}
          </div>
        </div>
      </div>

      {/* Right Window Controls (for Windows / Linux frameless styling) */}
      <div className="flex items-center space-x-1 app-no-drag">
        {isElectron && (
          <>
            <button
              onClick={handleMinimize}
              className="w-8 h-7 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded transition-colors"
              title="Minimizar"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleMaximize}
              className="w-8 h-7 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded transition-colors"
              title="Maximizar"
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              onClick={handleClose}
              className="w-8 h-7 flex items-center justify-center text-slate-400 hover:text-rose-200 hover:bg-rose-600/90 rounded transition-colors"
              title="Fechar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </header>
  );
};
