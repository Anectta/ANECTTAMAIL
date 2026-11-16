import React from 'react';
import { X, Palette, Sparkles } from 'lucide-react';
import { SkinGalleryPanel } from './SkinGalleryPanel';

interface SkinSelectorModalProps {
  onClose: () => void;
}

export const SkinSelectorModal: React.FC<SkinSelectorModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md select-none">
      <div
        className="w-full max-w-2xl max-h-[88vh] rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--bg-surface, #0f172a)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <Palette className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Skins, Temas & Ambientação Sonora
              </h3>
              <p className="text-xs text-slate-400">
                Personalize a atmosfera visual, variáveis CSS, contraste e sonoplastia do app
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scroll text-xs text-slate-200">
          <SkinGalleryPanel />
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400 flex items-center space-x-1">
            <Sparkles className="w-3.5 h-3.5 text-brand-400" />
            <span>As variáveis CSS são aplicadas dinamicamente sem recarregar o app</span>
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-brand-600/30 transition-all"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
