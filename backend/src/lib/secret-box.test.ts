import { SecretBox } from './secret-box.js';

const key = Buffer.alloc(32, 1).toString('base64');

describe('SecretBox', () => {
  it('round-trips a secret without storing it in clear', () => {
    const box = new SecretBox(key);
    const encrypted = box.encrypt('ghp_secret');
    expect(encrypted).not.toContain('ghp_secret');
    expect(box.decrypt(encrypted)).toBe('ghp_secret');
  });

  it('uses a fresh IV for every encryption', () => {
    const box = new SecretBox(key);
    expect(box.encrypt('same')).not.toBe(box.encrypt('same'));
  });

  it('rejects tampered ciphertext and a different key', () => {
    const encrypted = new SecretBox(key).encrypt('ghp_secret');
    const parts = encrypted.split('.');
    const tampered = [...parts.slice(0, 3), Buffer.from('ghp_other').toString('base64url')].join(
      '.',
    );

    expect(() => new SecretBox(key).decrypt(tampered)).toThrow();
    expect(() =>
      new SecretBox(Buffer.alloc(32, 2).toString('base64')).decrypt(encrypted),
    ).toThrow();
  });
});
