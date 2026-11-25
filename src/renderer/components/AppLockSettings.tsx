import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { KeyRound, Lock, Smartphone, UserCheck } from 'lucide-react';
import {
  APP_LOCK_EVENT,
  DEFAULT_APP_LOCK,
  generateRecoveryCode,
  generateTotpSecret,
  hashSecret,
  loadAppLock,
  otpauthUri,
  saveAppLock,
  validatePin,
  verifySecret,
  verifyTotp,
  type AppLockConfig,
} from '../utils/appLock';

const input =
  'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500';
const btn = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors';
const IDLE_OPTIONS = [
  { v: 5, l: '5 minutos parado' },
  { v: 15, l: '15 minutos parado' },
  { v: 30, l: '30 minutos parado' },
  { v: 0, l: 'Só ao abrir o app' },
];
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** QR Code do app autenticador + confirmação com o código atual. */
const TotpLink: React.FC<{ onLinked: (secret: string) => void; onSkip?: () => void }> = ({ onLinked, onSkip }) => {
  const [secret] = useState(generateTotpSecret);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void QRCode.toDataURL(otpauthUri(secret, 'Bloqueio'), { margin: 1, width: 180 }).then(setQr).catch(() => setQr(''));
  }, [secret]);
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400">
        Abra um app autenticador no celular (Google Authenticator, Microsoft Authenticator, Authy…), toque em "adicionar"
        e aponte a câmera para o QR Code. Depois digite o código de 6 dígitos que aparecer.
      </p>
      <div className="flex items-center gap-3">
        {qr ? <img src={qr} alt="QR Code para o app autenticador" className="w-36 h-36 rounded-lg bg-white p-1" /> : <div className="w-36 h-36 rounded-lg bg-slate-800" />}
        <div className="text-[10px] text-slate-500 break-all">
          Sem câmera? Digite esta chave no app:
          <span className="block font-mono text-slate-300 mt-1 select-all">{secret}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <input inputMode="numeric" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código de 6 dígitos" className={input} />
        <button
          type="button"
          onClick={async () => {
            if (await verifyTotp(secret, code)) onLinked(secret);
            else setError('Código incorreto. Confira se o celular está com a hora certa.');
          }}
          className={`${btn} bg-brand-600 hover:bg-brand-500 text-white shrink-0`}
        >
          Vincular
        </button>
        {onSkip && (
          <button type="button" onClick={onSkip} className={`${btn} text-slate-400 hover:text-white shrink-0`}>
            Pular
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-rose-300">{error}</p>}
    </div>
  );
};

/**
 * Configuração do bloqueio do Anectta (desligado por padrão). Ativação em passos e, depois,
 * qualquer alteração pede o PIN atual.
 */
