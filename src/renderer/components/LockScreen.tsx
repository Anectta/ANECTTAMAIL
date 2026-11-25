import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, KeyRound, Lock, Mail, ShieldCheck, Smartphone, UserCheck } from 'lucide-react';
import logoImg from '../assets/logo.png';
import {
  canRequestManager,
  generateManagerCode,
  generateRecoveryCode,
  hashSecret,
  loadAttempts,
  MANAGER_CODE_MINUTES,
  normalizeRecoveryCode,
  registerFailure,
  saveAppLock,
  saveAttempts,
  validatePin,
  verifySecret,
  verifyTotp,
  type AppLockConfig,
} from '../utils/appLock';

interface Props {
  config: AppLockConfig;
  accounts: Array<{ id: string; email: string }>;
  onUnlock: () => void;
  /** Confere a senha de uma conta de e-mail direto no servidor. */
  testAccountPassword: (accountId: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  /** Envia o código de liberação ao e-mail do gestor (pela conta do próprio usuário). */
  sendManagerCode: (code: string) => Promise<{ ok: boolean; message?: string }>;
}

type View = 'pin' | 'forgot' | 'totp' | 'recovery' | 'password' | 'manager' | 'newPin' | 'newRecovery';

const input =
  'w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500';
const primaryBtn =
  'w-full px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors';

/**
 * Tela de bloqueio do Anectta. Cobre o app inteiro e não deixa atalhos de teclado passarem.
 */
export const LockScreen: React.FC<Props> = ({ config, accounts, onUnlock, testAccountPassword, sendManagerCode }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>('pin');
  const [value, setValue] = useState('');
  const [value2, setValue2] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [attempts, setAttempts] = useState(loadAttempts);
  const [newRecovery, setNewRecovery] = useState('');
  const [renewRecovery, setRenewRecovery] = useState(false);

  // Atalhos do app não funcionam enquanto bloqueado
  useEffect(() => {
    const block = (e: KeyboardEvent) => {
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
    };
    window.addEventListener('keydown', block, true);
    return () => window.removeEventListener('keydown', block, true);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const go = (v: View) => {
    setView(v);
    setValue('');
    setValue2('');
    setError(null);
    setInfo(null);
  };

  const waitSeconds = Math.max(0, Math.ceil((attempts.lockedUntil - now) / 1000));

  const fail = (msg: string) => {
    const next = registerFailure(attempts);
    setAttempts(next);
    saveAttempts(next);
    setError(msg);
  };

  const succeed = () => {
    const reset = { fails: 0, lockedUntil: 0 };
    setAttempts(reset);
    saveAttempts(reset);
  };

  const submitPin = async () => {
    if (waitSeconds > 0 || !value) return;
    setBusy(true);
    const ok = await verifySecret(value, config.pin);
    setBusy(false);
    if (ok) {
      succeed();
      onUnlock();
    } else {
      setValue('');
      fail('PIN incorreto.');
    }
  };

  const submitTotp = async () => {
    if (!config.totpSecret || waitSeconds > 0) return;
    setBusy(true);
    const ok = await verifyTotp(config.totpSecret, value);
    setBusy(false);
    if (ok) {
      succeed();
      go('newPin');
    } else fail('Código do celular incorreto ou expirado. Use o código que aparece agora no app autenticador.');
  };

  const submitRecovery = async () => {
    if (waitSeconds > 0) return;
    setBusy(true);
    const ok = await verifySecret(normalizeRecoveryCode(value), config.recovery);
    setBusy(false);
    if (ok) {
      succeed();
      setRenewRecovery(true); // o código usado deixa de valer: um novo será gerado
      go('newPin');
    } else fail('Código de recuperação incorreto.');
  };

  const submitPassword = async () => {
    if (!accountId || !value || waitSeconds > 0) return;
    setBusy(true);
    setError(null);
    const res = await testAccountPassword(accountId, value);
    setBusy(false);
    if (res.ok) {
      succeed();
      go('newPin');
    } else fail(res.message || 'Senha incorreta ou servidor indisponível.');
  };

  const requestManager = async () => {
    const limit = canRequestManager(config);
    if (!limit.ok) {
      setError(`Limite de pedidos atingido. Tente de novo em ${limit.waitMinutes} min.`);
      return;
    }
    setBusy(true);
    setError(null);
    const code = generateManagerCode();
    const rec = await hashSecret(code);
    const res = await sendManagerCode(code);
    setBusy(false);
    if (!res.ok) {
      setError(res.message || 'Não foi possível enviar o pedido ao gestor. Verifique a internet.');
      return;
    }
    const updated: AppLockConfig = {
      ...config,
      managerCode: { ...rec, expiresAt: Date.now() + MANAGER_CODE_MINUTES * 60_000 },
      managerRequests: [...(config.managerRequests || []), Date.now()].slice(-10),
    };
    saveAppLock(updated);
    setInfo(`Código enviado para ${config.managerEmail}. Ele vale por ${MANAGER_CODE_MINUTES} minutos.`);
  };

  const submitManager = async () => {
    if (waitSeconds > 0) return;
    const mc = config.managerCode;
    if (!mc || Date.now() > mc.expiresAt) {
      setError('O código expirou ou ainda não foi pedido. Peça um novo ao gestor.');
      return;
    }
    setBusy(true);
    const ok = await verifySecret(value.replace(/\D/g, ''), mc);
    setBusy(false);
    if (ok) {
      succeed();
      saveAppLock({ ...config, managerCode: undefined });
      go('newPin');
    } else fail('Código do gestor incorreto.');
  };

  const submitNewPin = async () => {
    const problem = validatePin(value);
    if (problem) {
      setError(problem);
      return;
    }
    if (value !== value2) {
      setError('Os dois PINs não são iguais.');
      return;
    }
    setBusy(true);
    const pin = await hashSecret(value);
    let recovery = config.recovery;
    let code = '';
    if (renewRecovery) {
      code = generateRecoveryCode();
      recovery = await hashSecret(code);
    }
    saveAppLock({ ...config, pin, recovery, managerCode: undefined });
    setBusy(false);
    if (code) {
      setNewRecovery(code);
      go('newRecovery');
    } else onUnlock();
  };

  const methods = [
    config.totpSecret && { v: 'totp' as View, icon: Smartphone, label: 'Código do celular', hint: 'O código de 6 dígitos do app autenticador' },
    config.recovery && { v: 'recovery' as View, icon: KeyRound, label: 'Código de recuperação', hint: 'O código XXXX-XXXX-XXXX que você guardou' },
    accounts.length > 0 && { v: 'password' as View, icon: Mail, label: 'Senha de uma conta de e-mail', hint: 'Conferida no servidor de e-mail (precisa de internet)' },
    config.managerEmail && { v: 'manager' as View, icon: UserCheck, label: 'Liberação pelo gestor', hint: `Envia um código para ${config.managerEmail}` },
  ].filter(Boolean) as Array<{ v: View; icon: typeof Lock; label: string; hint: string }>;

  const back = (to: View = 'forgot') => (
    <button type="button" onClick={() => go(to)} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white">
      <ArrowLeft className="w-3.5 h-3.5" /> Voltar
    </button>
  );

  const errorBox = error && (
    <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">{error}</div>
  );
  const waitBox = waitSeconds > 0 && (
    <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
      Muitas tentativas erradas. Aguarde {waitSeconds} s para tentar de novo.
    </div>
  );

  let body: React.ReactNode = null;
  if (view === 'pin') {
    body = (
      <form onSubmit={(e) => { e.preventDefault(); void submitPin(); }} className="space-y-3">
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Digite seu PIN"
          className={`${input} text-center tracking-[0.3em] text-lg`}
          aria-label="PIN"
          disabled={waitSeconds > 0}
        />
        {waitBox || errorBox}
        <button type="submit" disabled={busy || !value || waitSeconds > 0} className={primaryBtn}>
          Desbloquear
        </button>
        <button type="button" onClick={() => go('forgot')} className="w-full text-xs text-sky-300 hover:text-sky-200">
          Esqueci o PIN
        </button>
      </form>
    );
  } else if (view === 'forgot') {
    body = (
      <div className="space-y-2">
        <p className="text-xs text-slate-400">Escolha como confirmar que é você para criar um PIN novo:</p>
        {methods.map((m) => (
          <button
            key={m.v}
            type="button"
            onClick={() => go(m.v)}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left"
          >
            <m.icon className="w-5 h-5 text-sky-400 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">{m.label}</span>
              <span className="block text-[11px] text-slate-400 truncate">{m.hint}</span>
            </span>
          </button>
        ))}
        <div className="pt-1">{back('pin')}</div>
      </div>
    );
  } else if (view === 'totp') {
    body = (
      <form onSubmit={(e) => { e.preventDefault(); void submitTotp(); }} className="space-y-3">
        <p className="text-xs text-slate-400">Abra o app autenticador no celular e digite o código do "Anectta MAIL".</p>
        <input autoFocus inputMode="numeric" maxLength={7} value={value} onChange={(e) => setValue(e.target.value)} placeholder="000 000" className={`${input} text-center tracking-[0.3em] text-lg`} />
        {waitBox || errorBox}
        <button type="submit" disabled={busy || waitSeconds > 0} className={primaryBtn}>Confirmar</button>
        {back()}
      </form>
    );
  } else if (view === 'recovery') {
    body = (
      <form onSubmit={(e) => { e.preventDefault(); void submitRecovery(); }} className="space-y-3">
        <p className="text-xs text-slate-400">Digite o código de recuperação que apareceu quando o bloqueio foi ativado.</p>
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="XXXX-XXXX-XXXX" className={`${input} text-center tracking-widest uppercase`} />
        {waitBox || errorBox}
        <button type="submit" disabled={busy || waitSeconds > 0} className={primaryBtn}>Confirmar</button>
        {back()}
      </form>
    );
  } else if (view === 'password') {
    body = (
      <form onSubmit={(e) => { e.preventDefault(); void submitPassword(); }} className="space-y-3">
        <p className="text-xs text-slate-400">Digite a senha de uma das suas contas. O Anectta confere direto no servidor de e-mail.</p>
        {accounts.length > 1 && (
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={input}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.email}</option>
            ))}
          </select>
        )}
        {accounts.length === 1 && <p className="text-sm text-white">{accounts[0].email}</p>}
        <input autoFocus type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Senha da conta de e-mail" className={input} />
        {waitBox || errorBox}
        <button type="submit" disabled={busy || !value || waitSeconds > 0} className={primaryBtn}>
          {busy ? 'Conferindo no servidor...' : 'Confirmar'}
        </button>
        {back()}
      </form>
    );
  } else if (view === 'manager') {
    body = (
      <form onSubmit={(e) => { e.preventDefault(); void submitManager(); }} className="space-y-3">
        <p className="text-xs text-slate-400">
          O Anectta envia um código para o seu gestor (<strong className="text-slate-200">{config.managerEmail}</strong>).
          Peça para ele confirmar com você e repassar o código.
        </p>
        <button type="button" onClick={() => void requestManager()} disabled={busy} className="w-full px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Enviando...' : 'Enviar código ao gestor'}
        </button>
        {info && <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">{info}</div>}
        <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Código de 8 dígitos" className={`${input} text-center tracking-[0.3em]`} />
        {waitBox || errorBox}
        <button type="submit" disabled={!value || waitSeconds > 0} className={primaryBtn}>Confirmar código</button>
        {back()}
      </form>
    );
  } else if (view === 'newPin') {
    body = (
      <form onSubmit={(e) => { e.preventDefault(); void submitNewPin(); }} className="space-y-3">
        <p className="text-xs text-emerald-300 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Identidade confirmada. Crie um PIN novo.</p>
        <input autoFocus type="password" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Novo PIN (4 a 8 dígitos)" className={input} />
        <input type="password" inputMode="numeric" value={value2} onChange={(e) => setValue2(e.target.value)} placeholder="Repita o novo PIN" className={input} />
        {errorBox}
        <button type="submit" disabled={busy || !value} className={primaryBtn}>Salvar e desbloquear</button>
      </form>
    );
  } else if (view === 'newRecovery') {
    body = (
      <div className="space-y-3">
        <p className="text-xs text-slate-300">
          O código de recuperação antigo deixou de valer. Guarde o novo em local seguro (ele não aparece de novo):
        </p>
        <p className="text-center text-xl font-mono font-bold tracking-widest text-sky-200 bg-slate-900 border border-slate-700 rounded-xl py-3 select-all">
          {newRecovery}
        </p>
        <button type="button" onClick={onUnlock} className={primaryBtn}>Guardei o código — entrar</button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ background: 'radial-gradient(circle at 50% 30%, #0b1e3a 0%, #050b16 70%)' }}
      role="dialog"
      aria-label="Anectta MAIL bloqueado"
    >
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-2">
          <img src={logoImg} alt="" className="w-16 h-16 mx-auto object-contain" />
          <h1 className="text-lg font-bold text-white flex items-center justify-center gap-2">
            <Lock className="w-4 h-4 text-sky-400" /> Anectta MAIL bloqueado
          </h1>
        </div>
        <div className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 shadow-2xl">{body}</div>
      </div>
    </div>
  );
};
