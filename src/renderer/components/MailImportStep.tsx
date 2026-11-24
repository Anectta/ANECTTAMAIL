import React, { useEffect, useRef, useState } from 'react';
import { Archive, CheckCircle2, FileArchive, FolderOpen, Loader2, Mail, AlertCircle, Inbox, Info } from 'lucide-react';
import type { AccountSettings } from '@/types/settings';
import type { MailImportProgress, MailImportResult } from '../../types/electron';
import { soundService } from '@/services/soundService';

type ImportMode = 'pst' | 'mbox' | 'folder' | 'eml';

interface MailImportStepProps {
  account: AccountSettings;
  /** Concluir: devolve o total importado (ou nada, se o usuário começou do zero). */
  onFinish: (result?: MailImportResult) => void;
  /** 'wizard' = etapa final do assistente de conta; 'panel' = Configurações → Backup. */
  variant?: 'wizard' | 'panel';
  /** Message-IDs que a conta já tem (não importar de novo). */
  getKnownMessageIds?: (accountId: string) => string[];
}

const OPTIONS: Array<{ mode: ImportMode; title: string; detail: string; icon: React.ReactNode }> = [
  {
    mode: 'pst',
    title: 'Arquivo do Outlook (.pst)',
    detail: 'Pastas, anexos e lido/não lido são mantidos.',
    icon: <FileArchive className="w-4 h-4 text-blue-600" />,
  },
  {
    mode: 'mbox',
    title: 'Arquivo .mbox',
    detail: 'Thunderbird, Apple Mail e outros programas.',
    icon: <Archive className="w-4 h-4 text-indigo-600" />,
  },
  {
    mode: 'folder',
    title: 'Pasta de e-mails',
    detail: 'Pasta de perfil do Thunderbird ou pasta com arquivos .mbox/.eml.',
    icon: <FolderOpen className="w-4 h-4 text-amber-600" />,
  },
  {
    mode: 'eml',
    title: 'Mensagens .eml',
    detail: 'Selecione um ou vários arquivos .eml.',
    icon: <Mail className="w-4 h-4 text-emerald-600" />,
  },
];

/** Soma resultados de várias importações (o usuário pode trazer mais de um arquivo). */
const mergeResults = (a: MailImportResult | null, b: MailImportResult): MailImportResult => {
  if (!a) return b;
  const folders = [...a.folders];
  for (const f of b.folders) if (!folders.some((x) => x.id === f.id)) folders.push(f);
  return {
    success: a.success || b.success,
    count: a.count + b.count,
    duplicates: a.duplicates + b.duplicates,
    failed: a.failed + b.failed,
    filesScanned: a.filesScanned + b.filesScanned,
    folders,
    emails: [...a.emails, ...b.emails],
    storedInDb: a.storedInDb && b.storedInDb,
    error: b.error || a.error,
  };
};

