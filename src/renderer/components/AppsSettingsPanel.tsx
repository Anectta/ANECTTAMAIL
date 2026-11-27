import React, { useState } from 'react';
import {
  LayoutGrid,
  Plus,
  Calendar,
  Users,
  MessageCircle,
  Globe,
  Trash2,
  X,
  Check,
} from 'lucide-react';
import { AppsSettings, CustomWebApp } from '@/types/settings';
import { Cloud } from 'lucide-react';

interface AppsSettingsPanelProps {
  apps: AppsSettings;
  onChangeApps: (next: AppsSettings) => void;
}

export const AppsSettingsPanel: React.FC<AppsSettingsPanelProps> = ({
  apps,
  onChangeApps,
}) => {
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customColor, setCustomColor] = useState('#2563eb');

  const handleAddCustomApp = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = customName.trim();
    const rawUrl = customUrl.trim();
    if (!trimmedName || !rawUrl) return;
    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

    const newApp: CustomWebApp = {
      id: `app-${Date.now()}`,
      name: trimmedName,
      url: normalizedUrl,
      description: customDescription.trim() || 'Aplicativo web personalizado',
      enabled: true,
      color: customColor,
    };

    onChangeApps({
      ...apps,
      customApps: [...(apps.customApps || []), newApp],
    });
    setCustomName('');
    setCustomUrl('');
    setCustomDescription('');
    setIsAddingCustom(false);
  };

  const handleToggleCustomApp = (id: string) => {
    onChangeApps({
      ...apps,
      customApps: (apps.customApps || []).map((a) =>
        a.id === id ? { ...a, enabled: !a.enabled } : a
      ),
    });
  };

  const handleDeleteCustomApp = (id: string) => {
    onChangeApps({
      ...apps,
      customApps: (apps.customApps || []).filter((a) => a.id !== id),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
          <LayoutGrid className="w-4 h-4 text-brand-400" />
          <span>Aplicativos & Integrações</span>
        </h3>
        <p className="text-xs text-slate-400">
          Ative módulos integrados na barra lateral e adicione aplicativos web personalizados ao Anectta Mail.
        </p>
      </div>

      {/* Card 1: Aplicativos personalizados */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start space-x-2.5 max-w-md">
            <LayoutGrid className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-100">
                Aplicativos personalizados
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Adicione atalhos para serviços web da sua empresa ou ferramentas do dia a dia.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAddingCustom((prev) => !prev)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center space-x-1.5 transition-colors shrink-0"
          >
            {isAddingCustom ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{isAddingCustom ? 'Cancelar' : 'Adicionar aplicativo personalizado'}</span>
          </button>
        </div>

        {isAddingCustom && (
          <form
            onSubmit={handleAddCustomApp}
            className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Nome (ex: Notion, Trello, CRM)"
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
              <input
                type="text"
                required
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="URL (ex: https://app.notion.so)"
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="Descrição opcional"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              />
              <input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                title="Cor do ícone"
                className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer shrink-0"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1 shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Adicionar</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Card 2: Seus Aplicativos */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Seus Aplicativos
        </div>

        {/* Calendário */}
        <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-100">Calendário</div>
              <div className="text-[11px] text-slate-400 truncate">
                Gerencie compromissos, horários e arquivos .ics integrados.
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={apps.enableCalendarApp}
            onChange={(e) => onChangeApps({ ...apps, enableCalendarApp: e.target.checked })}
            className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
          />
        </label>

        {/* Contatos */}
        <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-100">Contatos</div>
              <div className="text-[11px] text-slate-400 truncate">
                Edite, organize e envie e-mails para seus contatos corporativos.
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={apps.enableContactsApp}
            onChange={(e) => onChangeApps({ ...apps, enableContactsApp: e.target.checked })}
            className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
          />
        </label>

        {/* WhatsApp Web */}
        <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-100">WhatsApp Web</div>
              <div className="text-[11px] text-slate-400 truncate">
                Mensagens rápidas em tempo real integradas à barra lateral.
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={apps.enableWhatsAppApp}
            onChange={(e) => onChangeApps({ ...apps, enableWhatsAppApp: e.target.checked })}
            className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
          />
        </label>

        {/* Dropbox (app web pronto) */}
        <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
              <Cloud className="w-4 h-4 text-sky-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-100">Dropbox</div>
              <div className="text-[11px] text-slate-400 truncate">
                Seus arquivos do Dropbox dentro do app, em uma área separada e segura.
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={apps.enableDropboxApp ?? false}
            onChange={(e) => onChangeApps({ ...apps, enableDropboxApp: e.target.checked })}
            className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700 shrink-0"
          />
        </label>

        {/* Aplicativos Personalizados Salvos */}
        {(apps.customApps || []).map((app) => (
          <div
            key={app.id}
            className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800/80"
          >
            <div className="flex items-center space-x-3 min-w-0">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white"
                style={{ backgroundColor: app.color || '#2563eb' }}
              >
                <Globe className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100 truncate">{app.name}</div>
                <div className="text-[11px] text-slate-400 truncate">
                  {app.description || app.url}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2.5 shrink-0">
              <button
                type="button"
                onClick={() => handleDeleteCustomApp(app.id)}
                title="Remover aplicativo"
                className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <input
                type="checkbox"
                checked={app.enabled}
                onChange={() => handleToggleCustomApp(app.id)}
                className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
