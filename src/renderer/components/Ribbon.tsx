import React, { useState } from 'react';
import {
  MailPlus,
  Trash2,
  Archive,
  Reply,
  ReplyAll,
  Forward,
  CheckCircle2,
  FolderInput,
  Tag,
  MailCheck,
  RotateCw,
  Clock,
  SendHorizontal,
  Palette,
  FileDown,
} from 'lucide-react';
import { EmailItem } from '@/types/email';
import { EmailReceiving } from './animated-icons';

interface RibbonProps {
  onCompose: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSnooze: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onToggleRead: () => void;
  onSyncAll: () => void;
  onSimulateArrival?: () => void;
  onOpenSettings: () => void;
  onOpenAccountManager?: () => void;
  onOpenSetupWizard?: () => void;
  onOpenSkins?: () => void;
  onExportEml?: () => void;
  onCreateFolder?: () => void;
  selectedEmail: EmailItem | null;
  isSyncing: boolean;
  toastMessage?: string | null;
}

export const Ribbon: React.FC<RibbonProps> = ({
  onCompose,
  onArchive,
  onDelete,
  onSnooze,
  onReply,
  onReplyAll,
  onForward,
  onToggleRead,
  onSyncAll,
  onOpenSettings,
  onOpenSkins,
  onExportEml,
  onCreateFolder,
  selectedEmail,
  isSyncing,
  toastMessage,
}) => {
  const [activeTab, setActiveTab] = useState<'home' | 'send_receive' | 'folder' | 'view'>('home');

  // Quick Steps triggers
  const handleQuickStepManager = () => {
    alert('Etapa Rápida: E-mail encaminhado diretamente para a Diretoria Executiva!');
  };

  const handleQuickStepTeam = () => {
    alert('Etapa Rápida: Mensagem compartilhada com o canal de Engenharia!');
  };

  const handleQuickStepDone = () => {
    onArchive();
  };

  const tabs = [
    { id: 'home' as const, label: 'Página Inicial' },
    { id: 'send_receive' as const, label: 'Enviar / Receber' },
    { id: 'folder' as const, label: 'Pasta & Regras' },
    { id: 'view' as const, label: 'Exibir' },
  ];

  return (
    <div className="ribbon-bar bg-slate-900/95 border-b border-slate-800 shrink-0 transition-all">
      {/* Top Ribbon Tab Navigation Bar */}
      <div className="flex items-center justify-between px-3 border-b border-slate-800/80 bg-slate-950/70 text-xs">
        <div className="flex items-center space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-white border-b-2 border-brand-500 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ribbon Action Deck */}
      <div className="h-24 px-3 py-2 flex items-center space-x-3 overflow-x-auto custom-scroll">
          {/* ============ TAB: PÁGINA INICIAL (Outlook Style) ============ */}
          {activeTab === 'home' && (
            <>
              {/* Grupo: Novo */}
              <div className="flex flex-col items-center justify-between h-full pr-3 border-r border-slate-800/80">
                <div className="flex items-center space-x-1">
                  <button
                    onClick={onCompose}
                    className="flex flex-col items-center justify-center px-3 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white shadow-md shadow-brand-600/30 transition-all group active:scale-95"
                    title="Novo E-mail (C)"
                  >
                    <MailPlus className="w-5 h-5 mb-0.5 group-hover:scale-110 transition-transform" />
                    <span className="text-[11px] font-semibold leading-tight">Novo</span>
                    <span className="text-[10px] leading-tight">E-mail</span>
                  </button>
                </div>
                <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                  Novo
                </span>
              </div>

              {/* Grupo: Excluir & Arquivar */}
              <div className="flex flex-col items-center justify-between h-full pr-3 border-r border-slate-800/80">
                <div className="flex items-center space-x-1">
                  <button
                    onClick={onDelete}
                    disabled={!selectedEmail}
                    className="flex flex-col items-center justify-center px-2 py-1 text-slate-300 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-40"
                    title="Excluir (Delete)"
                  >
                    <Trash2 className="w-4 h-4 mb-0.5 text-rose-400" />
                    <span className="text-[10px]">Excluir</span>
                  </button>
                  <button
                    onClick={onArchive}
                    disabled={!selectedEmail}
                    className="flex flex-col items-center justify-center px-2 py-1 text-slate-300 hover:text-brand-300 hover:bg-slate-800 rounded transition-colors disabled:opacity-40"
                    title="Arquivar (E)"
                  >
                    <Archive className="w-4 h-4 mb-0.5 text-teal-400" />
                    <span className="text-[10px]">Arquivar</span>
                  </button>
                </div>
                <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                  Excluir
                </span>
              </div>

              {/* Grupo: Responder */}
              <div className="flex flex-col items-center justify-between h-full pr-3 border-r border-slate-800/80">
                <div className="flex items-center space-x-1">
                  <button
                    onClick={onReply}
                    disabled={!selectedEmail}
                    className="flex flex-col items-center justify-center px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-40"
                    title="Responder"
                  >
                    <Reply className="w-4 h-4 mb-0.5 text-brand-400" />
                    <span className="text-[10px]">Responder</span>
                  </button>
                  <button
                    onClick={onReplyAll}
                    disabled={!selectedEmail}
                    className="flex flex-col items-center justify-center px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-40"
                    title="Responder a Todos"
                  >
                    <ReplyAll className="w-4 h-4 mb-0.5 text-sky-400" />
                    <span className="text-[10px]">A Todos</span>
                  </button>
                  <button
                    onClick={onForward}
                    disabled={!selectedEmail}
                    className="flex flex-col items-center justify-center px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-40"
                    title="Encaminhar"
                  >
                    <Forward className="w-4 h-4 mb-0.5 text-indigo-400" />
                    <span className="text-[10px]">Encaminhar</span>
                  </button>
                </div>
                <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                  Responder
                </span>
              </div>

              {/* Grupo: Etapas Rápidas (Quick Steps) */}
              <div className="flex flex-col items-center justify-between h-full pr-3 border-r border-slate-800/80">
                <div className="grid grid-cols-1 gap-1 text-[10px] w-28">
                  <button
                    onClick={handleQuickStepManager}
                    className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-slate-300 hover:bg-slate-800 hover:text-white truncate text-left"
                  >
                    <SendHorizontal className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span className="truncate">Para o Gerente</span>
                  </button>
                  <button
                    onClick={handleQuickStepTeam}
                    className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-slate-300 hover:bg-slate-800 hover:text-white truncate text-left"
                  >
                    <Tag className="w-3 h-3 text-indigo-400 shrink-0" />
                    <span className="truncate">Email de Equipe</span>
                  </button>
                  <button
                    onClick={handleQuickStepDone}
                    className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-slate-300 hover:bg-slate-800 hover:text-white truncate text-left"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="truncate">Concluído</span>
                  </button>
                </div>
                <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                  Etapas Rápidas
                </span>
              </div>

              {/* Grupo: Marcas / Snooze */}
              <div className="flex flex-col items-center justify-between h-full pr-3 border-r border-slate-800/80">
                <div className="flex items-center space-x-1">
                  <button
                    onClick={onToggleRead}
                    disabled={!selectedEmail}
                    className="flex flex-col items-center justify-center px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors disabled:opacity-40"
                    title="Alternar Lido / Não Lido"
                  >
                    <MailCheck className="w-4 h-4 mb-0.5 text-amber-400" />
                    <span className="text-[10px]">Lido/Não</span>
                  </button>
                  <button
                    onClick={onSnooze}
                    disabled={!selectedEmail}
                    className="flex flex-col items-center justify-center px-2 py-1 text-slate-300 hover:text-amber-300 hover:bg-slate-800 rounded transition-colors disabled:opacity-40"
                    title="Adiar / Snooze (S)"
                  >
                    <Clock className="w-4 h-4 mb-0.5 text-amber-400" />
                    <span className="text-[10px]">Adiar</span>
                  </button>
                </div>
                <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                  Marcas
                </span>
              </div>

              {/* Grupo: Enviar/Receber */}
              <div className="flex flex-col items-center justify-between h-full space-y-1">
                <div className="flex items-center space-x-1">
                  <button
                    onClick={onSyncAll}
                    disabled={isSyncing}
                    className="flex flex-col items-center justify-center px-3 py-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-all"
                    title="Enviar/Receber Todas as Pastas"
                  >
                    <RotateCw
                      className={`w-4 h-4 mb-0.5 ${isSyncing ? 'animate-spin' : ''}`}
                    />
                    <span className="text-[10px] font-semibold">Sincronizar</span>
                  </button>
                </div>
                <span className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                  Servidor
                </span>
              </div>
            </>
          )}

          {/* ============ TAB: ENVIAR / RECEBER ============ */}
          {activeTab === 'send_receive' && (
            <div className="flex items-center space-x-6 text-xs text-slate-300">
              <button
                onClick={onSyncAll}
                className="flex items-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium"
              >
                <RotateCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Enviar/Receber Todas as Pastas</span>
              </button>
            </div>
          )}

          {/* ============ TAB: PASTA ============ */}
          {activeTab === 'folder' && (
            <div className="flex items-center space-x-3 text-xs text-slate-300">
              <button
                onClick={() => onCreateFolder?.()}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg"
              >
                <FolderInput className="w-4 h-4 text-brand-400" />
                <span>Nova Pasta</span>
              </button>
              <button
                onClick={onArchive}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg"
              >
                <Archive className="w-4 h-4 text-amber-400" />
                <span>Limpar e Arquivar Pasta</span>
              </button>

              {onExportEml && selectedEmail && (
                <button
                  onClick={onExportEml}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-brand-600/30 hover:bg-brand-600/50 text-brand-300 rounded-lg border border-brand-500/30 transition-colors"
                  title="Exportar mensagem selecionada no formato aberto padrão RFC 822 (.EML)"
                >
                  <FileDown className="w-4 h-4 text-brand-400" />
                  <span>Exportar Mensagem (.EML)</span>
                </button>
              )}
            </div>
          )}

          {/* ============ TAB: EXIBIR ============ */}
          {activeTab === 'view' && (
            <div className="flex items-center space-x-3 text-xs text-slate-300">
              {onOpenSkins && (
                <button
                  onClick={onOpenSkins}
                  className="flex items-center space-x-2 px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold shadow-md shadow-brand-600/30 transition-all"
                >
                  <Palette className="w-4 h-4" />
                  <span>Skins, Temas & Sons</span>
                </button>
              )}
              <button
                onClick={onOpenSettings}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium transition-colors"
              >
                Alterar Painel de Leitura & Densidade
              </button>
            </div>
          )}

          {/* Corporate Toast Notification with Animated Receiving Indicator */}
          {(toastMessage || isSyncing) && (
            <div className="ml-auto shrink-0 bg-slate-900/95 border border-brand-500/50 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-3 animate-in fade-in slide-in-from-right-2 backdrop-blur-md">
              {isSyncing ? (
                <EmailReceiving size={24} />
              ) : (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              )}
              <span className="text-xs font-medium whitespace-nowrap">
                {isSyncing ? 'Sincronizando contas de e-mails...' : toastMessage}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };
