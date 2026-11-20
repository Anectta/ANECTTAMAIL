import * as openpgp from 'openpgp';

export interface PgpGeneratedKeyResult {
  success: boolean;
  publicKey?: string;
  privateKey?: string;
  fingerprint?: string;
  createdAt?: string;
  error?: string;
}

export interface PgpInspectKeyResult {
  success: boolean;
  name?: string;
  email?: string;
  fingerprint?: string;
  isPrivate?: boolean;
  error?: string;
}

export class PgpService {
  /**
   * Generates a modern ECC (Curve25519) OpenPGP key pair.
   */
  public static async generateKeyPair(params: {
    name: string;
    email: string;
    passphrase?: string;
  }): Promise<PgpGeneratedKeyResult> {
    try {
      const { privateKey, publicKey } = await openpgp.generateKey({
        type: 'ecc',
        userIDs: [{ name: params.name || params.email, email: params.email }],
        passphrase: params.passphrase || undefined,
        format: 'armored',
      });
      const parsedPub = await openpgp.readKey({ armoredKey: publicKey });
      return {
        success: true,
        publicKey,
        privateKey,
        fingerprint: parsedPub.getFingerprint().toUpperCase(),
        createdAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Falha ao gerar par de chaves OpenPGP.' };
    }
  }

  /**
   * Parses an armored public/private PGP key to extract metadata.
   */
  public static async inspectKey(armoredKey: string): Promise<PgpInspectKeyResult> {
    try {
      const key = await openpgp.readKey({ armoredKey: armoredKey.trim() });
      const primary = await key.getPrimaryUser();
      const uid = primary?.user?.userID;
      return {
        success: true,
        name: uid?.name || '',
        email: uid?.email || '',
        fingerprint: key.getFingerprint().toUpperCase(),
        isPrivate: key.isPrivate(),
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Chave OpenPGP inválida.' };
    }
  }

  /**
   * Encrypts (and optionally signs) a text message into an armored PGP MESSAGE block.
   */
  public static async encryptMessage(params: {
    text: string;
    recipientPublicKeys: string[];
    senderPrivateKey?: string;
    senderPassphrase?: string;
  }): Promise<{ success: boolean; armored?: string; error?: string }> {
    try {
      const encryptionKeys = await Promise.all(
        params.recipientPublicKeys.map((armoredKey) => openpgp.readKey({ armoredKey }))
      );

      let signingKeys: openpgp.PrivateKey | undefined;
      if (params.senderPrivateKey) {
        const priv = await openpgp.readPrivateKey({ armoredKey: params.senderPrivateKey });
        signingKeys = priv.isDecrypted()
          ? priv
          : await openpgp.decryptKey({
              privateKey: priv,
              passphrase: params.senderPassphrase || '',
            });
      }

      const message = await openpgp.createMessage({ text: params.text });
      const encrypted = await openpgp.encrypt({
        message,
        encryptionKeys,
        signingKeys,
      });

      return { success: true, armored: String(encrypted) };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao criptografar com OpenPGP.' };
    }
  }

  /**
   * Creates a cleartext signed PGP message (readable without decryption, verifiable integrity).
   */
  public static async signCleartext(params: {
    text: string;
    senderPrivateKey: string;
    senderPassphrase?: string;
  }): Promise<{ success: boolean; armored?: string; error?: string }> {
    try {
      const priv = await openpgp.readPrivateKey({ armoredKey: params.senderPrivateKey });
      const signingKey = priv.isDecrypted()
        ? priv
        : await openpgp.decryptKey({
            privateKey: priv,
            passphrase: params.senderPassphrase || '',
          });

      const unsignedMessage = await openpgp.createCleartextMessage({ text: params.text });
      const signed = await openpgp.sign({
        message: unsignedMessage,
        signingKeys: signingKey,
      });

      return { success: true, armored: String(signed) };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao assinar mensagem OpenPGP.' };
    }
  }

  /**
   * Decrypts a PGP MESSAGE or verifies a PGP SIGNED MESSAGE.
   */
  public static async decryptOrVerify(params: {
    armoredText: string;
    privateKey?: string;
    passphrase?: string;
    senderPublicKey?: string;
  }): Promise<{
    success: boolean;
    mode?: 'decrypted' | 'verified';
    plainText?: string;
    verified?: boolean;
    signerKeyId?: string;
    error?: string;
  }> {
    try {
      const text = params.armoredText.trim();
      const verificationKeys = params.senderPublicKey
        ? [await openpgp.readKey({ armoredKey: params.senderPublicKey })]
        : undefined;

      // Case 1: Cleartext signed message
      if (text.includes('-----BEGIN PGP SIGNED MESSAGE-----')) {
        const cleartextMessage = await openpgp.readCleartextMessage({ cleartextMessage: text });
        const plainText = cleartextMessage.getText();
        let verified = false;
        let signerKeyId: string | undefined;

        if (verificationKeys && verificationKeys.length > 0) {
          const verifyResult = await openpgp.verify({
            message: cleartextMessage,
            verificationKeys,
          });
          if (verifyResult.signatures.length > 0) {
            signerKeyId = verifyResult.signatures[0].keyID.toHex().toUpperCase();
            try {
              await verifyResult.signatures[0].verified;
              verified = true;
            } catch {
              verified = false;
            }
          }
        }
        return {
          success: true,
          mode: 'verified',
          plainText,
          verified,
          signerKeyId,
        };
      }

      // Case 2: Encrypted PGP MESSAGE
      if (!params.privateKey) {
        return {
          success: false,
          error: 'Chave privada OpenPGP não encontrada para esta conta. Gere ou importe em Configurações → Privacidade.',
        };
      }

      const priv = await openpgp.readPrivateKey({ armoredKey: params.privateKey });
      const decryptionKey = priv.isDecrypted()
        ? priv
        : await openpgp.decryptKey({
            privateKey: priv,
            passphrase: params.passphrase || '',
          });

      const message = await openpgp.readMessage({ armoredMessage: text });
      const { data: decrypted, signatures } = await openpgp.decrypt({
        message,
        decryptionKeys: decryptionKey,
        verificationKeys,
      });

      let verified = false;
      let signerKeyId: string | undefined;
      if (signatures && signatures.length > 0) {
        signerKeyId = signatures[0].keyID.toHex().toUpperCase();
        try {
          await signatures[0].verified;
          verified = true;
        } catch {
          verified = false;
        }
      }

      return {
        success: true,
        mode: 'decrypted',
        plainText: String(decrypted),
        verified,
        signerKeyId,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Falha ao descriptografar/verificar mensagem OpenPGP (verifique a senha da chave).',
      };
    }
  }
}
