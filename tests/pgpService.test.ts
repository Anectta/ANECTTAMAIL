import { describe, it, expect } from 'vitest';
import { PgpService } from '../src/main/services/pgpService';

describe('PgpService (OpenPGP ECC)', () => {
  it('gera par de chaves, inspeciona, criptografa e descriptografa com senha', async () => {
    const alice = await PgpService.generateKeyPair({
      name: 'Alice Corp',
      email: 'alice@anectta.test',
      passphrase: 'segredo-super-forte',
    });
    expect(alice.success).toBe(true);
    expect(alice.publicKey).toContain('-----BEGIN PGP PUBLIC KEY BLOCK-----');
    expect(alice.privateKey).toContain('-----BEGIN PGP PRIVATE KEY BLOCK-----');
    expect(alice.fingerprint).toBeTruthy();

    const inspected = await PgpService.inspectKey(alice.publicKey!);
    expect(inspected.success).toBe(true);
    expect(inspected.email).toBe('alice@anectta.test');
    expect(inspected.fingerprint).toBe(alice.fingerprint);

    const enc = await PgpService.encryptMessage({
      text: 'Relatório confidencial Q4 — Anectta MAIL',
      recipientPublicKeys: [alice.publicKey!],
      senderPrivateKey: alice.privateKey!,
      senderPassphrase: 'segredo-super-forte',
    });
    expect(enc.success).toBe(true);
    expect(enc.armored).toContain('-----BEGIN PGP MESSAGE-----');

    const dec = await PgpService.decryptOrVerify({
      armoredText: enc.armored!,
      privateKey: alice.privateKey!,
      passphrase: 'segredo-super-forte',
      senderPublicKey: alice.publicKey!,
    });
    expect(dec.success).toBe(true);
    expect(dec.mode).toBe('decrypted');
    expect(dec.plainText).toBe('Relatório confidencial Q4 — Anectta MAIL');
    expect(dec.verified).toBe(true);
  });

  it('assina mensagem em texto claro e verifica assinatura corretamente', async () => {
    const bob = await PgpService.generateKeyPair({
      name: 'Bob',
      email: 'bob@anectta.test',
    });
    expect(bob.success).toBe(true);

    const signed = await PgpService.signCleartext({
      text: 'Aprovado para pagamento.',
      senderPrivateKey: bob.privateKey!,
    });
    expect(signed.success).toBe(true);
    expect(signed.armored).toContain('-----BEGIN PGP SIGNED MESSAGE-----');

    const verified = await PgpService.decryptOrVerify({
      armoredText: signed.armored!,
      senderPublicKey: bob.publicKey!,
    });
    expect(verified.success).toBe(true);
    expect(verified.mode).toBe('verified');
    expect(verified.verified).toBe(true);
    expect(verified.plainText?.trim()).toBe('Aprovado para pagamento.');
  });

  it('retorna erro amigável ao tentar inspecionar chave inválida', async () => {
    const res = await PgpService.inspectKey('chave-invalida');
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
