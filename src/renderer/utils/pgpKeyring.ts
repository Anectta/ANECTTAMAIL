export interface OwnPgpKey {
  id: string;
  email: string;
  name: string;
  fingerprint: string;
  publicKey: string;
  privateKey: string;
  hasPassphrase: boolean;
  createdAt: string;
}

export interface ContactPgpKey {
  id: string;
  email: string;
  name: string;
  fingerprint: string;
  publicKey: string;
  addedAt: string;
}

export interface PgpKeyringData {
  ownKeys: OwnPgpKey[];
  contactKeys: ContactPgpKey[];
}

const PGP_KEYRING_STORAGE_KEY = 'anectta_pgp_keyring_v1';

export function loadPgpKeyring(): PgpKeyringData {
  try {
    const raw = localStorage.getItem(PGP_KEYRING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ownKeys: Array.isArray(parsed?.ownKeys) ? parsed.ownKeys : [],
        contactKeys: Array.isArray(parsed?.contactKeys) ? parsed.contactKeys : [],
      };
    }
  } catch {
    // fallback
  }
  return { ownKeys: [], contactKeys: [] };
}

export function savePgpKeyring(data: PgpKeyringData): void {
  try {
    localStorage.setItem(PGP_KEYRING_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function findOwnKeyByEmail(email?: string): OwnPgpKey | undefined {
  const clean = (email || '').trim().toLowerCase();
  const keyring = loadPgpKeyring();
  if (!clean) return keyring.ownKeys[0];
  return (
    keyring.ownKeys.find((k) => k.email.trim().toLowerCase() === clean) ||
    keyring.ownKeys[0]
  );
}

export function findPublicKeysForRecipients(recipientStr: string): {
  foundKeys: string[];
  missingEmails: string[];
} {
  const keyring = loadPgpKeyring();
  const tokens = (recipientStr || '')
    .split(/[,;]/)
    .map((t) => {
      const m = t.match(/<([^>]+)>/);
      return (m ? m[1] : t).trim().toLowerCase();
    })
    .filter((t) => t.includes('@'));

  const foundKeys: string[] = [];
  const missingEmails: string[] = [];

  for (const addr of tokens) {
    const contact = keyring.contactKeys.find((k) => k.email.trim().toLowerCase() === addr);
    const own = keyring.ownKeys.find((k) => k.email.trim().toLowerCase() === addr);
    if (contact) foundKeys.push(contact.publicKey);
    else if (own) foundKeys.push(own.publicKey);
    else missingEmails.push(addr);
  }

  return { foundKeys, missingEmails };
}

export function findContactPublicKeyByEmail(email?: string): ContactPgpKey | undefined {
  const clean = (email || '').trim().toLowerCase();
  if (!clean) return undefined;
  const keyring = loadPgpKeyring();
  return keyring.contactKeys.find((k) => k.email.trim().toLowerCase() === clean);
}

export function detectPgpBlock(body?: string): {
  type: 'encrypted' | 'signed';
  block: string;
} | null {
  if (!body) return null;
  const encMatch = body.match(
    /-----BEGIN PGP MESSAGE-----[\s\S]+?-----END PGP MESSAGE-----/
  );
  if (encMatch) {
    return { type: 'encrypted', block: encMatch[0] };
  }
  const sigMatch = body.match(
    /-----BEGIN PGP SIGNED MESSAGE-----[\s\S]+?-----END PGP SIGNATURE-----/
  );
  if (sigMatch) {
    return { type: 'signed', block: sigMatch[0] };
  }
  return null;
}
