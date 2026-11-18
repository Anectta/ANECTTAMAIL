import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { SenderAvatar } from './SenderAvatar';
import { soundService } from '../services/soundService';

interface NotifierData {
  id: string;
  sender: string;
  senderEmail?: string;
  avatar?: string;
  subject: string;
  snippet?: string;
}

export const NotificationPopupView: React.FC = () => {
  const [data, setData] = useState<NotifierData>({
    id: '',
    sender: 'Novo Remetente',
    subject: 'Nova mensagem corporativa recebida',
    snippet: 'Clique para abrir e visualizar no Anectta MAIL.',
  });

  useEffect(() => {
    // Garante que o fundo do documento seja 100% transparente
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';

    if (window.electronAPI?.getLatestNotifierData) {
      window.electronAPI.getLatestNotifierData().then((latest) => {
        if (latest) {
          setData(latest as NotifierData);
          soundService.play('notify');
        }
      });
    }

    if (window.electronAPI?.onNotifierData) {
      const cleanup = window.electronAPI.onNotifierData((incoming) => {
        if (incoming) {
          setData(incoming as NotifierData);
          soundService.play('notify');
        }
      });
      return () => cleanup();
    }
  }, []);

  const handleClick = () => {
    soundService.play('click');
    if (window.electronAPI?.clickNotifier) {
      window.electronAPI.clickNotifier(data.id);
    }
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundService.play('pop');
    if (window.electronAPI?.closeNotifier) {
      window.electronAPI.closeNotifier();
    }
  };

  return (
    <div className="w-screen h-screen p-2.5 flex items-center justify-center overflow-hidden bg-transparent font-sans">
      <div
        onClick={handleClick}
        className="w-full h-full rounded-2xl px-3.5 py-2.5 shadow-2xl backdrop-blur-xl flex items-center space-x-3 cursor-pointer transition-all duration-200 group active:scale-[0.99] border"
        style={{
          background: 'var(--bg-surface, rgba(15, 23, 42, 0.95))',
          borderColor: 'var(--border-highlight, rgba(59, 130, 246, 0.6))',
          boxShadow: 'var(--accent-glow, 0 10px 25px rgba(0,0,0,0.5))',
        }}
        title="Clique para abrir mensagem no Anectta MAIL"
      >
        {/* Avatar do Remetente */}
        <div className="shrink-0 group-hover:scale-105 transition-transform">
          <SenderAvatar
            name={data.sender}
            email={data.senderEmail}
            avatar={data.avatar}
            size={48}
          />
        </div>

        {/* Content Body */}
        <div className="flex-1 min-w-0 pr-1">
          {/* Header Row */}
          <div className="flex items-center justify-between pb-0.5">
            <span
              className="flex items-center space-x-1.5 text-[10px] font-bold tracking-wider uppercase font-mono"
              style={{ color: 'var(--accent-primary, #38bdf8)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
              <span>Novo E-mail Recebido</span>
            </span>

            <button
              onClick={handleClose}
              className="w-5 h-5 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Fechar notificação"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Sender */}
          <h4 className="text-xs font-bold truncate leading-snug group-hover:text-brand-300 transition-colors text-white">
            {data.sender}
          </h4>

          {/* Subject */}
          <p className="text-[11px] font-medium truncate text-slate-300">
            {data.subject}
          </p>

          {/* Snippet */}
          {data.snippet && (
            <p className="text-[10px] truncate font-sans text-slate-400">
              {data.snippet}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
