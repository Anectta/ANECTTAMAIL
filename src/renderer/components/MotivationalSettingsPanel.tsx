import React, { useEffect, useMemo, useState } from 'react';
import { Quote, Plus, Pencil, Trash2, Check, X, RotateCcw, Search, Eye } from 'lucide-react';
import {
  FONT_SIZE_OPTIONS,
  INTERVAL_OPTIONS,
  MAX_QUOTE_LENGTH,
  MotivationalPrefs,
  formatInterval,
  getPrefs,
  getQuotes,
  isCustomized,
  resetQuotes,
  savePrefs,
  saveQuotes,
  subscribe,
} from '../services/motivationalQuotesService';
import { AmorosoFace } from './NotifierMascot';

/**
 * Configurações → Mensagens Motivacionais.
 * As alterações valem na hora (não dependem do botão Salvar das Configurações).
 */
export const MotivationalSettingsPanel: React.FC = () => {
  const [quotes, setQuotes] = useState<string[]>(getQuotes);
  const [prefs, setPrefs] = useState<MotivationalPrefs>(getPrefs);
  const [customized, setCustomized] = useState(isCustomized);
  const [newQuote, setNewQuote] = useState('');
  const [filter, setFilter] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  // Mantém sincronizado se o usuário ocultar pelo X do cabeçalho com as Configurações abertas
  useEffect(
    () =>
      subscribe(() => {
        setQuotes(getQuotes());
        setPrefs(getPrefs());
        setCustomized(isCustomized());
      }),
    []
  );

  const flash = (msg: string) => {
    setStatus(msg);
    window.setTimeout(() => setStatus(null), 2500);
  };

  const updatePrefs = (patch: Partial<MotivationalPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
  };

  const commitQuotes = (next: string[], msg: string) => {
    setQuotes(next);
    saveQuotes(next);
    setCustomized(true);
    flash(msg);
  };

  const handleAdd = () => {
    const text = newQuote.trim();
    if (!text) return;
    if (quotes.some((q) => q.toLowerCase() === text.toLowerCase())) {
      flash('Essa mensagem já existe na lista.');
      return;
    }
    commitQuotes([text, ...quotes], '✓ Mensagem incluída.');
    setNewQuote('');
  };

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditingText(quotes[idx]);
  };

  const saveEdit = () => {
    if (editingIdx === null) return;
    const text = editingText.trim();
    if (!text) {
      flash('A mensagem não pode ficar vazia.');
      return;
    }
    const next = [...quotes];
    next[editingIdx] = text;
    setEditingIdx(null);
    commitQuotes(next, '✓ Mensagem alterada.');
  };

  const handleDelete = (idx: number) => {
    if (!window.confirm(`Excluir esta mensagem?\n\n"${quotes[idx]}"`)) return;
    if (editingIdx === idx) setEditingIdx(null);
    commitQuotes(
      quotes.filter((_, i) => i !== idx),
      '✓ Mensagem excluída.'
    );
  };

  const handleReset = () => {
    if (
      !window.confirm(
        'Restaurar a lista padrão de mensagens?\n\nAs mensagens que você incluiu, alterou ou excluiu serão descartadas.'
      )
    )
      return;
    resetQuotes();
    setQuotes(getQuotes());
    setCustomized(false);
    setEditingIdx(null);
    flash('✓ Lista padrão restaurada.');
  };

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return quotes
      .map((text, idx) => ({ text, idx }))
      .filter((q) => !f || q.text.toLowerCase().includes(f));
  }, [quotes, filter]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
          <Quote className="w-4 h-4 text-amber-400" />
          <span>Mensagens Motivacionais</span>
        </h3>
        <p className="text-xs text-slate-400">
          Frases exibidas no cabeçalho do app. Inclua as suas, altere ou exclua as existentes e escolha como elas
          aparecem. As alterações valem na hora.
        </p>
      </div>

      {/* Exibição */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-4">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div className="flex items-start space-x-2.5">
            <Eye className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-xs text-slate-100 block font-semibold">Exibir mensagens no cabeçalho</span>
              <span className="text-[11px] text-slate-400">
                Desmarque para não mostrar nenhuma mensagem. A sua lista continua guardada.
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={prefs.enabled}
            onChange={(e) => updatePrefs({ enabled: e.target.checked })}
            className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
          />
        </label>

        <div
          className={`pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-3 ${
            prefs.enabled ? '' : 'opacity-50 pointer-events-none'
          }`}
        >
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-200 block">Velocidade de troca</span>
            <select
              value={prefs.intervalSec}
              onChange={(e) => updatePrefs({ intervalSec: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              {INTERVAL_OPTIONS.map((sec) => (
                <option key={sec} value={sec}>
                  Nova mensagem a cada {formatInterval(sec)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-200 block">Ordem das mensagens</span>
            <select
              value={prefs.random ? 'random' : 'sequential'}
              onChange={(e) => updatePrefs({ random: e.target.value === 'random' })}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="sequential">Sequencial (na ordem da lista)</option>
              <option value="random">Aleatória</option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-200 block">Tamanho da frase</span>
            <div className="flex items-center gap-2">
              {FONT_SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updatePrefs({ fontSize: opt.value })}
                  className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                    prefs.fontSize === opt.value
                      ? 'bg-brand-600/20 text-brand-400 border-brand-500/40 font-semibold'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* Prévia do tamanho escolhido */}
            <div className="mt-2 inline-flex max-w-full items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10">
              {prefs.showAmoroso ? <AmorosoFace size={20} /> : <Quote className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              <span
                className={`${
                  prefs.fontSize === 'small' ? 'text-[11px]' : prefs.fontSize === 'large' ? 'text-sm' : 'text-xs'
                } font-medium text-slate-200 truncate`}
              >
                “{quotes[0] || 'Exemplo de mensagem motivacional'}”
              </span>
            </div>
          </div>
          <label className="sm:col-span-2 flex items-center justify-between gap-3 cursor-pointer">
            <div className="flex items-center space-x-2.5">
              <AmorosoFace size={26} />
              <div>
                <span className="text-xs text-slate-100 block font-semibold">Mostrar o Amoroso ao lado da frase</span>
                <span className="text-[11px] text-slate-400">
                  O robozinho do Anectta fica parado ao lado da mensagem e só pisca de vez em quando.
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.showAmoroso}
              onChange={(e) => updatePrefs({ showAmoroso: e.target.checked })}
              className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
            />
          </label>
          <p className="sm:col-span-2 text-[11px] text-slate-500">
            Dica: clique na mensagem do cabeçalho para ver a próxima.
          </p>
        </div>
      </div>

      {/* Incluir */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
        <span className="text-xs font-semibold text-slate-200 block">Incluir nova mensagem</span>
        <div className="flex items-start gap-2">
          <textarea
            value={newQuote}
            onChange={(e) => setNewQuote(e.target.value.slice(0, MAX_QUOTE_LENGTH))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAdd();
              }
            }}
            rows={2}
            placeholder="Digite a mensagem e pressione Enter ou clique em Incluir"
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 resize-none"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newQuote.trim()}
            className="px-3 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Incluir</span>
          </button>
        </div>
        <span className="text-[10px] text-slate-500">
          {newQuote.length}/{MAX_QUOTE_LENGTH} caracteres
        </span>
      </div>

      {/* Lista */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-200">
            Suas mensagens <span className="text-slate-500 font-normal">({quotes.length})</span>
          </span>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Procurar na lista..."
                className="w-48 bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brand-500"
              />
            </div>
            <button
              type="button"
              onClick={handleReset}
              disabled={!customized}
              title={customized ? 'Voltar para a lista padrão' : 'A lista já é a padrão'}
              className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-xs flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar padrão</span>
            </button>
          </div>
        </div>

        {quotes.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            Nenhuma mensagem na lista — o cabeçalho não exibe nada. Inclua uma mensagem ou restaure a lista padrão.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Nenhuma mensagem encontrada para “{filter}”.</p>
        ) : (
          <ul className="max-h-[360px] overflow-y-auto custom-scroll divide-y divide-slate-800/80 border border-slate-800/80 rounded-lg">
            {visible.map(({ text, idx }) => (
              <li key={`${idx}-${text}`} className="px-3 py-2 flex items-start gap-2 hover:bg-slate-900/50">
                {editingIdx === idx ? (
                  <>
                    <textarea
                      autoFocus
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value.slice(0, MAX_QUOTE_LENGTH))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          saveEdit();
                        } else if (e.key === 'Escape') {
                          setEditingIdx(null);
                        }
                      }}
                      rows={2}
                      className="flex-1 bg-slate-900 border border-brand-500 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none resize-none"
                    />
                    <button
                      type="button"
                      onClick={saveEdit}
                      title="Salvar"
                      className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/15"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingIdx(null)}
                      title="Cancelar"
                      className="p-1.5 rounded-md text-slate-400 hover:bg-slate-800"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-xs text-slate-300 leading-relaxed">“{text}”</span>
                    <button
                      type="button"
                      onClick={() => startEdit(idx)}
                      title="Alterar"
                      className="p-1.5 rounded-md text-slate-400 hover:text-brand-400 hover:bg-brand-500/15 shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(idx)}
                      title="Excluir"
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {status && <p className="text-[11px] text-emerald-400">{status}</p>}
      </div>
    </div>
  );
};
