import React, { useState, useEffect } from 'react';
import { X, Mail } from 'lucide-react';
import { NotifierMascot } from './NotifierMascot';
import { soundService } from '../services/soundService';

interface NotifierData {
  id: string;
  sender: string;
  senderEmail?: string;
  avatar?: string;
  subject: string;
  snippet?: string;
  /** Quantos e-mails novos o aviso resume. */
  count?: number;
}

/**
 * Aviso de novo e-mail (janela própria, no canto inferior direito da tela).
 * O som é tocado pela janela principal (respeita o som escolhido e o modo Silencioso).
 */
export const NotificationPopupView: React.FC = () => {
  const [data, setData] = useState<NotifierData>({
    id: '',
    sender: '',
    subject: 'Você recebeu uma nova mensagem',
  });
  // Reinicia a animação de entrada a cada novo aviso
  const [shownAt, setShownAt] = useState(0);

  useEffect(() => {
    // Garante que o fundo do documento seja 100% transparente
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';

    if (window.electronAPI?.getLatestNotifierData) {
      window.electronAPI.getLatestNotifierData().then((latest) => {
        if (latest) {
          setData(latest as NotifierData);
          setShownAt(Date.now());
        }
      });
    }

    if (window.electronAPI?.onNotifierData) {
      const cleanup = window.electronAPI.onNotifierData((incoming) => {
        if (incoming) {
          setData(incoming as NotifierData);
          setShownAt(Date.now());
        }
      });
      return () => cleanup();
    }
  }, []);

  const handleClick = () => {
    soundService.play('click');
    window.electronAPI?.clickNotifier?.(data.id);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundService.play('pop');
    window.electronAPI?.closeNotifier?.();
  };

  const many = Boolean(data.count && data.count > 1);
  const title = many ? `${data.count} Novos E-mails!` : 'Novo E-mail Recebido!';

  return (
    <div className="w-screen h-screen p-2 flex items-center justify-center overflow-hidden bg-transparent font-sans">
      <style>{`
        @keyframes notifierIn { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: none; } }
        .notifier-card { animation: notifierIn .35s cubic-bezier(.2,.8,.2,1) both; }
      `}</style>
      <div
        key={shownAt}
        onClick={handleClick}
        className="notifier-card relative w-full h-full rounded-2xl pl-1.5 pr-3 flex items-center gap-2 cursor-pointer border select-none group"
        style={{
          background: 'linear-gradient(135deg, #0e1a36 0%, #13244a 55%, #0c1830 100%)',
          borderColor: 'rgba(96, 165, 250, 0.35)',
          boxShadow: '0 12px 28px rgba(2, 6, 23, 0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
        title="Clique para abrir no Anectta MAIL"
      >
        <div className="shrink-0 group-hover:scale-105 transition-transform">
          <NotifierMascot size={78} />
        </div>

        <div className="flex-1 min-w-0 pr-5">
          <div className="flex items-center gap-1.5">
            <Mail className="w-4 h-4 shrink-0" style={{ color: '#60a5fa' }} />
            <span className="text-[13px] font-bold truncate" style={{ color: '#ffffff' }}>
              {title}
            </span>
          </div>
          {data.sender ? (
            <>
              <p className="mt-0.5 text-[12px] font-semibold truncate" style={{ color: '#dbe7ff' }}>
                {data.sender}
              </p>
              <p className="text-[11px] truncate" style={{ color: '#9fb3d6' }}>
                {data.subject}
              </p>
              {many && data.snippet && (
                <p className="text-[10px] truncate" style={{ color: '#7f95bb' }}>
                  {data.snippet}
                </p>
              )}
            </>
          ) : (
            <p className="mt-0.5 text-[12px]" style={{ color: '#9fb3d6' }}>
              {data.subject}
            </p>
          )}
        </div>

        <button
          onClick={handleClose}
          className="absolute top-2 right-2 w-5 h-5 rounded-md flex items-center justify-center transition-colors hover:bg-white/10"
          style={{ color: '#94a3b8' }}
          title="Fechar"
          aria-label="Fechar aviso"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
