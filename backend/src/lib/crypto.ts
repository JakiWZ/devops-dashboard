import { createHash, randomBytes } from 'node:crypto';

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

// SHA-256 basta per token casuali ad alta entropia: bcrypt servirebbe solo per segreti scelti dall'utente.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
