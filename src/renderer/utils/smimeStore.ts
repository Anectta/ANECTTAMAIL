export interface OwnSmimeCert {
  id: string;
  email: string;
  commonName: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
  certPem: string;
  privateKeyPem: string;
  addedAt: string;
}

export interface ContactSmimeCert {
  id: string;
  email: string;
  commonName: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
  certPem: string;
  addedAt: string;
}

export interface SmimeStoreData {
  ownCerts: OwnSmimeCert[];
  contactCerts: ContactSmimeCert[];
}

const SMIME_STORAGE_KEY = 'anectta_smime_store_v1';

export function loadSmimeStore(): SmimeStoreData {
  try {
    const raw = localStorage.getItem(SMIME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ownCerts: Array.isArray(parsed?.ownCerts) ? parsed.ownCerts : [],
        contactCerts: Array.isArray(parsed?.contactCerts) ? parsed.contactCerts : [],
      };
    }
  } catch {
    // fallback
  }
  return { ownCerts: [], contactCerts: [] };
}

export function saveSmimeStore(data: SmimeStoreData): void {
  try {
    localStorage.setItem(SMIME_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function findOwnSmimeCertByEmail(email?: string): OwnSmimeCert | undefined {
  const clean = (email || '').trim().toLowerCase();
  const store = loadSmimeStore();
  if (!clean) return store.ownCerts[0];
  return (
    store.ownCerts.find((c) => c.email.trim().toLowerCase() === clean) ||
    store.ownCerts[0]
  );
}

export function findSmimeCertsForRecipients(recipientStr: string): {
  foundCerts: string[];
  missingEmails: string[];
} {
  const store = loadSmimeStore();
  const tokens = (recipientStr || '')
    .split(/[,;]/)
    .map((t) => {
      const m = t.match(/<([^>]+)>/);
      return (m ? m[1] : t).trim().toLowerCase();
    })
    .filter((t) => t.includes('@'));

  const foundCerts: string[] = [];
  const missingEmails: string[] = [];

  for (const addr of tokens) {
    const contact = store.contactCerts.find((c) => c.email.trim().toLowerCase() === addr);
    const own = store.ownCerts.find((c) => c.email.trim().toLowerCase() === addr);
    if (contact) foundCerts.push(contact.certPem);
    else if (own) foundCerts.push(own.certPem);
    else missingEmails.push(addr);
  }

  return { foundCerts, missingEmails };
}

export function detectSmimeBlock(body?: string): string | null {
  if (!body) return null;
  const match = body.match(/-----BEGIN PKCS7-----[\s\S]+?-----END PKCS7-----/);
  return match ? match[0] : null;
}
