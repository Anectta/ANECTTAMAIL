import React from 'react';
import { Inbox, MailOpen, X } from 'lucide-react';
import { EmailItem } from '@/types/email';
import { soundService } from '../services/soundService';

interface EmailTabsBarProps {
  tabs: EmailItem[];
  activeTabId: string | null;
  onSelectTab: (emailId: string | null) => void;
  onCloseTab: (emailId: string) => void;
  onCloseAllTabs: () => void;
}

export const EmailTabsBar: React.FC<EmailTabsBarProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onCloseAllTabs,
}) => {
  if (tabs.length === 0) return null;

  return (
    <div className="email-tabs-bar h-9 px-2 bg-slate-950/90 border-b border-slate-800/90 flex items-center gap-1 overflow-x-auto custom-scroll shrink-0 select-none">
      {/* Aba fixa de retorno à seleção atual da lista */}
      <button
        type="button"
        onClick={() => {
          soundService.play('click');
          onSelectTab(null);
        }}
        title="Voltar à mensagem selecionada na lista"
        className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-t-lg text-[11px] font-medium whitespace-nowrap transition-colors shrink-0 border-b-2 ${
          activeTabId === null
            ? 'bg-slate-900 text-white border-brand-500'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border-transparent'
        }`}
      >
        <Inbox className="w-3.5 h-3.5 text-brand-400 shrink-0" />
        <span>Atual</span>
      </button>

      {/* Abas de e-mails abertos */}
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.id;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              soundService.play('click');
              onSelectTab(tab.id);
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                e.stopPropagation();
                soundService.play('click');
                onCloseTab(tab.id);
              }
            }}
            title={`${tab.subject || '(Sem assunto)'} — ${tab.sender || tab.senderEmail}\n(Clique do meio ou × para fechar)`}
            className={`group flex items-center space-x-1.5 pl-2.5 pr-1.5 py-1 rounded-t-lg text-[11px] font-medium cursor-pointer transition-colors shrink-0 max-w-[200px] border-b-2 ${
              isActive
                ? 'bg-slate-900 text-white border-brand-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border-transparent'
            }`}
          >
            <MailOpen
              className={`w-3 h-3 shrink-0 ${
                isActive ? 'text-brand-400' : 'text-slate-500'
              }`}
            />
            <span className="truncate">{tab.subject || '(Sem assunto)'}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                soundService.play('click');
                onCloseTab(tab.id);
              }}
              className="p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition-colors shrink-0"
              title="Fechar aba (Ctrl+W)"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {/* Fechar todas as abas */}
      {tabs.length >= 2 && (
        <button
          type="button"
          onClick={() => {
            soundService.play('click');
            onCloseAllTabs();
          }}
          className="ml-auto px-2 py-1 rounded text-[10px] font-medium text-slate-500 hover:text-rose-400 hover:bg-slate-900/70 whitespace-nowrap transition-colors shrink-0"
          title="Fechar todas as abas abertas"
        >
          Fechar todas
        </button>
      )}
    </div>
  );
};
