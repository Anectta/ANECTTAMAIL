import { app, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import tls from 'tls';

/**
 * Confiança de certificados TLS por servidor.
 * - Por padrão TODO servidor é validado (rejectUnauthorized: true).
 * - Se o certificado for inválido (autoassinado, vencido, etc.), o usuário é
 *   perguntado UMA vez e a decisão fica salva por host (com a impressão digital exibida).
 */

const CERT_ERROR_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_UNTRUSTED',
  'HOSTNAME_MISMATCH',
]);

let trusted: Set<string> | null = null;
const verifiedThisSession = new Set<string>();

function storeFile(): string {
  return path.join(app.getPath('userData'), 'tls-trusted-hosts.json');
}

function loadTrusted(): Set<string> {
  if (trusted) return trusted;
  trusted = new Set<string>();
  try {
    const raw = JSON.parse(fs.readFileSync(storeFile(), 'utf-8'));
    if (Array.isArray(raw)) {
      for (const h of raw) if (typeof h === 'string') trusted.add(h.toLowerCase());
    }
  } catch {
    // arquivo inexistente ou inválido: lista vazia
  }
  return trusted;
}

function persistTrusted(): void {
  try {
    fs.writeFileSync(storeFile(), JSON.stringify([...loadTrusted()], null, 2), 'utf-8');
  } catch (e) {
    console.warn('[TLS] Falha ao salvar lista de servidores confiáveis:', e);
  }
}

/** true somente se o usuário aprovou explicitamente este host. */
export function isTlsHostTrusted(host?: string): boolean {
  return !!host && loadTrusted().has(host.toLowerCase());
}

function probe(host: string, port: number, rejectUnauthorized: boolean) {
  return new Promise<{ ok: boolean; code?: string; fingerprint?: string }>((resolve) => {
    let done = false;
    const finish = (r: { ok: boolean; code?: string; fingerprint?: string }) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(r);
    };
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized }, () => {
      let fingerprint: string | undefined;
      try {
        fingerprint = socket.getPeerCertificate()?.fingerprint256;
      } catch {
        // ignore
      }
      finish({ ok: true, fingerprint });
    });
    socket.setTimeout(8000, () => finish({ ok: false, code: 'ETIMEDOUT' }));
    socket.on('error', (err: any) => finish({ ok: false, code: err?.code || err?.message }));
  });
}

/**
 * Garante que a conexão TLS segura com host:port é confiável.
 * Retorna ok=false apenas quando o certificado é inválido e o usuário recusou.
 * Erros de rede comuns (offline, recusado) retornam ok=true para o fluxo normal reportar.
 */
export async function ensureTlsTrust(
  host: string | undefined,
  port: number | undefined,
  secure: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!host || !secure) return { ok: true };
  const key = `${host.toLowerCase()}:${port || 0}`;
  if (isTlsHostTrusted(host) || verifiedThisSession.has(key)) return { ok: true };

  const strict = await probe(host, port || 993, true);
  if (strict.ok) {
    verifiedThisSession.add(key);
    return { ok: true };
  }
  if (!strict.code || !CERT_ERROR_CODES.has(strict.code)) {
    return { ok: true };
  }

  const loose = await probe(host, port || 993, false);
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const options = {
    type: 'warning' as const,
    title: 'Certificado de segurança não confiável',
    message: `O servidor "${host}" apresentou um certificado inválido (${strict.code}).`,
    detail:
      'Isso pode indicar um servidor mal configurado ou uma tentativa de interceptação da sua conexão.\n\n' +
      `Impressão digital (SHA-256):\n${loose.fingerprint || 'indisponível'}\n\n` +
      'Só continue se você confia neste servidor (por exemplo, o servidor da sua empresa).',
    buttons: ['Cancelar', 'Confiar neste servidor'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
  const res = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);

  if (res.response === 1) {
    loadTrusted().add(host.toLowerCase());
    persistTrusted();
    return { ok: true };
  }
  return {
    ok: false,
    error: `Conexão cancelada: o certificado do servidor ${host} não é confiável (${strict.code}).`,
  };
}
