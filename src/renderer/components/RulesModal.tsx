import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Play,
  SlidersHorizontal,
  Edit3,
  Check,
  FolderInput,
  MailOpen,
  Flag,
  Tag,
  Star,
  Copy,
  Forward,
} from 'lucide-react';
import {
  MailRule,
  RuleCondition,
  RuleConditionField,
  RuleConditionOperator,
} from '../services/rulesService';
import { CustomFolder, EmailItem, MailFolder, PriorityLevel } from '../types/email';
import { AccountSettings } from '../types/settings';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: MailRule[];
  onSaveRules: (rules: MailRule[]) => void;
  onRunRulesNow: () => void;
  customFolders: CustomFolder[];
  accounts: AccountSettings[];
}

const CATEGORIES: Array<NonNullable<EmailItem['category']>> = [
  'Finanças',
  'Clientes',
  'DevOps',
  'Jurídico',
  'Urgente',
];

const FIELD_LABELS: Record<RuleConditionField, string> = {
  sender: 'De (Remetente)',
  recipient: 'Para (Destinatário)',
  subject: 'Assunto',
  body: 'Corpo do E-mail',
  has_attachment: 'Possui anexo',
  size: 'Tamanho (KB)',
  folder: 'Pasta',
  any: 'Qualquer Campo',
};

const OPERATOR_LABELS: Record<RuleConditionOperator, string> = {
  contains: 'Contém',
  not_contains: 'Não contém',
  equals: 'É igual a',
  starts_with: 'Começa com',
  ends_with: 'Termina com',
  greater_than: 'Maior que',
  less_than: 'Menor que',
  is_true: 'Sim',
  is_false: 'Não',
};

function getOperatorsForField(field: RuleConditionField): RuleConditionOperator[] {
  if (field === 'has_attachment') return ['is_true', 'is_false'];
  if (field === 'size') return ['greater_than', 'less_than'];
  return ['contains', 'not_contains', 'equals', 'starts_with', 'ends_with'];
}