export const MailImportStep: React.FC<MailImportStepProps> = ({ account, onFinish, variant = 'wizard', getKnownMessageIds }) => {
  const isPop3 = (account.incomingServer?.protocol || 'imap').toLowerCase() === 'pop3';
  const [running, setRunning] = useState<ImportMode | null>(null);
  const [progress, setProgress] = useState<MailImportProgress | null>(null);
  const [total, setTotal] = useState<MailImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const totalRef = useRef<MailImportResult | null>(null);
  totalRef.current = total;

  useEffect(() => {
    const off = window.electronAPI?.onMailImportProgress?.((p) => setProgress(p));
    return () => off?.();
  }, []);

  const runImport = async (mode: ImportMode) => {
    if (running) return;
    if (!window.electronAPI?.importMailIntoAccount) {
      setError('A importação está disponível apenas no aplicativo para computador.');
      return;
    }
    soundService.play('click');
    setRunning(mode);
    setProgress(null);
    setError(null);
    try {
      // Mensagens já trazidas em importações anteriores desta etapa não entram de novo
      const knownMessageIds = [
        ...(getKnownMessageIds?.(account.id) || []),
        ...((totalRef.current?.emails || []).map((e: any) => e?.messageIdHeader).filter(Boolean) as string[]),
      ];
      const res = await window.electronAPI.importMailIntoAccount({
        accountId: account.id,
        accountEmail: account.email,
        mode,
        knownMessageIds,
      });
      if (res.canceled) return;
      if (!res.success && res.count === 0) {
        setError(res.error || 'Nenhum e-mail foi encontrado no arquivo escolhido.');
        soundService.play('error');
        return;
      }
      setTotal((prev) => mergeResults(prev, res));
      soundService.play('pop');
    } catch (err: any) {
      setError(err?.message || 'Erro durante a importação.');
      soundService.play('error');
    } finally {
      setRunning(null);
    }
  };

  const wizard = variant === 'wizard';
  // Visual claro (assistente) ou escuro/tema (Configurações)
  const t = wizard
    ? {
        card: 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40',
        title: 'text-slate-900',
        detail: 'text-slate-500',
        infoPop3: 'bg-amber-50 border-amber-200 text-amber-900',
        infoImap: 'bg-slate-50 border-slate-200 text-slate-700',
        progress: 'bg-blue-50 border-blue-200 text-blue-900',
        error: 'bg-rose-50 border-rose-200 text-rose-800',
        ok: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      }
    : {
        card: 'border-slate-800 bg-slate-950/80 hover:bg-slate-800/80 hover:border-sky-500/40',
        title: 'text-slate-100',
        detail: 'text-slate-400',
        infoPop3: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
        infoImap: 'bg-slate-950/60 border-slate-800 text-slate-300',
        progress: 'bg-sky-500/10 border-sky-500/30 text-sky-200',
        error: 'bg-rose-500/10 border-rose-500/30 text-rose-200',
        ok: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
      };

  return (
    <div className={wizard ? 'animate-in fade-in slide-in-from-right-4 duration-150' : ''}>
      {wizard && (
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold mb-2">
            <CheckCircle2 className="w-3.5 h-3.5" /> Conta {account.email} verificada
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Já tem e-mails desta conta em outro programa?
          </h1>
        </div>
      )}

      <div
        className={`mb-3 p-2.5 rounded-xl text-[11px] flex items-start gap-2 border ${
          isPop3 ? t.infoPop3 : t.infoImap
        }`}
      >
        <Info className={`w-4 h-4 shrink-0 mt-0.5 ${isPop3 ? 'text-amber-600' : 'text-slate-500'}`} />
        <span>
          {isPop3
            ? 'Contas POP3 normalmente apagam os e-mails do servidor depois de baixados: o histórico antigo costuma estar só no arquivo do programa anterior (Outlook, Thunderbird...). Traga-o agora para não perder nada. Mensagens que ainda estiverem no servidor não serão duplicadas.'
            : 'Nesta conta IMAP os e-mails ficam no servidor e aparecem sozinhos. Importe apenas se tiver pastas antigas guardadas no computador — o que já existir no servidor não será duplicado.'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.mode}
            type="button"
            disabled={Boolean(running)}
            onClick={() => void runImport(opt.mode)}
            className={`text-left p-2.5 rounded-xl border ${t.card} disabled:opacity-60 transition-all cursor-pointer`}
          >
            <div className="flex items-center gap-2">
              {running === opt.mode ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : opt.icon}
              <span className={`text-xs font-bold ${t.title}`}>{opt.title}</span>
            </div>
            <span className={`block text-[10.5px] ${t.detail} mt-0.5`}>{opt.detail}</span>
          </button>
        ))}
      </div>

      {running && (
        <div className={`mt-3 p-2.5 rounded-xl border text-[11px] flex items-center gap-2 ${t.progress}`}>
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>
            Importando{progress ? `: ${progress.imported} e-mail(s)` : '...'}
            {progress && progress.duplicates > 0 ? ` · ${progress.duplicates} repetido(s) ignorado(s)` : ''}
            {progress?.folder ? ` · pasta "${progress.folder}"` : progress?.file ? ` · ${progress.file}` : ''}
          </span>
        </div>
      )}

      {error && (
        <div className={`mt-3 p-2.5 rounded-xl border text-[11px] flex items-start gap-2 ${t.error}`}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {total && (
        <div className={`mt-3 p-2.5 rounded-xl border text-[11px] flex items-start gap-2 ${t.ok}`}>
          <Inbox className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
          <span>
            <strong>{total.count} e-mail(s) prontos</strong> para {account.email}
            {total.folders.length > 0 ? `, em ${total.folders.length} pasta(s) própria(s)` : ''}.
            {total.duplicates > 0 ? ` ${total.duplicates} repetido(s) ignorado(s).` : ''}
            {total.failed > 0 ? ` ${total.failed} item(ns) ilegível(eis) foram pulados.` : ''} Você pode importar outro
            arquivo ou concluir.
          </span>
        </div>
      )}

      <div className={`mt-4 flex items-center gap-2 ${!wizard && !total ? 'hidden' : ''}`}>
        <button
          type="button"
          disabled={Boolean(running)}
          onClick={() => {
            soundService.play('click');
            onFinish(total || undefined);
          }}
          className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-all disabled:opacity-60 cursor-pointer text-xs sm:text-sm"
        >
          {total ? (wizard ? 'Concluir' : 'Adicionar à conta') : 'Começar do zero'}
        </button>
      </div>
    </div>
  );
};
