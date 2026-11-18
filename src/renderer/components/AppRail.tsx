import React from 'react';
import {
  Mail,
  Calendar,
  Users,
  CheckSquare,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { UserAccount } from '@/types/email';
import logoImg from '../assets/logo.png';

export type ActiveModule = 'mail' | 'calendar' | 'contacts' | 'tasks' | 'webapp';

interface AppRailProps {
  activeModule: ActiveModule;
  onSelectModule: (module: ActiveModule) => void;
  onOpenSettings: () => void;
  onOpenAccounts?: () => void;
  activeAccount: UserAccount;
}

export const AppRail: React.FC<AppRailProps> = ({
  activeModule,
  onSelectModule,
  onOpenSettings,
  activeAccount,
}) => {
  const modules = [
    { id: 'mail' as ActiveModule, label: 'E-mail', icon: Mail },
    { id: 'calendar' as ActiveModule, label: 'Calendário', icon: Calendar },
    { id: 'contacts' as ActiveModule, label: 'Contatos', icon: Users },
    { id: 'tasks' as ActiveModule, label: 'Tarefas', icon: CheckSquare },
  ];

  return (
    <div className="app-rail w-13 bg-slate-950 border-r border-slate-800/90 flex flex-col items-center justify-between py-3 shrink-0 z-20">
      {/* Top Module Icons */}
      <div className="flex flex-col items-center space-y-2 w-full px-1.5">
        {/* Brand Hex / Logo Icon */}
        <div className="w-8 h-8 flex items-center justify-center mb-3 cursor-pointer group">
          <img
            src={logoImg}
            alt="Anectta MAIL"
            className="w-7 h-7 object-contain group-hover:scale-110 transition-transform drop-shadow"
          />
        </div>

        {/* Modules navigation */}
        {modules.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectModule(item.id)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative group ${
                isActive
                  ? 'bg-brand-600/20 text-brand-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title={item.label}
            >
              {/* Active left indicator pill like Outlook */}
              {isActive && (
                <span className="absolute -left-1.5 top-2 bottom-2 w-1 bg-brand-500 rounded-r-full" />
              )}
              <Icon className={`w-5 h-5 ${isActive ? 'text-brand-400' : 'text-slate-400 group-hover:text-slate-200'}`} />
              
              {/* Tooltip */}
              <div className="absolute left-14 px-2 py-1 bg-slate-900 text-slate-200 text-[11px] font-medium rounded-md shadow-lg border border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {item.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Icons: Settings & Account */}
      <div className="flex flex-col items-center space-y-3 w-full px-1.5">
        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-900 transition-colors relative group"
          title="Configurações Internas"
        >
          <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform" />
          <div className="absolute left-14 px-2 py-1 bg-slate-900 text-slate-200 text-[11px] font-medium rounded-md shadow-lg border border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
            Configurações Internas
          </div>
        </button>

        {/* User Avatar with status (display only - settings are in the gear icon) */}
        <div
          className="relative group"
          title={`${activeAccount.name} (${activeAccount.email})`}
        >
          {activeAccount.avatar ? (
            <img
              src={activeAccount.avatar}
              alt={activeAccount.name}
              className="w-8 h-8 rounded-lg object-cover ring-1 ring-slate-700 transition-all"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600 to-indigo-700 text-white font-bold text-xs flex items-center justify-center ring-1 ring-slate-700 transition-all">
              {(activeAccount.name || activeAccount.email || 'AN')
                .split(/[\s@._-]+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase())
                .join('')}
            </div>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-950" />
          
          <div className="absolute left-14 bottom-0 px-2.5 py-1.5 bg-slate-900 text-slate-200 text-xs rounded-lg shadow-xl border border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 flex items-center space-x-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <div>
              <div className="font-semibold">{activeAccount.name}</div>
              <div className="text-[10px] text-slate-400 font-mono">{activeAccount.email}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
