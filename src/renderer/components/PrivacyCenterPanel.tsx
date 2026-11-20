import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  EyeOff,
  UserX,
  Send,
  ImageOff,
  Activity,
  UserCircle2,
  Plus,
  Trash2,
  FileText,
  HelpCircle,
  Lock,
  X,
  HardDrive,
  RotateCcw,
  KeyRound,
  Copy,
  Download,
  Upload,
} from 'lucide-react';
import { SecuritySettings } from '@/types/settings';
import {
  ContactPgpKey,
  loadPgpKeyring,
  OwnPgpKey,
  PgpKeyringData,
  savePgpKeyring,
} from '../utils/pgpKeyring';

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  activeColor?: string;
}> = ({ checked, onChange, activeColor = 'bg-emerald-500' }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
      checked ? activeColor : 'bg-slate-700'
    }`}
  >
    <span
      className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition duration-200 ${
        checked ? 'translate-x-4' : 'translate-x-0.5'
      }`}
    />
  </button>
);

interface PrivacyCenterPanelProps {
  security: SecuritySettings;
  onChangeSecurity: (next: SecuritySettings) => void;
}

export const PrivacyCenterPanel: React.FC<PrivacyCenterPanelProps> = ({
  security,
  onChangeSecurity,
}) => {
  const [newBlockedInput, setNewBlockedInput] = useState('');
  const [docModal, setDocModal] = useState<'policy' | 'guide' | null>(null);
  const [blockedTrackersCount, setBlockedTrackersCount] = useState<number>(0);

  // OpenPGP Keyring state
  const [pgpKeyring, setPgpKeyring] = useState<PgpKeyringData>(() => loadPgpKeyring());
  const [pgpName, setPgpName] = useState('');
  const [pgpEmail, setPgpEmail] = useState('');
  const [pgpPassphrase, setPgpPassphrase] = useState('');
  const [isGeneratingPgp, setIsGeneratingPgp] = useState(false);
  const [pgpImportEmail, setPgpImportEmail] = useState('');
  const [pgpImportArmored, setPgpImportArmored] = useState('');
  const [pgpFeedback, setPgpFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleGeneratePgpKey = async () => {
    const emailClean = pgpEmail.trim().toLowerCase();
    if (!emailClean || !emailClean.includes('@')) {
      setPgpFeedback({ ok: false, msg: 'Informe um e-mail válido para gerar a chave OpenPGP.' });
      return;
    }
    if (!window.electronAPI?.pgpGenerateKey) {
      setPgpFeedback({ ok: false, msg: 'OpenPGP disponível apenas no aplicativo desktop.' });
      return;
    }
    setIsGeneratingPgp(true);
    setPgpFeedback(null);
    try {
      const res = await window.electronAPI.pgpGenerateKey({
        name: pgpName.trim() || emailClean.split('@')[0],
        email: emailClean,
        passphrase: pgpPassphrase || undefined,
      });
      if (!res.success || !res.publicKey || !res.privateKey || !res.fingerprint) {
        setPgpFeedback({ ok: false, msg: res.error || 'Erro ao gerar chave.' });
        return;
      }
      const newKey: OwnPgpKey = {
        id: `pgp-own-${Date.now()}`,
        email: emailClean,
        name: pgpName.trim() || emailClean.split('@')[0],
        fingerprint: res.fingerprint,
        publicKey: res.publicKey,
        privateKey: res.privateKey,
        hasPassphrase: Boolean(pgpPassphrase),
        createdAt: res.createdAt || new Date().toISOString(),
      };
      const next: PgpKeyringData = {
        ...pgpKeyring,
        ownKeys: [newKey, ...pgpKeyring.ownKeys.filter((k) => k.email !== emailClean)],
      };
      setPgpKeyring(next);
      savePgpKeyring(next);
      setPgpPassphrase('');
      setPgpFeedback({ ok: true, msg: `Par de chaves Curve25519 gerado para ${emailClean}!` });
    } finally {
      setIsGeneratingPgp(false);
    }
  };

  const handleImportContactPgpKey = async () => {
    const armored = pgpImportArmored.trim();
    if (!armored.includes('BEGIN PGP PUBLIC KEY BLOCK')) {
      setPgpFeedback({ ok: false, msg: 'Cole uma chave pública OpenPGP válida (-----BEGIN PGP PUBLIC KEY BLOCK-----).' });
      return;
    }
    if (!window.electronAPI?.pgpInspectKey) {
      setPgpFeedback({ ok: false, msg: 'OpenPGP disponível apenas no aplicativo desktop.' });
      return;
    }
    const inspected = await window.electronAPI.pgpInspectKey(armored);
    if (!inspected.success || !inspected.fingerprint) {
      setPgpFeedback({ ok: false, msg: inspected.error || 'Chave pública inválida.' });
      return;
    }
    const emailClean = (pgpImportEmail.trim() || inspected.email || '').toLowerCase();
    if (!emailClean || !emailClean.includes('@')) {
      setPgpFeedback({ ok: false, msg: 'Informe o e-mail do contato associado a esta chave pública.' });
      return;
    }
    const newContactKey: ContactPgpKey = {
      id: `pgp-contact-${Date.now()}`,
      email: emailClean,
      name: inspected.name || emailClean.split('@')[0],
      fingerprint: inspected.fingerprint,
      publicKey: armored,
      addedAt: new Date().toISOString(),
    };
    const next: PgpKeyringData = {
      ...pgpKeyring,
      contactKeys: [newContactKey, ...pgpKeyring.contactKeys.filter((k) => k.email !== emailClean)],
    };
    setPgpKeyring(next);
    savePgpKeyring(next);
    setPgpImportEmail('');
    setPgpImportArmored('');
    setPgpFeedback({ ok: true, msg: `Chave pública de ${emailClean} importada com sucesso!` });
  };

  const handleDownloadPublicKey = (email: string, publicKey: string) => {
    const blob = new Blob([publicKey], { type: 'application/pgp-keys;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${email.replace(/[^a-z0-9@._-]/gi, '_')}-public.asc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (window.electronAPI?.getPrivacyStats) {
      window.electronAPI
        .getPrivacyStats()
        .then((res) => setBlockedTrackersCount(res?.blockedCount || 0))
        .catch(() => {});
    }
    if (window.electronAPI?.onTrackerBlocked) {
      const unsubscribe = window.electronAPI.onTrackerBlocked((data) => {
        if (typeof data?.totalBlocked === 'number') {
          setBlockedTrackersCount(data.totalBlocked);
        }
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, []);

  const handleResetTrackerStats = async () => {
    if (window.electronAPI?.resetPrivacyStats) {
      const res = await window.electronAPI.resetPrivacyStats();
      setBlockedTrackersCount(res?.blockedCount || 0);
    } else {
      setBlockedTrackersCount(0);
    }
  };

  const privacyMode = security.privacyMode ?? true;
  const blockTrackingPixels = security.blockTrackingPixels ?? true;
  const blockBlockedSenders = security.blockBlockedSenders ?? true;
  const trackSentEmails = security.trackSentEmails ?? false;
  const shareDiagnostics = security.shareDiagnostics ?? false;
  const downloadExternalAvatars = security.downloadExternalAvatars ?? true;
  const blockedSenders = security.blockedSenders ?? [];

  const updateField = <K extends keyof SecuritySettings>(
    key: K,
    value: SecuritySettings[K]
  ) => {
    onChangeSecurity({
      ...security,
      [key]: value,
    });
  };

  const handleTogglePrivacyMode = (enabled: boolean) => {
    onChangeSecurity({
      ...security,
      privacyMode: enabled,
      blockTrackingPixels: enabled ? true : security.blockTrackingPixels,
      blockBlockedSenders: enabled ? true : security.blockBlockedSenders,
    });
  };

  const handleAddBlockedSender = () => {
    const clean = newBlockedInput.trim().toLowerCase();
    if (!clean) return;
    if (!blockedSenders.includes(clean)) {
      updateField('blockedSenders', [...blockedSenders, clean]);
    }
    setNewBlockedInput('');
  };

  const handleRemoveBlockedSender = (target: string) => {
    updateField(
      'blockedSenders',
      blockedSenders.filter((item) => item !== target)
    );
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho Anectta Mail */}
      <div>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Central de Privacidade & Segurança</span>
        </h3>
        <p className="text-xs text-slate-400">
          No Anectta Mail, suas mensagens, credenciais e índices permanecem armazenados localmente no seu dispositivo.
        </p>
      </div>

      {/* Banner de Armazenamento Local Exclusivo + Contador de Rastreadores Bloqueados */}
      <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-slate-900 to-brand-500/10 border border-emerald-500/30 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <HardDrive className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">
              Armazenamento 100% no seu Computador
            </div>
            <div className="text-[11px] text-slate-400">
              Seus e-mails nunca passam por servidores intermediários — comunicação direta com seu provedor.
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5 bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-lg shrink-0">
          <div className="text-right">
            <div className="text-xs font-bold font-mono text-emerald-400">
              {blockedTrackersCount} bloqueado(s)
            </div>
            <div className="text-[10px] text-slate-500">
              Rastreadores interceptados
            </div>
          </div>
          {blockedTrackersCount > 0 && (
            <button
              type="button"
              onClick={handleResetTrackerStats}
              title="Zerar contador de rastreadores bloqueados"
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Card 1: Proteção de Privacidade */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-xs text-slate-100 block font-semibold">
                Escudo de Privacidade Anectta
              </span>
              <span className="text-[11px] text-slate-400">
                Ativa proteções essenciais contra rastreadores ocultos, imagens espiãs e remetentes indesejados.
              </span>
            </div>
          </div>
          <ToggleSwitch
            checked={privacyMode}
            onChange={(next) => handleTogglePrivacyMode(next)}
            activeColor="bg-emerald-500"
          />
        </div>

        {/* Subcontroles */}
        <div className="pl-6 pt-2 border-t border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start space-x-2.5">
              <EyeOff className="w-3.5 h-3.5 text-sky-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-xs text-slate-200 block font-medium">
                  Bloquear pixels de rastreamento
                </span>
                <span className="text-[10px] text-slate-500">
                  Neutraliza web beacons invisíveis (1x1 px) para que remetentes não saibam quando você abriu a mensagem.
                </span>
              </div>
            </div>
            <ToggleSwitch
              checked={blockTrackingPixels}
              onChange={(next) => updateField('blockTrackingPixels', next)}
              activeColor="bg-brand-600"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start space-x-2.5">
              <UserX className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-xs text-slate-200 block font-medium">
                  Bloquear remetentes indesejados
                </span>
                <span className="text-[10px] text-slate-500">
                  Move mensagens dos endereços ou domínios bloqueados abaixo direto para o Lixo Eletrônico.
                </span>
              </div>
            </div>
            <ToggleSwitch
              checked={blockBlockedSenders}
              onChange={(next) => updateField('blockBlockedSenders', next)}
              activeColor="bg-brand-600"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start space-x-2.5">
              <Send className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-xs text-slate-200 block font-medium">
                  Solicitar confirmação de leitura ao enviar
                </span>
                <span className="text-[10px] text-slate-500">
                  Inclui cabeçalho de notificação de leitura nos e-mails enviados quando suportado pelo servidor.
                </span>
              </div>
            </div>
            <ToggleSwitch
              checked={trackSentEmails}
              onChange={(next) => updateField('trackSentEmails', next)}
              activeColor="bg-brand-600"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start space-x-2.5">
              <ImageOff className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-xs text-slate-200 block font-medium">
                  Bloquear imagens remotas
                </span>
                <span className="text-[10px] text-slate-500">
                  Impede o carregamento automático de imagens externas até você autorizar na leitura.
                </span>
              </div>
            </div>
            <ToggleSwitch
              checked={security.blockExternalImages}
              onChange={(next) => updateField('blockExternalImages', next)}
              activeColor="bg-brand-600"
            />
          </div>
        </div>
      </div>

      {/* Card 2: Compartilhamento de Dados & Avatares */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Compartilhamento de Dados & Avatares
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start space-x-2.5">
            <Activity className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-xs text-slate-200 block font-medium">
                Diagnóstico local de desempenho e falhas
              </span>
              <span className="text-[10px] text-slate-500">
                Registra métricas técnicas locais para diagnóstico sem coletar conteúdo de e-mails.
              </span>
            </div>
          </div>
          <ToggleSwitch
            checked={shareDiagnostics}
            onChange={(next) => updateField('shareDiagnostics', next)}
            activeColor="bg-brand-600"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start space-x-2.5">
            <UserCircle2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-xs text-slate-200 block font-medium">
                Carregar avatares externos de remetentes
              </span>
              <span className="text-[10px] text-slate-500">
                Quando desativado, exibe apenas avatares locais com as iniciais do remetente.
              </span>
            </div>
          </div>
          <ToggleSwitch
            checked={downloadExternalAvatars}
            onChange={(next) => updateField('downloadExternalAvatars', next)}
            activeColor="bg-brand-600"
          />
        </div>
      </div>

      {/* Card 3: Segurança Corporativa (AES-256 & SOC2/LGPD) */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Criptografia & Conformidade
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start space-x-2.5">
            <Lock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-xs text-slate-200 block font-medium">
                Criptografia de Dados Locais (AES-256)
              </span>
              <span className="text-[10px] text-slate-500">
                Protege rascunhos, tokens e cache offline armazenados no disco.
              </span>
            </div>
          </div>
          <ToggleSwitch
            checked={security.enableEncryption}
            onChange={(next) => updateField('enableEncryption', next)}
            activeColor="bg-brand-600"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start space-x-2.5">
            <Shield className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-xs text-slate-200 block font-medium">
                Modo de Conformidade SOC 2 Tipo II & LGPD
              </span>
              <span className="text-[10px] text-slate-500">
                Mantém trilha de auditoria e bloqueia execução de scripts não assinados.
              </span>
            </div>
          </div>
          <ToggleSwitch
            checked={security.soc2ComplianceMode}
            onChange={(next) => updateField('soc2ComplianceMode', next)}
            activeColor="bg-brand-600"
          />
        </div>
      </div>

      {/* Card 3B: Criptografia Ponta-a-Ponta (OpenPGP) */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-200">
                Criptografia Ponta-a-Ponta (OpenPGP / Curve25519)
              </div>
              <p className="text-[10px] text-slate-500">
                Gere seu par de chaves e importe chaves públicas (.asc) de contatos para criptografar e assinar e-mails.
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300 shrink-0">
            {pgpKeyring.ownKeys.length} própria(s) · {pgpKeyring.contactKeys.length} contato(s)
          </span>
        </div>

        {pgpFeedback && (
          <div
            className={`px-3 py-2 rounded-lg text-[11px] border ${
              pgpFeedback.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {pgpFeedback.msg}
          </div>
        )}

        {/* Gerar chave própria */}
        <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
          <div className="text-[11px] font-semibold text-slate-300">1. Gerar meu par de chaves OpenPGP</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={pgpName}
              onChange={(e) => setPgpName(e.target.value)}
              placeholder="Seu nome"
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <input
              type="email"
              value={pgpEmail}
              onChange={(e) => setPgpEmail(e.target.value)}
              placeholder="seu@email.com"
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <input
              type="password"
              value={pgpPassphrase}
              onChange={(e) => setPgpPassphrase(e.target.value)}
              placeholder="Senha da chave (opcional)"
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="button"
            disabled={isGeneratingPgp}
            onClick={handleGeneratePgpKey}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
          >
            {isGeneratingPgp ? 'Gerando chave...' : 'Gerar Par de Chaves OpenPGP'}
          </button>

          {pgpKeyring.ownKeys.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
              {pgpKeyring.ownKeys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800 text-[11px]"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-200 truncate">
                      {k.name} <span className="text-slate-400 font-normal">&lt;{k.email}&gt;</span>
                    </div>
                    <div className="text-[10px] font-mono text-emerald-400 truncate">
                      FP: {k.fingerprint.slice(-16)} {k.hasPassphrase ? '· Protegida por senha' : '· Sem senha'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(k.publicKey);
                        setPgpFeedback({ ok: true, msg: `Chave pública de ${k.email} copiada!` });
                      }}
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      title="Copiar chave pública (.asc)"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadPublicKey(k.email, k.publicKey)}
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      title="Baixar arquivo .asc da chave pública"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...pgpKeyring, ownKeys: pgpKeyring.ownKeys.filter((x) => x.id !== k.id) };
                        setPgpKeyring(next);
                        savePgpKeyring(next);
                      }}
                      className="p-1.5 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                      title="Remover chave"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Importar chave pública de contato */}
        <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-300">
              2. Importar chave pública de contato (.asc)
            </span>
            <label className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300">
              <Upload className="w-3 h-3" />
              <span>Carregar .asc</span>
              <input
                type="file"
                accept=".asc,.gpg,.pgp,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  f.text().then((txt) => setPgpImportArmored(txt));
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <input
            type="email"
            value={pgpImportEmail}
            onChange={(e) => setPgpImportEmail(e.target.value)}
            placeholder="E-mail do contato (opcional se constar na chave)"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
          />
          <textarea
            rows={3}
            value={pgpImportArmored}
            onChange={(e) => setPgpImportArmored(e.target.value)}
            placeholder="-----BEGIN PGP PUBLIC KEY BLOCK----- ..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 resize-none"
          />
          <button
            type="button"
            onClick={handleImportContactPgpKey}
            disabled={!pgpImportArmored.trim()}
            className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
          >
            Importar Chave Pública
          </button>

          {pgpKeyring.contactKeys.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
              {pgpKeyring.contactKeys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800 text-[11px]"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-200 truncate">
                      {k.name} <span className="text-slate-400 font-normal">&lt;{k.email}&gt;</span>
                    </div>
                    <div className="text-[10px] font-mono text-sky-400 truncate">
                      FP: {k.fingerprint.slice(-16)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = {
                        ...pgpKeyring,
                        contactKeys: pgpKeyring.contactKeys.filter((x) => x.id !== k.id),
                      };
                      setPgpKeyring(next);
                      savePgpKeyring(next);
                    }}
                    className="p-1.5 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                    title="Remover chave pública"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Card 4: Remetentes Bloqueados */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
        <div>
          <div className="text-xs font-semibold text-slate-200">
            Remetentes Bloqueados ({blockedSenders.length})
          </div>
          <p className="text-[11px] text-slate-500">
            Adicione um endereço (ex: contato@spam.com) ou domínio (ex: @dominio.com) para enviar automaticamente para Spam.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={newBlockedInput}
            onChange={(e) => setNewBlockedInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddBlockedSender();
              }
            }}
            placeholder="Ex: remetente@exemplo.com ou @dominio.com"
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={handleAddBlockedSender}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Bloquear</span>
          </button>
        </div>

        {blockedSenders.length > 0 ? (
          <div className="max-h-32 overflow-y-auto space-y-1.5 pt-1">
            {blockedSenders.map((entry) => (
              <div
                key={entry}
                className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-300"
              >
                <span className="truncate font-mono text-[11px]">{entry}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveBlockedSender(entry)}
                  title="Desbloquear remetente"
                  className="text-slate-500 hover:text-rose-400 transition-colors p-0.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-slate-500 italic">
            Nenhum remetente bloqueado no momento.
          </div>
        )}
      </div>

      {/* Card 5: Recursos e Transparência Anectta Mail */}
      <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Recursos de Privacidade Anectta Mail
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-slate-200">Política de Privacidade Local</div>
            <div className="text-[10px] text-slate-500">
              Saiba como o Anectta Mail protege suas credenciais e mensagens no dispositivo.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDocModal('policy')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center space-x-1.5 transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-brand-400" />
            <span>Ver Política</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/70">
          <div>
            <div className="text-xs font-medium text-slate-200">Guia de Privacidade & LGPD</div>
            <div className="text-[10px] text-slate-500">
              Boas práticas para bloqueio de rastreadores, imagens e remetentes suspeitos.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDocModal('guide')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center space-x-1.5 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Abrir Guia</span>
          </button>
        </div>
      </div>

      {/* Modal Interno de Transparência */}
      {docModal && (
        <div className="p-4 bg-slate-900 border border-brand-500/40 rounded-xl space-y-2 relative">
          <button
            type="button"
            onClick={() => setDocModal(null)}
            className="absolute right-3 top-3 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
          <h4 className="text-xs font-bold text-white">
            {docModal === 'policy'
              ? 'Política de Privacidade Local — Anectta Mail'
              : 'Guia de Privacidade & Boas Práticas — Anectta Mail'}
          </h4>
          {docModal === 'policy' ? (
            <p className="text-[11px] text-slate-300 leading-relaxed">
              O Anectta Mail opera com arquitetura local-first: suas mensagens IMAP/POP3, rascunhos, contatos e configurações ficam armazenados apenas no seu equipamento, com suporte a criptografia local AES-256 e sem venda ou compartilhamento do conteúdo dos seus e-mails com terceiros.
            </p>
          ) : (
            <ul className="text-[11px] text-slate-300 space-y-1 list-disc pl-4">
              <li>Mantenha o bloqueio de pixels de rastreamento ativo para evitar confirmação silenciosa de abertura.</li>
              <li>Use &ldquo;Bloquear todas as imagens externas&rdquo; em contas que recebem muitas newsletters ou anexos comerciais.</li>
              <li>Adicione domínios recorrentes na lista de Remetentes Bloqueados para triagem automática para Spam.</li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