const createEmptyCondition = (): RuleCondition => ({
  id: `cond-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  field: 'sender',
  operator: 'contains',
  value: '',
});

export const RulesModal: React.FC<RulesModalProps> = ({
  isOpen,
  onClose,
  rules,
  onSaveRules,
  onRunRulesNow,
  customFolders,
  accounts,
}) => {
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('all');
  const [conditions, setConditions] = useState<RuleCondition[]>([createEmptyCondition()]);
  const [moveToFolder, setMoveToFolder] = useState<string>('');
  const [copyToFolder, setCopyToFolder] = useState<string>('');
  const [markAsRead, setMarkAsRead] = useState(false);
  const [markAsStarred, setMarkAsStarred] = useState(false);
  const [markAsImportant, setMarkAsImportant] = useState(false);
  const [setPriority, setSetPriority] = useState<string>('');
  const [setCategory, setSetCategory] = useState<string>('');
  const [redirectTo, setRedirectTo] = useState('');
  const [stopProcessing, setStopProcessing] = useState(false);

  if (!isOpen) return null;

  const resetForm = () => {
    setEditingRuleId(null);
    setName('');
    setAccountId('');
    setMatchMode('all');
    setConditions([createEmptyCondition()]);
    setMoveToFolder('');
    setCopyToFolder('');
    setMarkAsRead(false);
    setMarkAsStarred(false);
    setMarkAsImportant(false);
    setSetPriority('');
    setSetCategory('');
    setRedirectTo('');
    setStopProcessing(false);
  };

  const openNewForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditForm = (rule: MailRule) => {
    setEditingRuleId(rule.id);
    setName(rule.name);
    setAccountId(rule.accountId || '');
    setMatchMode(rule.matchMode || 'all');
    setConditions(
      rule.conditions && rule.conditions.length > 0
        ? rule.conditions.map((c) => ({ ...c }))
        : [createEmptyCondition()]
    );
    setMoveToFolder(rule.actions.moveToFolder || '');
    setCopyToFolder(rule.actions.copyToFolder || '');
    setMarkAsRead(Boolean(rule.actions.markAsRead));
    setMarkAsStarred(Boolean(rule.actions.markAsStarred));
    setMarkAsImportant(Boolean(rule.actions.markAsImportant));
    setSetPriority(rule.actions.setPriority || '');
    setSetCategory(rule.actions.setCategory || '');
    setRedirectTo(rule.actions.redirectTo || '');
    setStopProcessing(Boolean(rule.stopProcessing));
    setIsFormOpen(true);
  };

  const saveRuleInternal = (runAfterSave: boolean) => {
    const validConditions = conditions.filter(
      (c) => c.field === 'has_attachment' || c.value.trim().length > 0
    );
    if (!name.trim() || validConditions.length === 0) return;
    if (
      !moveToFolder &&
      !copyToFolder &&
      !markAsRead &&
      !markAsStarred &&
      !markAsImportant &&
      !setPriority &&
      !setCategory &&
      !redirectTo.trim()
    ) {
      return;
    }

    const newRule: MailRule = {
      id: editingRuleId || `rule-${Date.now()}`,
      name: name.trim(),
      enabled: editingRuleId
        ? rules.find((r) => r.id === editingRuleId)?.enabled ?? true
        : true,
      accountId: accountId || undefined,
      matchMode,
      conditions: validConditions,
      actions: {
        moveToFolder: (moveToFolder || undefined) as MailFolder | undefined,
        copyToFolder: (copyToFolder || undefined) as MailFolder | undefined,
        markAsRead: markAsRead || undefined,
        markAsStarred: markAsStarred || undefined,
        markAsImportant: markAsImportant || undefined,
        setPriority: (setPriority || undefined) as PriorityLevel | undefined,
        setCategory: (setCategory || undefined) as EmailItem['category'] | undefined,
        redirectTo: redirectTo.trim() || undefined,
      },
      stopProcessing,
      createdAt: editingRuleId
        ? rules.find((r) => r.id === editingRuleId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
    };

    const nextRules = editingRuleId
      ? rules.map((r) => (r.id === editingRuleId ? newRule : r))
      : [newRule, ...rules];

    onSaveRules(nextRules);
    setIsFormOpen(false);
    resetForm();
    if (runAfterSave) {
      setTimeout(() => onRunRulesNow(), 0);
    }
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    saveRuleInternal(false);
  };

  const handleToggleRule = (id: string) => {
    onSaveRules(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  const handleDeleteRule = (id: string) => {
    const rule = rules.find((r) => r.id === id);
    if (!window.confirm(`Deseja realmente apagar a regra "${rule?.name || id}"?`)) {
      return;
    }
    onSaveRules(rules.filter((r) => r.id !== id));
    if (editingRuleId === id) {
      setIsFormOpen(false);
      resetForm();
    }
  };

  const folderLabel = (folderId?: string) => {
    if (!folderId) return '';
    const std: Record<string, string> = {
      inbox: 'Caixa de Entrada',
      archive: 'Arquivados',
      junk: 'Lixo Eletrônico',
      trash: 'Itens Excluídos',
      sent: 'Itens Enviados',
    };
    return std[folderId] || customFolders.find((f) => f.id === folderId)?.name || folderId;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-[90vw] max-w-[1400px] max-h-[86vh] flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-brand-600/20 text-brand-400">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Motor de Regras Automáticas</h2>
              <p className="text-xs text-slate-400">
                Organize e-mails automaticamente ao sincronizar (pasta, leitura, prioridade e categoria).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scroll">
          {/* Action bar */}
          {!isFormOpen && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={openNewForm}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Regra</span>
              </button>

              {rules.some((r) => r.enabled) && (
                <button
                  type="button"
                  onClick={onRunRulesNow}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Executar Regras Agora</span>
                </button>
              )}
            </div>
          )}

          {/* Create / Edit Form */}
          {isFormOpen && (
            <form
              onSubmit={handleSaveForm}
              className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h3 className="text-sm font-semibold text-white">
                  {editingRuleId ? 'Editar Regra' : 'Criar Nova Regra'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    resetForm();
                  }}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Nome da Regra *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Notas Fiscais → Finanças"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Aplicar na Conta
                  </label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="">Todas as contas configuradas</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Conditions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Condições</span>
                  <div className="flex items-center space-x-2 text-[11px]">
                    <span className="text-slate-400">Corresponder:</span>
                    <select
                      value={matchMode}
                      onChange={(e) => setMatchMode(e.target.value as 'all' | 'any')}
                      className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                    >
                      <option value="all">Todas (E)</option>
                      <option value="any">Qualquer uma (OU)</option>
                    </select>
                  </div>
                </div>

                {conditions.map((cond, idx) => {
                  const allowedOps = getOperatorsForField(cond.field);
                  return (
                    <div key={cond.id} className="grid grid-cols-12 gap-2 items-center">
                      <select
                        value={cond.field}
                        onChange={(e) => {
                          const nextField = e.target.value as RuleConditionField;
                          const nextOps = getOperatorsForField(nextField);
                          setConditions((prev) =>
                            prev.map((c) =>
                              c.id === cond.id
                                ? {
                                    ...c,
                                    field: nextField,
                                    operator: nextOps.includes(c.operator) ? c.operator : nextOps[0],
                                    value: nextField === 'has_attachment' ? 'true' : c.value,
                                  }
                                : c
                            )
                          );
                        }}
                        className="col-span-3 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                      >
                        {Object.entries(FIELD_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>

                      <select
                        value={cond.operator}
                        onChange={(e) =>
                          setConditions((prev) =>
                            prev.map((c) =>
                              c.id === cond.id
                                ? { ...c, operator: e.target.value as RuleConditionOperator }
                                : c
                            )
                          )
                        }
                        className="col-span-3 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                      >
                        {allowedOps.map((k) => (
                          <option key={k} value={k}>
                            {OPERATOR_LABELS[k]}
                          </option>
                        ))}
                      </select>

                      {cond.field === 'has_attachment' ? (
                        <div className="col-span-5 px-2.5 py-1.5 bg-slate-900/50 border border-slate-800 rounded-lg text-[11px] text-slate-400">
                          {cond.operator === 'is_false'
                            ? 'Mensagens sem anexos'
                            : 'Mensagens com anexo'}
                        </div>
                      ) : (
                        <input
                          type={cond.field === 'size' ? 'number' : 'text'}
                          min={cond.field === 'size' ? 0 : undefined}
                          required={idx === 0}
                          value={cond.value}
                          onChange={(e) =>
                            setConditions((prev) =>
                              prev.map((c) => (c.id === cond.id ? { ...c, value: e.target.value } : c))
                            )
                          }
                          placeholder={
                            cond.field === 'size'
                              ? 'Tamanho em KB (ex: 500)'
                              : cond.field === 'folder'
                              ? 'Ex: inbox, archive, sent...'
                              : 'Nomes, e-mails, domínios ou texto...'
                          }
                          className="col-span-5 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500"
                        />
                      )}

                      <button
                        type="button"
                        disabled={conditions.length <= 1}
                        onClick={() =>
                          setConditions((prev) => prev.filter((c) => c.id !== cond.id))
                        }
                        className="col-span-1 p-1.5 text-slate-400 hover:text-rose-400 disabled:opacity-30 flex justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setConditions((prev) => [...prev, createEmptyCondition()])}
                  className="text-[11px] text-brand-400 hover:text-brand-300 font-medium flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar condição</span>
                </button>
              </div>

              {/* Actions */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <span className="block text-xs font-semibold text-slate-300">
                  Ações Automáticas (selecione ao menos uma)
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Mover / Triagem</label>
                    <select
                      value={moveToFolder}
                      onChange={(e) => setMoveToFolder(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                    >
                      <option value="">Não mover</option>
                      <option value="archive">Ignorar caixa de entrada (Arquivar)</option>
                      <option value="junk">Marcar como spam</option>
                      <option value="trash">Excluir (Lixeira)</option>
                      {customFolders.map((cf) => (
                        <option key={cf.id} value={cf.id}>
                          Mover para: {cf.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Copiar para a Pasta</label>
                    <select
                      value={copyToFolder}
                      onChange={(e) => setCopyToFolder(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                    >
                      <option value="">Não copiar</option>
                      <option value="archive">Arquivados</option>
                      <option value="inbox">Caixa de Entrada</option>
                      {customFolders.map((cf) => (
                        <option key={cf.id} value={cf.id}>
                          {cf.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Redirecionar para</label>
                    <input
                      type="email"
                      value={redirectTo}
                      onChange={(e) => setRedirectTo(e.target.value)}
                      placeholder="destino@empresa.com"
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Prioridade</label>
                    <select
                      value={setPriority}
                      onChange={(e) => setSetPriority(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                    >
                      <option value="">Manter original</option>
                      <option value="high">Alta</option>
                      <option value="medium">Média</option>
                      <option value="low">Baixa</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Categoria</label>
                    <select
                      value={setCategory}
                      onChange={(e) => setSetCategory(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                    >
                      <option value="">Nenhuma</option>
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-5 pt-1">
                  <label className="flex items-center space-x-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={markAsRead}
                      onChange={(e) => setMarkAsRead(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-900 text-brand-500"
                    />
                    <span>Marcar como lido</span>
                  </label>

                  <label className="flex items-center space-x-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={markAsStarred}
                      onChange={(e) => setMarkAsStarred(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-900 text-brand-500"
                    />
                    <span>Marcar como estrelado</span>
                  </label>

                  <label className="flex items-center space-x-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={markAsImportant}
                      onChange={(e) => setMarkAsImportant(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-900 text-brand-500"
                    />
                    <span>Marcar como importante</span>
                  </label>

                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stopProcessing}
                      onChange={(e) => setStopProcessing(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-900 text-brand-500"
                    />
                    <span>Parar de processar outras regras após esta</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="submit"
                  className="flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingRuleId ? 'Salvar Alterações' : 'Salvar'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => saveRuleInternal(true)}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg text-xs font-semibold"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Salvar e executar</span>
                </button>
              </div>
            </form>
          )}

          {/* Rules List */}
          {rules.length === 0 && !isFormOpen ? (
            <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl text-slate-400 text-xs">
              Nenhuma regra automática cadastrada. Clique em <strong>Nova Regra</strong> para criar sua primeira automação.
            </div>
          ) : (
            <div className="space-y-2.5">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-3.5 rounded-xl border transition-colors ${
                    rule.enabled
                      ? 'bg-slate-950/60 border-slate-800'
                      : 'bg-slate-950/25 border-slate-800/50 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => handleToggleRule(rule.id)}
                          title={rule.enabled ? 'Desativar regra' : 'Ativar regra'}
                          className="rounded border-slate-600 bg-slate-900 text-brand-500 cursor-pointer"
                        />
                        <span className="text-sm font-semibold text-white truncate">
                          {rule.name}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400 flex flex-wrap gap-1.5 pl-6">
                        {rule.conditions.map((c, i) => (
                          <span key={c.id} className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300">
                            {i > 0 ? (rule.matchMode === 'any' ? 'OU ' : 'E ') : ''}
                            {FIELD_LABELS[c.field]} {OPERATOR_LABELS[c.operator].toLowerCase()}
                            {c.field !== 'has_attachment' && (
                              <>
                                {' '}
                                <strong>&ldquo;{c.value}{c.field === 'size' ? ' KB' : ''}&rdquo;</strong>
                              </>
                            )}
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-1.5 pl-6 pt-0.5">
                        {rule.actions.moveToFolder && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-brand-600/20 text-brand-300 text-[11px]">
                            <FolderInput className="w-3 h-3" />
                            <span>Pasta: {folderLabel(rule.actions.moveToFolder)}</span>
                          </span>
                        )}
                        {rule.actions.copyToFolder && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-sky-600/20 text-sky-300 text-[11px]">
                            <Copy className="w-3 h-3" />
                            <span>Copiar: {folderLabel(rule.actions.copyToFolder)}</span>
                          </span>
                        )}
                        {rule.actions.markAsRead && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-300 text-[11px]">
                            <MailOpen className="w-3 h-3" />
                            <span>Marcar lido</span>
                          </span>
                        )}
                        {rule.actions.markAsStarred && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-600/20 text-amber-300 text-[11px]">
                            <Star className="w-3 h-3" />
                            <span>Estrelado</span>
                          </span>
                        )}
                        {rule.actions.markAsImportant && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-600/20 text-amber-300 text-[11px]">
                            <Tag className="w-3 h-3" />
                            <span>Importante</span>
                          </span>
                        )}
                        {rule.actions.redirectTo && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-indigo-600/20 text-indigo-300 text-[11px]">
                            <Forward className="w-3 h-3" />
                            <span>Redirecionar: {rule.actions.redirectTo}</span>
                          </span>
                        )}
                        {rule.actions.setPriority && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-600/20 text-amber-300 text-[11px]">
                            <Flag className="w-3 h-3" />
                            <span>
                              Prioridade:{' '}
                              {rule.actions.setPriority === 'high'
                                ? 'Alta'
                                : rule.actions.setPriority === 'low'
                                  ? 'Baixa'
                                  : 'Média'}
                            </span>
                          </span>
                        )}
                        {rule.actions.setCategory && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-purple-600/20 text-purple-300 text-[11px]">
                            <Tag className="w-3 h-3" />
                            <span>Categoria: {rule.actions.setCategory}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditForm(rule)}
                        title="Editar regra"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id)}
                        title="Excluir regra"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
