import React, { useMemo, useRef, useState } from 'react';
import {
  Users,
  Mail,
  Phone,
  Search,
  UserPlus,
  Edit3,
  Trash2,
  Send,
  X,
  Building2,
  Briefcase,
  Check,
  Upload,
  Download,
  Tag,
  RefreshCw,
} from 'lucide-react';
import { SenderAvatar } from './SenderAvatar';
import {
  exportContactsToCsv,
  exportContactsToVCard,
  parseCsvContacts,
  parseVCardContacts,
} from '../utils/contactsIoUtils';

export interface CorporateContact {
  id: string;
  name: string;
  email: string;
  role?: string;
  company?: string;
  phone?: string;
  avatar?: string;
  groups?: string[];
}

// Nenhum contato pré-cadastrado: novas instalações e novos usuários iniciam com a lista vazia.
export const DEFAULT_CORPORATE_CONTACTS: CorporateContact[] = [];

interface ContactsViewProps {
  contacts?: CorporateContact[];
  onAddContact?: (contact: Omit<CorporateContact, 'id'>) => void;
  onImportContacts?: (contacts: Array<Omit<CorporateContact, 'id'>>) => number;
  onUpdateContact?: (contact: CorporateContact) => void;
  onDeleteContact?: (id: string) => void;
  onComposeToContact?: (email: string) => void;
  onComposeToGroup?: (emails: string[], groupName: string) => void;
  onSyncCloudContacts?: () => Promise<string>;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  contacts: controlledContacts,
  onAddContact,
  onImportContacts,
  onUpdateContact,
  onDeleteContact,
  onComposeToContact,
  onComposeToGroup,
  onSyncCloudContacts,
}) => {
  const [internalContacts, setInternalContacts] = useState<CorporateContact[]>(DEFAULT_CORPORATE_CONTACTS);
  const contacts = controlledContacts ?? internalContacts;

  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [ioNotice, setIoNotice] = useState<string | null>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formGroups, setFormGroups] = useState('');
  const [formError, setFormError] = useState('');

  const allGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of contacts) {
      for (const g of c.groups || []) {
        const clean = g.trim();
        if (!clean) continue;
        counts.set(clean, (counts.get(clean) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [contacts]);

  const showNotice = (msg: string) => {
    setIoNotice(msg);
    window.setTimeout(() => {
      setIoNotice((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const triggerDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const lowerName = file.name.toLowerCase();
      const parsed =
        lowerName.endsWith('.vcf') || /BEGIN:VCARD/i.test(text)
          ? parseVCardContacts(text)
          : parseCsvContacts(text);

      if (parsed.length === 0) {
        showNotice('Nenhum contato válido com e-mail foi encontrado no arquivo selecionado.');
        return;
      }

      if (onImportContacts) {
        const added = onImportContacts(parsed);
        showNotice(
          added > 0
            ? `✓ ${added} contato(s) importado(s) com sucesso (${parsed.length - added} duplicado(s) ignorado(s)).`
            : 'Todos os contatos do arquivo já estão cadastrados.'
        );
      } else {
        setInternalContacts((prev) => {
          const existing = new Set(prev.map((c) => c.email.trim().toLowerCase()));
          const unique = parsed
            .filter((p) => !existing.has(p.email.trim().toLowerCase()))
            .map((p, idx) => ({ ...p, id: `contact-imp-${Date.now()}-${idx}` }));
          return [...unique, ...prev];
        });
        showNotice(`✓ ${parsed.length} contato(s) processado(s).`);
      }
    } catch {
      showNotice('Erro ao ler o arquivo de contatos. Verifique se é um CSV ou vCard (.vcf) válido.');
    }
  };

  const handleExportCsv = () => {
    const target = selectedGroup === 'all' ? contacts : filteredContacts;
    if (target.length === 0) {
      showNotice('Não há contatos para exportar.');
      return;
    }
    const csv = exportContactsToCsv(target);
    triggerDownload(csv, `anectta-contatos-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
    showNotice(`✓ ${target.length} contato(s) exportado(s) em CSV.`);
  };

  const handleExportVCard = () => {
    const target = selectedGroup === 'all' ? contacts : filteredContacts;
    if (target.length === 0) {
      showNotice('Não há contatos para exportar.');
      return;
    }
    const vcf = exportContactsToVCard(target);
    triggerDownload(vcf, `anectta-contatos-${new Date().toISOString().slice(0, 10)}.vcf`, 'text/vcard;charset=utf-8');
    showNotice(`✓ ${target.length} contato(s) exportado(s) em vCard (.vcf).`);
  };

  const openNewContactModal = () => {
    setEditingId(null);
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormCompany('');
    setFormRole('');
    setFormGroups(selectedGroup !== 'all' ? selectedGroup : '');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditContactModal = (c: CorporateContact) => {
    setEditingId(c.id);
    setFormName(c.name || '');
    setFormEmail(c.email || '');
    setFormPhone(c.phone || '');
    setFormCompany(c.company || '');
    setFormRole(c.role || '');
    setFormGroups((c.groups || []).join(', '));
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = formEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError('Informe um endereço de e-mail válido.');
      return;
    }
    const cleanName = formName.trim() || cleanEmail.split('@')[0];
    const parsedGroups = formGroups
      .split(/[,;]+/)
      .map((g) => g.trim())
      .filter(Boolean);
    const uniqueGroups = Array.from(new Set(parsedGroups));

    const payload: Omit<CorporateContact, 'id'> = {
      name: cleanName,
      email: cleanEmail,
      phone: formPhone.trim() || undefined,
      company: formCompany.trim() || undefined,
      role: formRole.trim() || undefined,
      groups: uniqueGroups.length > 0 ? uniqueGroups : undefined,
    };

    if (editingId) {
      const existing = contacts.find((c) => c.id === editingId);
      const updated: CorporateContact = {
        ...(existing || { id: editingId }),
        ...payload,
        id: editingId,
      };
      if (onUpdateContact) {
        onUpdateContact(updated);
      } else {
        setInternalContacts((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      }
    } else {
      if (onAddContact) {
        onAddContact(payload);
      } else {
        setInternalContacts((prev) => {
          if (prev.some((c) => c.email.toLowerCase() === cleanEmail)) return prev;
          return [{ ...payload, id: `contact-${Date.now()}` }, ...prev];
        });
      }
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (onDeleteContact) {
      onDeleteContact(id);
    } else {
      setInternalContacts((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const filteredContacts = contacts.filter((c) => {
    if (selectedGroup !== 'all') {
      const hasGroup = (c.groups || []).some(
        (g) => g.trim().toLowerCase() === selectedGroup.toLowerCase()
      );
      if (!hasGroup) return false;
    }
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.role && c.role.toLowerCase().includes(q)) ||
      (c.company && c.company.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.groups && c.groups.some((g) => g.toLowerCase().includes(q)))
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full p-6 select-text overflow-y-auto custom-scroll bg-white text-slate-800">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.vcf,text/csv,text/vcard,text/x-vcard"
        onChange={handleImportFile}
        className="hidden"
      />

      {/* Top Header */}
      <div className="flex items-center justify-between pb-5 border-b border-slate-200 gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>Contatos ({contacts.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            Organize contatos em grupos/listas, importe ou exporte em CSV e vCard (.vcf)
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2 shrink-0">
          {onSyncCloudContacts && (
            <button
              type="button"
              disabled={isSyncingCloud}
              onClick={async () => {
                setIsSyncingCloud(true);
                try {
                  const msg = await onSyncCloudContacts();
                  showNotice(msg);
                } finally {
                  setIsSyncingCloud(false);
                }
              }}
              className="flex items-center space-x-1.5 px-3 py-2 bg-sky-50 hover:bg-sky-100 disabled:opacity-60 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              title="Sincronizar contatos do Google Contacts, Microsoft 365 e CardDAV"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
              <span>{isSyncingCloud ? 'Sincronizando...' : 'Sincronizar Nuvem'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            title="Importar contatos de arquivo CSV ou vCard (.vcf)"
          >
            <Upload className="w-3.5 h-3.5 text-blue-600" />
            <span>Importar CSV / vCard</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            title="Exportar contatos para planilha CSV (Excel)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportVCard}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            title="Exportar contatos no formato vCard (.vcf)"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            <span>vCard</span>
          </button>
          <button
            type="button"
            onClick={openNewContactModal}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Novo Contato</span>
          </button>
        </div>
      </div>

      <div className="py-5 space-y-4 max-w-none">
        {ioNotice && (
          <div className="px-3.5 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium flex items-center justify-between">
            <span>{ioNotice}</span>
            <button
              type="button"
              onClick={() => setIoNotice(null)}
              className="text-blue-500 hover:text-blue-700 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Search Bar + Group Filter Chips */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar contatos por nome, e-mail, cargo, empresa ou grupo..."
                className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1473E6]"
              />
            </div>

            {selectedGroup !== 'all' && filteredContacts.length > 0 && onComposeToGroup && (
              <button
                type="button"
                onClick={() =>
                  onComposeToGroup(
                    filteredContacts.map((c) => c.email),
                    selectedGroup
                  )
                }
                className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                title={`Enviar e-mail para todos os ${filteredContacts.length} contatos do grupo ${selectedGroup}`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  Enviar para grupo "{selectedGroup}" ({filteredContacts.length})
                </span>
              </button>
            )}
          </div>

          {allGroups.length > 0 && (
            <div className="flex items-center flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedGroup('all')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  selectedGroup === 'all'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                }`}
              >
                Todos ({contacts.length})
              </button>
              {allGroups.map((g) => (
                <button
                  key={g.name}
                  type="button"
                  onClick={() => setSelectedGroup(g.name)}
                  className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                    selectedGroup === g.name
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  <Tag className="w-3 h-3" />
                  <span>
                    {g.name} ({g.count})
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Contacts Grid */}
        {filteredContacts.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 space-y-2">
            <Users className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">
              {search.trim()
                ? 'Nenhum contato encontrado para esta pesquisa.'
                : 'Nenhum contato cadastrado ainda.'}
            </p>
            <button
              type="button"
              onClick={openNewContactModal}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Adicionar Primeiro Contato</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {filteredContacts.map((c) => (
              <div
                key={c.id || c.email}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-blue-300 hover:shadow-sm transition-all flex items-start space-x-3.5 group relative"
              >
                {/* Sender Avatar */}
                <div className="pt-0.5 shrink-0">
                  <SenderAvatar
                    name={c.name}
                    email={c.email}
                    avatar={c.avatar}
                    size={46}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate">
                        {c.name}
                      </h4>
                      {c.role && <p className="text-[11px] text-[#1473E6] truncate">{c.role}</p>}
                    </div>

                    <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 shrink-0">
                      {onComposeToContact && (
                        <button
                          type="button"
                          onClick={() => onComposeToContact(c.email)}
                          title={`Enviar e-mail para ${c.email}`}
                          className="p-1.5 rounded-md text-[#1473E6] hover:bg-blue-50 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditContactModal(c)}
                        title="Editar contato"
                        className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        title="Excluir contato"
                        className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {(c.company || (c.groups && c.groups.length > 0)) && (
                    <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
                      {c.company && (
                        <span className="inline-block text-[10px] text-slate-600 px-2 py-0.5 rounded bg-white border border-slate-200">
                          {c.company}
                        </span>
                      )}
                      {(c.groups || []).map((g) => (
                        <span
                          key={g}
                          className="inline-flex items-center space-x-1 text-[10px] font-medium text-blue-700 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200"
                        >
                          <Tag className="w-2.5 h-2.5" />
                          <span>{g}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="space-y-0.5 text-xs text-slate-600 pt-2 border-t border-slate-200/80">
                    <div className="flex items-center space-x-1.5 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono text-[11px] text-slate-700 truncate">
                        {c.email}
                      </span>
                    </div>
                    {c.phone && (
                      <div className="flex items-center space-x-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-[11px]">{c.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Novo / Editar Contato */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-3.5 bg-blue-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-4 h-4" />
                <h3 className="text-sm font-bold">
                  {editingId ? 'Editar Contato' : 'Novo Contato'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded hover:bg-blue-700 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              {formError && (
                <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium">
                  {formError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  autoFocus
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Maria Oliveira"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#1473E6]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  E-mail <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => {
                      setFormEmail(e.target.value);
                      if (formError) setFormError('');
                    }}
                    placeholder="contato@empresa.com.br"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-[#1473E6]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Telefone (opcional)
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#1473E6]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Empresa (opcional)
                  </label>
                  <div className="relative">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={formCompany}
                      onChange={(e) => setFormCompany(e.target.value)}
                      placeholder="Nome da empresa"
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#1473E6]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Cargo / Observação (opcional)
                </label>
                <div className="relative">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    placeholder="Ex: Comercial, Financeiro, Cliente VIP..."
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#1473E6]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Grupos / Listas (opcional, separados por vírgula)
                </label>
                <div className="relative">
                  <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={formGroups}
                    onChange={(e) => setFormGroups(e.target.value)}
                    placeholder="Ex: Clientes, Diretoria, Financeiro"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-[#1473E6]"
                  />
                </div>
                {allGroups.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {allGroups.slice(0, 6).map((g) => (
                      <button
                        key={g.name}
                        type="button"
                        onClick={() => {
                          const existing = formGroups
                            .split(/[,;]+/)
                            .map((s) => s.trim())
                            .filter(Boolean);
                          if (!existing.some((x) => x.toLowerCase() === g.name.toLowerCase())) {
                            setFormGroups([...existing, g.name].join(', '));
                          }
                        }}
                        className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 transition-colors"
                      >
                        + {g.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{editingId ? 'Salvar Alterações' : 'Salvar Contato'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
