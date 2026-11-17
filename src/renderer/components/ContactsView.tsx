import React, { useState } from 'react';
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
} from 'lucide-react';
import { SenderAvatar } from './SenderAvatar';

export interface CorporateContact {
  id: string;
  name: string;
  email: string;
  role?: string;
  company?: string;
  phone?: string;
  avatar?: string;
}

export const DEFAULT_CORPORATE_CONTACTS: CorporateContact[] = [
  {
    id: 'contact-marco',
    name: 'Marco Aurélio Moreira',
    email: 'marco.moreira@trinityti.com.br',
    role: 'CEO & Founder',
    company: 'TrinityTI Gestão de TI',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    phone: '+55 (11) 98823-1100',
  },
  {
    id: 'contact-carlos',
    name: 'Carlos Eduardo Mendes',
    email: 'carlos.mendes@cyberdefense.io',
    role: 'Lead Security Engineer',
    company: 'CyberDefense Security',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    phone: '+55 (11) 97102-4491',
  },
  {
    id: 'contact-beatriz',
    name: 'Beatriz Vasconcelos',
    email: 'beatriz.vasconcelos@anectta.com.br',
    role: 'Vice-Presidente de Operações',
    company: 'Anectta Corp',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
    phone: '+55 (11) 99450-8822',
  },
  {
    id: 'contact-coworking',
    name: 'Coworking Smart Financeiro',
    email: 'faturamento@coworkingsmart.conexa.app',
    role: 'Faturamento & NFS-e',
    company: 'Coworking Smart Gestão de Espaços',
    phone: '+55 (11) 3200-5000',
  },
];

interface ContactsViewProps {
  contacts?: CorporateContact[];
  onAddContact?: (contact: Omit<CorporateContact, 'id'>) => void;
  onUpdateContact?: (contact: CorporateContact) => void;
  onDeleteContact?: (id: string) => void;
  onComposeToContact?: (email: string) => void;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  contacts: controlledContacts,
  onAddContact,
  onUpdateContact,
  onDeleteContact,
  onComposeToContact,
}) => {
  const [internalContacts, setInternalContacts] = useState<CorporateContact[]>(DEFAULT_CORPORATE_CONTACTS);
  const contacts = controlledContacts ?? internalContacts;

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formError, setFormError] = useState('');

  const openNewContactModal = () => {
    setEditingId(null);
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormCompany('');
    setFormRole('');
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
    const payload: Omit<CorporateContact, 'id'> = {
      name: cleanName,
      email: cleanEmail,
      phone: formPhone.trim() || undefined,
      company: formCompany.trim() || undefined,
      role: formRole.trim() || undefined,
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
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.role && c.role.toLowerCase().includes(q)) ||
      (c.company && c.company.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full p-6 select-text overflow-y-auto custom-scroll bg-white text-slate-800">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-5 border-b border-slate-200 gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>Contatos ({contacts.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            Cadastre novos contatos manualmente ou adicione remetentes direto dos seus e-mails
          </p>
        </div>

        <button
          type="button"
          onClick={openNewContactModal}
          className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Novo Contato</span>
        </button>
      </div>

      <div className="py-5 space-y-4 max-w-5xl">
        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar contatos por nome, e-mail, cargo ou empresa..."
            className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1473E6]"
          />
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

                  {c.company && (
                    <span className="inline-block text-[10px] text-slate-600 px-2 py-0.5 rounded bg-white border border-slate-200">
                      {c.company}
                    </span>
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
