import React, { useEffect, useState } from 'react';
import { Check, Volume2, VolumeX } from 'lucide-react';
import {
  AVAILABLE_SKINS,
  SkinDefinition,
  themeService,
} from '../services/themeService';
import { soundService } from '../services/soundService';

type CategoryFilter = 'all' | 'dark' | 'light' | 'special';

export const SkinGalleryPanel: React.FC = () => {
  const [activeSkin, setActiveSkin] = useState<SkinDefinition>(() =>
    themeService.getActiveSkin()
  );
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    soundService.isEnabled()
  );
  const [volume, setVolume] = useState<number>(() => soundService.getVolume());

  useEffect(() => {
    const handleSkinChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ skin: SkinDefinition }>;
      if (customEvent.detail?.skin) {
        setActiveSkin(customEvent.detail.skin);
      }
    };
    window.addEventListener('anectta:skin-change', handleSkinChange);
    return () => {
      window.removeEventListener('anectta:skin-change', handleSkinChange);
    };
  }, []);

  const handleSelectSkin = (skin: SkinDefinition) => {
    themeService.setSkin(skin.id, true);
    setActiveSkin(skin);
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundService.setEnabled(next);
    if (next) soundService.play('pop');
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    soundService.setVolume(newVol);
    soundService.play('click');
  };

  const filteredSkins = AVAILABLE_SKINS.filter((s) =>
    filter === 'all' ? true : s.category === filter
  );

  return (
    <div className="space-y-4">
      {/* Audio Synthesizer Controls */}
      <div className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleToggleSound}
            className={`p-2 rounded-xl border transition-all ${
              soundEnabled
                ? 'border-brand-500/40 bg-brand-500/10 text-brand-400 shadow-sm'
                : 'border-slate-800 bg-slate-950/60 text-slate-500'
            }`}
            title={soundEnabled ? 'Silenciar efeitos' : 'Ativar efeitos sonoros'}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
              <span>Efeitos Sonoros da Skin</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 font-mono">
                Web Audio
              </span>
            </h4>
            <p className="text-[11px] text-slate-400">
              Cliques, envios e alertas sincronizados com o tema ativo
            </p>
          </div>
        </div>

        {soundEnabled && (
          <div className="flex items-center space-x-2">
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-24 accent-brand-500 cursor-pointer"
            />
            <button
              type="button"
              onClick={() => soundService.play('receive')}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-semibold"
            >
              Ouvir
            </button>
          </div>
        )}
      </div>

      {/* Category Filter */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-slate-300">
          Escolha uma Skin ({filteredSkins.length})
        </span>
        <div className="flex items-center space-x-1 bg-slate-900/60 p-1 rounded-lg border border-slate-800">
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: 'dark', label: 'Escuros' },
              { id: 'light', label: 'Claros' },
              { id: 'special', label: 'Especiais' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                filter === tab.id
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Visual Skin Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {filteredSkins.map((skin) => {
          const isSelected = skin.id === activeSkin.id;
          const v = skin.variables;
          const accent = v['--accent-primary'];
          const bgApp = v['--bg-app'];
          const bgSidebar = v['--bg-sidebar'];
          const bgSurface = v['--bg-surface'];
          const selBg = v['--selection-bg'] || v['--badge-bg'];
          const selBorder = v['--selection-border'] || accent;
          const textPrimary = v['--text-primary'];
          const textMuted = v['--text-muted'];
          const borderSubtle = v['--border-subtle'];

          return (
            <button
              key={skin.id}
              type="button"
              onClick={() => handleSelectSkin(skin)}
              className={`group relative rounded-xl p-3 border text-left transition-all flex flex-col items-center ${
                isSelected
                  ? 'border-brand-500 ring-2 ring-brand-500/40 shadow-lg'
                  : 'border-slate-800 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/80'
              }`}
              style={
                isSelected
                  ? { backgroundColor: 'rgba(37, 99, 235, 0.08)' }
                  : undefined
              }
              title={skin.subtitle}
            >
              {isSelected && (
                <span
                  className="absolute top-2.5 right-2.5 z-10 w-5 h-5 rounded-full flex items-center justify-center text-white shadow-md"
                  style={{ backgroundColor: accent }}
                >
                  <Check className="w-3 h-3" />
                </span>
              )}

              {/* Miniatura Retangular da Interface (3 colunas: Pastas + Lista + Leitura) */}
              <div
                className="w-full h-24 rounded-lg overflow-hidden shadow-md flex border"
                style={{
                  backgroundColor: bgApp,
                  borderColor: isSelected ? accent : borderSubtle,
                }}
              >
                {/* Coluna 1: Barra Lateral de Pastas */}
                <div
                  className="w-1/4 p-1.5 flex flex-col justify-between border-r"
                  style={{
                    backgroundColor: bgSidebar,
                    borderColor: borderSubtle,
                  }}
                >
                  <div className="space-y-1.5">
                    {/* Avatar + Conta */}
                    <div className="flex items-center space-x-1">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: accent }}
                      />
                      <span
                        className="h-1 flex-1 rounded-full opacity-80"
                        style={{ backgroundColor: textPrimary }}
                      />
                    </div>
                    {/* Item ativo (Entrada) */}
                    <div
                      className="px-1 py-0.5 rounded flex items-center space-x-1"
                      style={{ backgroundColor: selBg }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-sm shrink-0"
                        style={{ backgroundColor: accent }}
                      />
                      <span
                        className="text-[5px] font-bold truncate leading-none"
                        style={{
                          color: skin.category === 'light' ? accent : textPrimary,
                        }}
                      >
                        Entrada
                      </span>
                    </div>
                    {/* Outras pastas */}
                    {[0.7, 0.55, 0.65].map((w, idx) => (
                      <div key={idx} className="px-1 flex items-center space-x-1 opacity-55">
                        <span
                          className="w-1 h-1 rounded-full shrink-0"
                          style={{ backgroundColor: textMuted }}
                        />
                        <span
                          className="h-1 rounded-full"
                          style={{
                            width: `${w * 100}%`,
                            backgroundColor: textMuted,
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Coluna 2 + 3: Topo + Subpastas / Lista de Mensagens */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Barra Superior (Botões em Português) */}
                  <div
                    className="h-5 px-1.5 flex items-center space-x-1 border-b shrink-0"
                    style={{
                      backgroundColor: bgSurface,
                      borderColor: borderSubtle,
                    }}
                  >
                    <span
                      className="px-1.5 py-0.5 rounded text-[5px] font-bold leading-none"
                      style={{
                        backgroundColor: accent,
                        color: v['--primary-btn-text'] || '#ffffff',
                      }}
                    >
                      + Novo
                    </span>
                    <span
                      className="px-1 py-0.5 rounded text-[5px] leading-none border"
                      style={{
                        backgroundColor: v['--secondary-btn-bg'] || bgSidebar,
                        borderColor: borderSubtle,
                        color: textPrimary,
                      }}
                    >
                      Sincronizar
                    </span>
                  </div>

                  {/* Corpo: Coluna intermediária + Lista com avatares */}
                  <div className="flex-1 flex overflow-hidden">
                    <div
                      className="w-1/3 p-1.5 space-y-1 border-r"
                      style={{
                        backgroundColor: bgSurface,
                        borderColor: borderSubtle,
                      }}
                    >
                      <div
                        className="h-1 w-2/3 rounded-full opacity-50"
                        style={{ backgroundColor: textMuted }}
                      />
                      <div
                        className="px-1 py-1 rounded border-l-2"
                        style={{
                          backgroundColor: selBg,
                          borderColor: selBorder,
                        }}
                      >
                        <div
                          className="h-1 w-4/5 rounded-full"
                          style={{ backgroundColor: textPrimary }}
                        />
                      </div>
                      <div
                        className="h-1 w-3/4 rounded-full opacity-40"
                        style={{ backgroundColor: textMuted }}
                      />
                    </div>

                    {/* Lista de E-mails com Avatares */}
                    <div className="flex-1 p-1.5 space-y-1 flex flex-col justify-center">
                      {[
                        '#38bdf8',
                        '#818cf8',
                        '#fbbf24',
                        '#34d399',
                      ].map((avatarColor, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between space-x-1"
                        >
                          <div className="flex items-center space-x-1 min-w-0 flex-1">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: avatarColor }}
                            />
                            <div className="space-y-0.5 flex-1">
                              <div
                                className="h-1 w-3/4 rounded-full"
                                style={{
                                  backgroundColor:
                                    idx === 0 ? textPrimary : textMuted,
                                  opacity: idx === 0 ? 0.9 : 0.55,
                                }}
                              />
                              <div
                                className="h-0.5 w-1/2 rounded-full opacity-40"
                                style={{ backgroundColor: textMuted }}
                              />
                            </div>
                          </div>
                          <span
                            className="h-1 w-2.5 rounded-full opacity-40 shrink-0"
                            style={{ backgroundColor: textMuted }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Name & Category */}
              <div className="mt-2.5 text-center w-full">
                <div className="text-xs font-bold text-white truncate">
                  {skin.name}
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                  {skin.category === 'light'
                    ? 'Tema Claro'
                    : skin.category === 'special'
                    ? 'Especial'
                    : 'Tema Escuro'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
