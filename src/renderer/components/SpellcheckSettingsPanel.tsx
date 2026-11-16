import React, { useEffect, useState } from 'react';
import { BookOpen, Check, Globe, Plus, SpellCheck2 } from 'lucide-react';
import { SpellcheckSettings } from '../types/settings';

interface SpellcheckSettingsPanelProps {
  spellcheck?: SpellcheckSettings;
  onChangeSpellcheck: (next: SpellcheckSettings) => void;
}

const DEFAULT_SPELLCHECK: SpellcheckSettings = {
  enabled: true,
  checkEmailCompose: true,
  checkQuickRepliesAndSignatures: true,
  languages: ['pt-BR', 'en-US'],
};

const LANGUAGE_LABELS: Record<string, string> = {
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  'en-US': 'Inglês (EUA)',
  'en-GB': 'Inglês (Reino Unido)',
  'es': 'Espanhol',
  'es-ES': 'Espanhol (Espanha)',
  'es-419': 'Espanhol (América Latina)',
  'fr': 'Francês',
  'de': 'Alemão',
  'it': 'Italiano',
};

const PREFERRED_ORDER = ['pt-BR', 'en-US', 'es', 'es-ES', 'es-419', 'pt-PT', 'en-GB', 'fr', 'de', 'it'];

export const SpellcheckSettingsPanel: React.FC<SpellcheckSettingsPanelProps> = ({
  spellcheck,
  onChangeSpellcheck,
}) => {
  const current: SpellcheckSettings = {
    ...DEFAULT_SPELLCHECK,
    ...spellcheck,
    languages:
      spellcheck?.languages && spellcheck.languages.length > 0
        ? spellcheck.languages
        : DEFAULT_SPELLCHECK.languages,
  };

  const [availableLanguages, setAvailableLanguages] = useState<string[]>([
    'pt-BR',
    'en-US',
    'es',
    'fr',
    'de',
    'it',
  ]);
  const [customWord, setCustomWord] = useState('');
  const [wordFeedback, setWordFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    window.electronAPI?.getSpellcheckLanguages?.().then((info) => {
      if (!active || !info?.available?.length) return;
      const sorted = [...info.available].sort((a, b) => {
        const ia = PREFERRED_ORDER.indexOf(a);
        const ib = PREFERRED_ORDER.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b);
      });
      setAvailableLanguages(sorted);
    });
    return () => {
      active = false;
    };
  }, []);

  const toggleLanguage = (lang: string) => {
    const exists = current.languages.includes(lang);
    const nextLangs = exists
      ? current.languages.filter((l) => l !== lang)
      : [...current.languages, lang];
    if (nextLangs.length === 0) return; // mantém pelo menos 1 idioma ativo
    onChangeSpellcheck({ ...current, languages: nextLangs });
  };

  const handleAddWord = async () => {
    const clean = customWord.trim();
    if (!clean) return;
    const res = await window.electronAPI?.addWordToDictionary?.(clean);
    if (res?.success !== false) {
      setCustomWord('');
      setWordFeedback(`"${clean}" adicionada ao dicionário pessoal.`);
      setTimeout(() => setWordFeedback(null), 3000);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
          <SpellCheck2 className="w-4 h-4 text-brand-400" />
          <span>Corretor Ortográfico</span>
        </h3>
        <p className="text-xs text-slate-400">
          Sublinhe erros de digitação em tempo real e clique com o botão direito sobre a palavra para ver sugestões ou adicioná-la ao dicionário.
        </p>
      </div>

      {/* Card Principal */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <div className="text-xs font-semibold text-white">
              Ativar verificação ortográfica em tempo real
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Utiliza os dicionários locais integrados ao motor do aplicativo (funciona offline).
            </div>
          </div>
          <input
            type="checkbox"
            checked={current.enabled}
            onChange={(e) =>
              onChangeSpellcheck({ ...current, enabled: e.target.checked })
            }
            className="w-4 h-4 accent-brand-500 rounded cursor-pointer"
          />
        </label>
      </div>

      {/* Escopo de Verificação */}
      <div
        className={`p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 transition-opacity ${
          current.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'
        }`}
      >
        <div className="text-xs font-bold text-slate-200">
          Áreas de Verificação
        </div>

        <label className="flex items-center justify-between cursor-pointer pt-1">
          <div>
            <div className="text-xs font-medium text-slate-200">
              Redação de e-mails (Assunto e Corpo)
            </div>
            <div className="text-[11px] text-slate-400">
              Verifica automaticamente ao redigir, responder ou encaminhar mensagens.
            </div>
          </div>
          <input
            type="checkbox"
            checked={current.checkEmailCompose}
            onChange={(e) =>
              onChangeSpellcheck({ ...current, checkEmailCompose: e.target.checked })
            }
            className="w-4 h-4 accent-brand-500 rounded cursor-pointer"
          />
        </label>

        <div className="border-t border-slate-800/80 pt-3">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="text-xs font-medium text-slate-200">
                Assinaturas e Respostas Rápidas
              </div>
              <div className="text-[11px] text-slate-400">
                Mantém a verificação ativa ao editar modelos e assinaturas corporativas.
              </div>
            </div>
            <input
              type="checkbox"
              checked={current.checkQuickRepliesAndSignatures}
              onChange={(e) =>
                onChangeSpellcheck({
                  ...current,
                  checkQuickRepliesAndSignatures: e.target.checked,
                })
              }
              className="w-4 h-4 accent-brand-500 rounded cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* Idiomas do Dicionário */}
      <div
        className={`p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 transition-opacity ${
          current.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-brand-400" />
            <span className="text-xs font-bold text-slate-200">
              Idiomas Ativos ({current.languages.length})
            </span>
          </div>
          <span className="text-[10px] text-slate-400">
            Selecione um ou mais idiomas simultâneos
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto custom-scroll pr-1">
          {availableLanguages.slice(0, 18).map((lang) => {
            const isActive = current.languages.includes(lang);
            const label = LANGUAGE_LABELS[lang] || lang;
            return (
              <button
                key={lang}
                type="button"
                onClick={() => toggleLanguage(lang)}
                className={`flex items-center justify-between px-2.5 py-2 rounded-lg border text-[11px] font-medium transition-all ${
                  isActive
                    ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                    : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <span className="truncate">{label}</span>
                {isActive && <Check className="w-3.5 h-3.5 shrink-0 ml-1.5 text-brand-400" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dicionário Pessoal */}
      <div
        className={`p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5 transition-opacity ${
          current.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'
        }`}
      >
        <div className="flex items-center space-x-2">
          <BookOpen className="w-4 h-4 text-brand-400" />
          <span className="text-xs font-bold text-slate-200">
            Dicionário Pessoal
          </span>
        </div>
        <p className="text-[11px] text-slate-400">
          Adicione siglas, nomes próprios ou termos técnicos para que não sejam marcados como erro.
        </p>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={customWord}
            onChange={(e) => setCustomWord(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAddWord();
              }
            }}
            placeholder="Ex.: Anectta, NFe, CNPJ..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={() => void handleAddWord()}
            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar</span>
          </button>
        </div>
        {wordFeedback && (
          <p className="text-[11px] text-emerald-400 font-medium">{wordFeedback}</p>
        )}
      </div>
    </div>
  );
};
