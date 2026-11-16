import React, { useState } from 'react';
import {
  LifeBuoy,
  MessageSquarePlus,
  BookOpen,
  Headphones,
  FileArchive,
  CheckCircle2,
  X,
  Mail,
} from 'lucide-react';
import { AppSettings } from '@/types/settings';

interface SupportHelpPanelProps {
  settings: AppSettings;
  onComposeSupport?: (recipient: string, subject: string, body?: string) => void;
}

const KNOWLEDGE_TOPICS = [
  {
    title: 'Configuração de Contas (IMAP, POP3 e OAuth2)',
    content:
      'Acesse Configurações → Conta & Servidores ou o Assistente de Nova Conta para conectar Gmail, Outlook/Microsoft 365 (OAuth2) ou servidores IMAP/SMTP corporativos.',
  },
  {
    title: 'Atalhos de Produtividade',
    content:
      'Use C para escrever, / para pesquisar, J/K para navegar entre e-mails, Ctrl+K para a paleta de comandos e Ctrl+Shift+F para alternar o Layout mínimo.',
  },
  {
    title: 'Privacidade, Pixels e Bloqueio de Imagens',
    content:
      'Na aba Segurança & Privacidade você controla o bloqueio de pixels 1x1, bloqueio de imagens externas, avatares locais e lista de remetentes bloqueados.',
  },
  {
    title: 'Regras e Filtros Automáticos',
    content:
      'Crie automações por remetente, assunto, corpo, anexo, tamanho ou pasta para arquivar, copiar, marcar como importante, estrelar ou encaminhar mensagens.',
  },
];

export const SupportHelpPanel: React.FC<SupportHelpPanelProps> = ({
  settings,
  onComposeSupport,
}) => {
  const [isKnowledgeOpen, setIsKnowledgeOpen] = useState(false);
  const [diagnosticStatus, setDiagnosticStatus] = useState<string | null>(null);

  const handleExportDiagnostics = () => {
    const sanitizedAccounts = (settings.accounts || [settings.account]).map((acc) => ({
      id: acc.id,
      serverType: acc.serverType,
      authType: acc.authType || 'password',
      incomingProtocol: acc.incomingServer?.protocol,
      incomingHost: acc.incomingServer?.host,
      incomingPort: acc.incomingServer?.port,
      incomingSecurity: acc.incomingServer?.security,
      outgoingHost: acc.outgoingServer?.host,
      outgoingPort: acc.outgoingServer?.port,
      outgoingSecurity: acc.outgoingServer?.security,
    }));

    const payload = {
      app: 'Anectta Mail',
      generatedAt: new Date().toISOString(),
      environment: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
      },
      appearance: settings.appearance,
      security: {
        ...settings.security,
        blockedSendersCount: settings.security.blockedSenders?.length ?? 0,
        blockedSenders: undefined,
      },
      accountsCount: sanitizedAccounts.length,
      accounts: sanitizedAccounts,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const filename = `anectta-mail-diagnostico-${new Date().toISOString().slice(0, 10)}.json`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDiagnosticStatus(`Pacote salvo como ${filename}`);
    setTimeout(() => setDiagnosticStatus(null), 5000);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
          <LifeBuoy className="w-4 h-4 text-sky-400" />
          <span>Suporte, Ajuda & Diagnóstico</span>
        </h3>
        <p className="text-xs text-slate-400">
          Canais de atendimento, base de conhecimento e geração segura de registros do Anectta Mail.
        </p>
      </div>

      {/* Card 1: Feedback */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start space-x-3 max-w-md">
          <MessageSquarePlus className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-semibold text-slate-100">
              Envie suas sugestões sobre o Anectta Mail
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Compartilhe ideias de novos recursos ou melhorias para aprimorar sua rotina de e-mails.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            onComposeSupport?.(
              'suporte@anectta.com.br',
              '[Feedback] Anectta Mail',
              'Olá equipe Anectta Mail,\n\nGostaria de compartilhar a seguinte sugestão:\n'
            )
          }
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center space-x-1.5 transition-colors shrink-0"
        >
          <Mail className="w-3.5 h-3.5 text-brand-400" />
          <span>Enviar Feedback</span>
        </button>
      </div>

      {/* Card 2: Base de Conhecimento e Atendimento */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Central de Ajuda & Atendimento
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start space-x-3 max-w-md">
            <BookOpen className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-200">
                Base de Conhecimento Anectta
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Consulte guias rápidos de configuração, atalhos e recursos de privacidade.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsKnowledgeOpen((prev) => !prev)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors shrink-0"
          >
            {isKnowledgeOpen ? 'Fechar Guias' : 'Consultar Guias'}
          </button>
        </div>

        {isKnowledgeOpen && (
          <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5 relative">
            <button
              type="button"
              onClick={() => setIsKnowledgeOpen(false)}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {KNOWLEDGE_TOPICS.map((topic) => (
              <div key={topic.title} className="space-y-0.5 pr-5">
                <div className="text-xs font-semibold text-slate-100">{topic.title}</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{topic.content}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/70">
          <div className="flex items-start space-x-3 max-w-md">
            <Headphones className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-200">
                Atendimento Técnico
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Precisa de apoio em alguma configuração? Fale diretamente com o nosso suporte.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              onComposeSupport?.(
                'suporte@anectta.com.br',
                '[Suporte Técnico] Anectta Mail',
                `Olá equipe de suporte,\n\nDescreva seu problema abaixo:\n\n---\nPlataforma: ${navigator.platform}\n`
              )
            }
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors shrink-0"
          >
            Solicitar Suporte
          </button>
        </div>
      </div>

      {/* Card 3: Diagnóstico e Registros */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start space-x-3 max-w-md">
            <FileArchive className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-100">
                Pacote de Diagnóstico para Suporte
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Exporta um arquivo JSON com parâmetros técnicos e ajustes (sem senhas, tokens ou conteúdo de e-mails).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleExportDiagnostics}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors shrink-0"
          >
            Gerar Pacote de Diagnóstico
          </button>
        </div>

        {diagnosticStatus && (
          <div className="flex items-center space-x-2 text-xs text-emerald-400 pt-1">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{diagnosticStatus}</span>
          </div>
        )}
      </div>
    </div>
  );
};