export const AppLockSettings: React.FC = () => {
  const [cfg, setCfg] = useState<AppLockConfig>(loadAppLock);
  useEffect(() => {
    const reload = () => setCfg(loadAppLock());
    window.addEventListener(APP_LOCK_EVENT, reload);
    return () => window.removeEventListener(APP_LOCK_EVENT, reload);
  }, []);

  // Assistente de ativação
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [draft, setDraft] = useState<AppLockConfig>({ ...DEFAULT_APP_LOCK });
  const [recoveryShown, setRecoveryShown] = useState('');
  const [saved, setSaved] = useState(false);
  const [manager, setManager] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Ações com o bloqueio ligado (pedem o PIN atual)
  const [action, setAction] = useState<null | 'idle' | 'pin' | 'phone' | 'manager' | 'recovery' | 'disable'>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [pinOk, setPinOk] = useState(false);
  const [idle, setIdle] = useState(cfg.idleMinutes);
  const [lockMin, setLockMin] = useState(Boolean(cfg.lockOnMinimize));
  const [msg, setMsg] = useState<string | null>(null);

  const startSetup = () => {
    setStep(1);
    setPin1('');
    setPin2('');
    setManager('');
    setSaved(false);
    setError(null);
    setDraft({ ...DEFAULT_APP_LOCK });
  };

  const finishSetup = (extra: Partial<AppLockConfig>) => {
    const final = { ...draft, ...extra, enabled: true };
    saveAppLock(final);
    setCfg(final);
    setStep(0);
    setMsg('Bloqueio ativado. Ele começa a valer a partir de agora.');
  };

  const openAction = (a: NonNullable<typeof action>) => {
    setAction(a);
    setCurrentPin('');
    setPinOk(false);
    setError(null);
    setMsg(null);
    setIdle(cfg.idleMinutes);
    setLockMin(Boolean(cfg.lockOnMinimize));
    setPin1('');
    setPin2('');
    setManager(cfg.managerEmail || '');
    setRecoveryShown('');
  };

  const checkPin = async () => {
    if (await verifySecret(currentPin, cfg.pin)) {
      setPinOk(true);
      setError(null);
      if (action === 'disable') {
        saveAppLock({ ...DEFAULT_APP_LOCK });
        setCfg({ ...DEFAULT_APP_LOCK });
        setAction(null);
        setMsg('Bloqueio desativado.');
      } else if (action === 'recovery') {
        const code = generateRecoveryCode();
        const updated = { ...cfg, recovery: await hashSecret(code) };
        saveAppLock(updated);
        setCfg(updated);
        setRecoveryShown(code);
      }
    } else setError('PIN incorreto.');
  };

  const save = (patch: Partial<AppLockConfig>, done: string) => {
    const updated = { ...cfg, ...patch };
    saveAppLock(updated);
    setCfg(updated);
    setAction(null);
    setMsg(done);
  };

  // ---------------------------------------------------------------- render

  if (step > 0) {
    return (
      <div className="p-4 bg-slate-950/80 border border-brand-500/40 rounded-xl space-y-3">
        <div className="text-xs font-semibold text-slate-100 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-sky-400" /> Ativar bloqueio do Anectta — passo {step} de 4
        </div>

        {step === 1 && (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-400">Crie um PIN de 4 a 8 dígitos (ou uma senha de 6+ caracteres).</p>
            <input type="password" inputMode="numeric" value={pin1} onChange={(e) => setPin1(e.target.value)} placeholder="PIN" className={input} autoFocus />
            <input type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value)} placeholder="Repita o PIN" className={input} />
            {error && <p className="text-[11px] text-rose-300">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const problem = validatePin(pin1);
                  if (problem) return setError(problem);
                  if (pin1 !== pin2) return setError('Os dois PINs não são iguais.');
                  const code = generateRecoveryCode();
                  setDraft({ ...draft, pin: await hashSecret(pin1), recovery: await hashSecret(code) });
                  setRecoveryShown(code);
                  setError(null);
                  setStep(2);
                }}
                className={`${btn} bg-brand-600 hover:bg-brand-500 text-white`}
              >
                Continuar
              </button>
              <button type="button" onClick={() => setStep(0)} className={`${btn} text-slate-400 hover:text-white`}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" /> Seu código de recuperação. Guarde em local seguro: ele
              aparece só agora e serve para criar um PIN novo se você esquecer.
            </p>
            <p className="text-center text-lg font-mono font-bold tracking-widest text-sky-200 bg-slate-900 border border-slate-700 rounded-xl py-2.5 select-all">
              {recoveryShown}
            </p>
            <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> Guardei este código em local seguro
            </label>
            <button type="button" disabled={!saved} onClick={() => setStep(3)} className={`${btn} bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white`}>
              Continuar
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-200 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-sky-400" /> Vincular o celular (opcional)
            </p>
            <TotpLink
              onLinked={(secret) => {
                setDraft({ ...draft, totpSecret: secret });
                setStep(4);
              }}
              onSkip={() => setStep(4)}
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-200 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-sky-400" /> E-mail do gestor (opcional)
            </p>
            <p className="text-[11px] text-slate-400">
              Última saída se você perder todos os outros meios: o Anectta envia um código de liberação para o gestor,
              usando a sua própria conta de e-mail.
            </p>
            <input type="email" value={manager} onChange={(e) => setManager(e.target.value)} placeholder="gestor@empresa.com.br" className={input} />
            <label className="flex items-center justify-between gap-3 text-[11px] text-slate-300">
              <span>Bloquear depois de</span>
              <select value={draft.idleMinutes} onChange={(e) => setDraft({ ...draft, idleMinutes: Number(e.target.value) })} className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100">
                {IDLE_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>{o.l}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
              <input type="checkbox" checked={Boolean(draft.lockOnMinimize)} onChange={(e) => setDraft({ ...draft, lockOnMinimize: e.target.checked })} />
              Bloquear também ao minimizar ou recolher para a bandeja
            </label>
            {error && <p className="text-[11px] text-rose-300">{error}</p>}
            <button
              type="button"
              onClick={() => {
                if (manager.trim() && !isEmail(manager)) return setError('E-mail do gestor inválido.');
                finishSetup({ managerEmail: manager.trim() || undefined });
              }}
              className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white`}
            >
              Concluir e ativar
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-sky-400" /> Bloquear o Anectta com PIN
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${cfg.enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
              {cfg.enabled ? 'Ativado' : 'Desativado'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Pede o PIN ao abrir o app e depois de um tempo parado. Se esquecer: código do celular, código de recuperação,
            senha de uma conta de e-mail ou liberação pelo gestor. É uma trava de tela: protege contra quem usa o
            computador na sua ausência, mas não criptografa os arquivos do disco.
          </p>
        </div>
        {!cfg.enabled && (
          <button type="button" onClick={startSetup} className={`${btn} bg-brand-600 hover:bg-brand-500 text-white shrink-0`}>
            Ativar
          </button>
        )}
      </div>

      {cfg.enabled && (
        <>
          <div className="text-[11px] text-slate-400 space-y-0.5">
            <p>
              Bloqueia: {IDLE_OPTIONS.find((o) => o.v === cfg.idleMinutes)?.l.toLowerCase() || `${cfg.idleMinutes} min`}
              {cfg.lockOnMinimize ? ' e ao minimizar' : ''} · atalho Ctrl+Shift+L
            </p>
            <p>Celular vinculado: {cfg.totpSecret ? 'sim' : 'não'} · Gestor: {cfg.managerEmail || 'não informado'}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => window.dispatchEvent(new Event('anectta:lock-now'))} className={`${btn} bg-sky-700 hover:bg-sky-600 text-white`}>
              Bloquear agora
            </button>
            {([
              ['idle', 'Tempo de bloqueio'],
              ['pin', 'Trocar PIN'],
              ['phone', cfg.totpSecret ? 'Trocar/desvincular celular' : 'Vincular celular'],
              ['manager', 'E-mail do gestor'],
              ['recovery', 'Novo código de recuperação'],
              ['disable', 'Desativar bloqueio'],
            ] as const).map(([a, label]) => (
              <button
                key={a}
                type="button"
                onClick={() => openAction(a)}
                className={`${btn} border ${a === 'disable' ? 'border-rose-500/40 text-rose-300 hover:bg-rose-500/10' : 'border-slate-700 text-slate-200 hover:bg-slate-800'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {action && !pinOk && (
            <div className="flex gap-2 items-center">
              <input type="password" inputMode="numeric" autoFocus value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void checkPin()} placeholder="Confirme com o PIN atual" className={input} />
              <button type="button" onClick={() => void checkPin()} className={`${btn} bg-brand-600 hover:bg-brand-500 text-white shrink-0`}>
                Confirmar
              </button>
              <button type="button" onClick={() => setAction(null)} className={`${btn} text-slate-400 hover:text-white shrink-0`}>
                Cancelar
              </button>
            </div>
          )}

          {action && pinOk && action === 'idle' && (
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <select value={idle} onChange={(e) => setIdle(Number(e.target.value))} className={input}>
                  {IDLE_OPTIONS.map((o) => (
                    <option key={o.v} value={o.v}>{o.l}</option>
                  ))}
                </select>
                <button type="button" onClick={() => save({ idleMinutes: idle, lockOnMinimize: lockMin }, 'Tempo de bloqueio atualizado.')} className={`${btn} bg-brand-600 text-white shrink-0`}>Salvar</button>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                <input type="checkbox" checked={lockMin} onChange={(e) => setLockMin(e.target.checked)} />
                Bloquear também ao minimizar ou recolher para a bandeja
              </label>
            </div>
          )}
          {action && pinOk && action === 'pin' && (
            <div className="space-y-2">
              <input type="password" inputMode="numeric" value={pin1} onChange={(e) => setPin1(e.target.value)} placeholder="Novo PIN" className={input} />
              <input type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value)} placeholder="Repita o novo PIN" className={input} />
              <button
                type="button"
                onClick={async () => {
                  const problem = validatePin(pin1);
                  if (problem) return setError(problem);
                  if (pin1 !== pin2) return setError('Os dois PINs não são iguais.');
                  save({ pin: await hashSecret(pin1) }, 'PIN trocado.');
                }}
                className={`${btn} bg-brand-600 text-white`}
              >
                Salvar novo PIN
              </button>
            </div>
          )}
          {action && pinOk && action === 'phone' && (
            <div className="space-y-2">
              <TotpLink onLinked={(secret) => save({ totpSecret: secret }, 'Celular vinculado.')} />
              {cfg.totpSecret && (
                <button type="button" onClick={() => save({ totpSecret: undefined }, 'Celular desvinculado.')} className={`${btn} border border-rose-500/40 text-rose-300`}>
                  Desvincular celular atual
                </button>
              )}
            </div>
          )}
          {action && pinOk && action === 'manager' && (
            <div className="flex gap-2 items-center">
              <input type="email" value={manager} onChange={(e) => setManager(e.target.value)} placeholder="gestor@empresa.com.br (vazio = remover)" className={input} />
              <button
                type="button"
                onClick={() => {
                  if (manager.trim() && !isEmail(manager)) return setError('E-mail do gestor inválido.');
                  save({ managerEmail: manager.trim() || undefined }, manager.trim() ? 'E-mail do gestor salvo.' : 'E-mail do gestor removido.');
                }}
                className={`${btn} bg-brand-600 text-white shrink-0`}
              >
                Salvar
              </button>
            </div>
          )}
          {action === 'recovery' && recoveryShown && (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-400">Novo código de recuperação (o anterior deixou de valer). Guarde em local seguro:</p>
              <p className="text-center text-lg font-mono font-bold tracking-widest text-sky-200 bg-slate-900 border border-slate-700 rounded-xl py-2.5 select-all">{recoveryShown}</p>
              <button type="button" onClick={() => setAction(null)} className={`${btn} bg-brand-600 text-white`}>Guardei</button>
            </div>
          )}
          {error && <p className="text-[11px] text-rose-300">{error}</p>}
        </>
      )}
      {msg && <p className="text-[11px] text-emerald-300">{msg}</p>}
    </div>
  );
};
