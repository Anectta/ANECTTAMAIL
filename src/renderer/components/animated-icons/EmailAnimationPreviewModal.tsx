import React, { useState } from 'react';
import { X, Play, Pause, Sparkles, Check, Send, Inbox } from 'lucide-react';
import { EmailSending } from './EmailSending';
import { EmailReceiving } from './EmailReceiving';

interface EmailAnimationPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COLOR_PRESETS = [
  {
    name: 'Anectta Corporate (Padrão)',
    primary: '#3b82f6',
    secondary: '#06b6d4',
    tray: '#64748b',
  },
  {
    name: 'Emerald Privacy Shield',
    primary: '#10b981',
    secondary: '#34d399',
    tray: '#475569',
  },
  {
    name: 'Violet Executive',
    primary: '#8b5cf6',
    secondary: '#c084fc',
    tray: '#64748b',
  },
  {
    name: 'Amber High Priority',
    primary: '#f59e0b',
    secondary: '#fbbf24',
    tray: '#78716c',
  },
];

export const EmailAnimationPreviewModal: React.FC<EmailAnimationPreviewModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [size, setSize] = useState<number>(64);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [selectedPreset, setSelectedPreset] = useState(0);

  if (!isOpen) return null;

  const currentTheme = COLOR_PRESETS[selectedPreset];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <span className="p-1.5 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Preview de Ícones Animados (SVG + CSS Puro)
              </h3>
              <p className="text-[11px] text-slate-400">
                Aceleração por GPU • Zero layout shift • 64x64px responsivo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh] custom-scroll">
          {/* Side-by-Side Icon Showcase */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. EmailSending */}
            <div className="flex flex-col items-center justify-between p-6 rounded-2xl bg-slate-950/60 border border-slate-800/80 shadow-inner min-h-[220px]">
              <div className="w-full flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
                  <Send className="w-3.5 h-3.5 text-brand-400" />
                  <span>EmailSending (Envio)</span>
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-brand-300">
                  2.4s ease-in-out
                </span>
              </div>

              {/* Render Animated Icon */}
              <div className="my-6 flex items-center justify-center p-4">
                <EmailSending
                  size={size}
                  playing={isPlaying}
                  primaryColor={currentTheme.primary}
                  secondaryColor={currentTheme.secondary}
                />
              </div>

              <div className="text-[11px] text-slate-500 text-center">
                Envelope morphing → avião de papel → decolagem com rastro
              </div>
            </div>

            {/* 2. EmailReceiving */}
            <div className="flex flex-col items-center justify-between p-6 rounded-2xl bg-slate-950/60 border border-slate-800/80 shadow-inner min-h-[220px]">
              <div className="w-full flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
                  <Inbox className="w-3.5 h-3.5 text-cyan-400" />
                  <span>EmailReceiving (Recebimento)</span>
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300">
                  2.4s ease-out
                </span>
              </div>

              {/* Render Animated Icon */}
              <div className="my-6 flex items-center justify-center p-4">
                <EmailReceiving
                  size={size}
                  playing={isPlaying}
                  primaryColor={currentTheme.primary}
                  secondaryColor={currentTheme.secondary}
                  trayColor={currentTheme.tray}
                />
              </div>

              <div className="text-[11px] text-slate-500 text-center">
                Descida com asas batendo → pouso na bandeja → bounce elástico
              </div>
            </div>
          </div>

          {/* Interactive Controls Panel */}
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-4">
            <span className="text-xs font-bold text-slate-300 tracking-wider uppercase">
              Controles Interativos em Tempo Real
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
              {/* Play / Pause Toggle */}
              <div>
                <span className="text-[11px] text-slate-400 block mb-1.5">Estado da Animação:</span>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    isPlaying
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                      : 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pausar Animação</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Reproduzir (Loop)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Size Slider */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                  <span>Escala do Ícone:</span>
                  <span className="font-mono text-brand-400 font-bold">{size}px × {size}px</span>
                </div>
                <input
                  type="range"
                  min="32"
                  max="128"
                  step="8"
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="w-full accent-brand-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                  <span>32px</span>
                  <span>64px (Padrão)</span>
                  <span>96px</span>
                  <span>128px</span>
                </div>
              </div>
            </div>

            {/* Color Theme Selector */}
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[11px] text-slate-400 block mb-2">Paleta de Cores (CSS Custom Properties):</span>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((preset, idx) => (
                  <button
                    key={preset.name}
                    onClick={() => setSelectedPreset(idx)}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                      selectedPreset === idx
                        ? 'bg-slate-800 text-white border-brand-500/60 shadow-sm ring-1 ring-brand-500/40'
                        : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                      style={{ background: preset.primary }}
                    />
                    <span>{preset.name}</span>
                    {selectedPreset === idx && <Check className="w-3 h-3 text-brand-400" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Real Usage Simulation Card */}
          <div className="p-4 rounded-xl bg-slate-950/30 border border-slate-800/60 space-y-3">
            <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">
              Exemplo de Aplicação na UI do Anectta MAIL
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Notification Sending Pill */}
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center space-x-3">
                <EmailSending size={36} playing={isPlaying} />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-slate-200 block truncate">Despachando E-mail...</span>
                  <span className="text-[10px] text-slate-500 block truncate font-mono">SMTP tls://smtp.anectta.com.br</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-brand-400 animate-ping shrink-0" />
              </div>

              {/* Notification Receiving Pill */}
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center space-x-3">
                <EmailReceiving size={36} playing={isPlaying} />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-slate-200 block truncate">Sincronizando Mensagens...</span>
                  <span className="text-[10px] text-slate-500 block truncate font-mono">IMAP INBOX • Verificando novas</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
              </div>
            </div>

            {/* Test Notifier Window Trigger Button */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-brand-500/10 border border-brand-500/30 mt-3">
              <div>
                <span className="text-xs font-bold text-white block">Testar Janela Notifier no Canto da Tela</span>
                <span className="text-[11px] text-slate-400 block">
                  Abre a janela secundária frameless e transparente no canto inferior direito.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  window.electronAPI?.showNotifier({
                    id: 'msg-test-popup',
                    sender: 'Diretoria Executiva Anectta',
                    subject: 'Novo E-mail Corporativo com Animação!',
                    snippet: 'Visualização da janela secundária Notifier no canto da tela.',
                  });
                }}
                className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all flex items-center space-x-1.5 shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Disparar Notifier</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono text-[11px]">
            &lt;EmailSending /&gt; e &lt;EmailReceiving /&gt; prontos para uso
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white font-medium rounded-lg transition-colors text-xs"
          >
            Fechar Preview
          </button>
        </div>
      </div>
    </div>
  );
};
