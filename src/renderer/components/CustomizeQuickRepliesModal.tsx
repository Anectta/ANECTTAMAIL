import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, RotateCcw, Check, Sparkles } from 'lucide-react';
import { QuickRepliesService } from '../services/quickRepliesService';
import { soundService } from '../services/soundService';

interface CustomizeQuickRepliesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (replies: string[]) => void;
}

export const CustomizeQuickRepliesModal: React.FC<CustomizeQuickRepliesModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [replies, setReplies] = useState<string[]>([]);
  const [newReplyText, setNewReplyText] = useState('');
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReplies(QuickRepliesService.getReplies());
      setNewReplyText('');
      setFeedbackToast(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  const handleUpdateReply = (index: number, val: string) => {
    const updated = [...replies];
    updated[index] = val;
    setReplies(updated);
  };

  const handleRemoveReply = (index: number) => {
    soundService.play('pop');
    const updated = replies.filter((_, i) => i !== index);
    setReplies(updated);
  };

  const handleAddReply = () => {
    const clean = newReplyText.trim();
    if (!clean) return;
    soundService.play('pop');
    setReplies([...replies, clean]);
    setNewReplyText('');
  };

  const handleReset = () => {
    soundService.play('pop');
    const defaults = QuickRepliesService.resetToDefaults();
    setReplies(defaults);
    showToast('Respostas restauradas para o padrão de fábrica.');
  };

  const handleSave = () => {
    const filtered = replies.map((r) => r.trim()).filter((r) => r.length > 0);
    if (filtered.length === 0) {
      alert('Mantenha ao menos uma resposta rápida cadastrada.');
      return;
    }
    soundService.play('pop');
    QuickRepliesService.saveReplies(filtered);
    if (onSaved) onSaved(filtered);
    showToast('Respostas rápidas salvas com sucesso!');
    setTimeout(() => {
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in select-none">
      <div
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        style={{ background: 'var(--bg-surface, #0f172a)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Personalizar Respostas Rápidas
              </h3>
              <p className="text-[11px] text-slate-400">
                Edite os textos pré-definidos para preenchimento com 1 clique ao responder
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              soundService.play('pop');
              onClose();
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toast */}
        {feedbackToast && (
          <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-300 text-xs flex items-center space-x-2 animate-in fade-in">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{feedbackToast}</span>
          </div>
        )}

        {/* Body / List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll">
          <div className="space-y-2">
            {replies.map((reply, idx) => (
              <div
                key={idx}
                className="flex items-center space-x-2 p-2 rounded-xl bg-slate-950/70 border border-slate-800/80 focus-within:border-brand-500/60 transition-all group"
              >
                <span className="text-[11px] font-mono text-slate-500 w-5 text-center shrink-0">
                  {idx + 1}.
                </span>
                <input
                  type="text"
                  value={reply}
                  onChange={(e) => handleUpdateReply(idx, e.target.value)}
                  placeholder="Texto da resposta..."
                  className="flex-1 bg-transparent text-xs text-slate-200 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveReply(idx)}
                  className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-900 rounded transition-colors opacity-70 group-hover:opacity-100"
                  title="Remover esta resposta"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Adicionar nova */}
          <div className="pt-2 border-t border-slate-800/80">
            <label className="text-[11px] font-medium text-slate-400 mb-1.5 block">
              Adicionar nova opção de resposta:
            </label>
            <div className="flex items-center space-x-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={newReplyText}
                  onChange={(e) => setNewReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddReply();
                    }
                  }}
                  placeholder="Ex: Ciente! Proposta aprovada pela diretoria."
                  className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>
              <button
                type="button"
                onClick={handleAddReply}
                disabled={!newReplyText.trim()}
                className="px-3 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl text-xs font-medium flex items-center space-x-1 transition-all shadow-sm shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar Padrões</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white transition-all shadow-md shadow-brand-600/20 flex items-center space-x-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Salvar Respostas</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
