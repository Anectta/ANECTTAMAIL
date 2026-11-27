import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ListChecks, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { normalizeSenderEntry } from '../utils/mailHygiene';

type Tone = 'rose' | 'emerald';

const TONE: Record<Tone, { border: string; text: string; ring: string }> = {
  rose: { border: 'border-rose-500/25', text: 'text-rose-300', ring: 'focus:border-rose-500' },
  emerald: { border: 'border-emerald-500/25', text: 'text-emerald-300', ring: 'focus:border-emerald-500' },
};

/** Resumo da lista no cartão: quantidade + botão para abrir a janela de gerenciamento. */
export const SenderListSummary: React.FC<{
  count: number;
  emptyText: string;
  label: string;
  tone: Tone;
  onOpen: () => void;
}> = ({ count, emptyText, label, tone, onOpen }) =>
  count === 0 ? (
    <div className="text-[11px] text-slate-500 italic">{emptyText}</div>
  ) : (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-900/90 border ${TONE[tone].border} text-xs text-slate-200 hover:bg-slate-800/80 transition-colors`}
    >
      <span className="flex items-center gap-2">
        <ListChecks className={`w-4 h-4 ${TONE[tone].text}`} />
        <span>
          {label}: <strong>{count}</strong> {count === 1 ? 'cadastro' : 'cadastros'}
        </span>
      </span>
      <span className={`font-semibold ${TONE[tone].text}`}>Abrir lista</span>
    </button>
  );

/**
 * Janela de gerenciamento de uma lista de remetentes (endereços ou @domínios):
 * buscar, adicionar, editar, excluir e remover todos (com confirmação).
 */
export const SenderListManager: React.FC<{
  open: boolean;
  title: string;
  description: string;
  entries: string[];
  tone: Tone;
  addLabel: string;
  placeholder: string;
  onChange: (next: string[]) => void;
  onClose: () => void;
}> = ({ open, title, description, entries, tone, addLabel, placeholder, onChange, onClose }) => {
  const [query, setQuery] = useState('');
  const [newEntry, setNewEntry] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setNewEntry('');
    setEditing(null);
    setMessage(null);
    setConfirmClear(false);
    window.setTimeout(() => searchRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...entries].sort((a, b) => a.localeCompare(b));
    return q ? list.filter((e) => e.includes(q)) : list;
  }, [entries, query]);

  if (!open) return null;
  const t = TONE[tone];

  const flash = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 2500);
  };

  const add = () => {
    const clean = normalizeSenderEntry(newEntry);
    if (!clean) return;
    if (entries.includes(clean)) {
      flash(`${clean} já está na lista.`);
      return;
    }
    onChange([...entries, clean]);
    setNewEntry('');
    flash(`${clean} adicionado.`);
  };

  const saveEdit = () => {
    if (!editing) return;
    const clean = normalizeSenderEntry(editValue);
    if (!clean) return;
    if (clean !== editing && entries.includes(clean)) {
      flash(`${clean} já está na lista.`);
      return;
    }
    onChange(entries.map((e) => (e === editing ? clean : e)));
    setEditing(null);
  };

  const remove = (entry: string) => {
    onChange(entries.filter((e) => e !== entry));
    flash(`${entry} removido.`);
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(2, 6, 23, 0.6)' }}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[80vh] flex flex-col rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
      >
        <div className="px-5 pt-4 pb-3 border-b border-slate-800 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">
              {title} ({entries.length})
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 space-y-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newEntry}
              onChange={(e) => setNewEntry(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
              placeholder={placeholder}
              className={`flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none ${t.ring}`}
            />
            <button
              type="button"
              onClick={add}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{addLabel}</span>
            </button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar na lista..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>
          {message && <div className={`text-[11px] ${t.text}`}>{message}</div>}
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll px-5 py-3 space-y-1.5">
          {filtered.length === 0 ? (
            <div className="text-[11px] text-slate-500 italic py-4 text-center">
              {entries.length === 0 ? 'A lista está vazia.' : 'Nenhum item encontrado na busca.'}
            </div>
          ) : (
            filtered.map((entry) => (
              <div
                key={entry}
                className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border ${t.border} text-xs text-slate-300`}
              >
                {editing === entry ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit();
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setEditing(null);
                      }
                    }}
                    className={`flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-0.5 font-mono text-[11px] text-slate-100 focus:outline-none ${t.ring}`}
                  />
                ) : (
                  <span className="truncate font-mono text-[11px]">{entry}</span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  {editing === entry ? (
                    <>
                      <button type="button" onClick={saveEdit} title="Salvar" className="p-1 text-emerald-400 hover:text-emerald-300">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => setEditing(null)} title="Cancelar" className="p-1 text-slate-500 hover:text-slate-300">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(entry);
                          setEditValue(entry);
                        }}
                        title="Editar"
                        className="p-1 text-slate-500 hover:text-sky-300 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(entry)}
                        title="Excluir"
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between gap-2">
          {entries.length > 0 ? (
            confirmClear ? (
              <div className="flex items-center gap-2 text-[11px] text-rose-300">
                <span>Remover todos os {entries.length}?</span>
                <button
                  type="button"
                  onClick={() => {
                    onChange([]);
                    setConfirmClear(false);
                  }}
                  className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-semibold"
                >
                  Sim, remover
                </button>
                <button type="button" onClick={() => setConfirmClear(false)} className="px-2 py-1 rounded-md border border-slate-700 text-slate-300">
                  Não
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors"
              >
                Remover todos
              </button>
            )
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
