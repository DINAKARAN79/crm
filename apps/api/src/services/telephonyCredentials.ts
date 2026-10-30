import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const VERSION = 'v2';
const LEGACY_VERSION = 'v1';

export class TelephonyCredentialError extends Error {
  constructor(message: string, public code: 'CREDENTIALS_KEY_MISSING' | 'CREDENTIALS_UNREADABLE' = 'CREDENTIALS_UNREADABLE') {
    super(message);
    this.name = 'TelephonyCredentialError';
  }
}

function keyBytes(encoded = process.env.API_KEY_ENCRYPTION_SECRET) {
  if (!encoded) {
    throw new TelephonyCredentialError(
      'Telephony credential storage is not configured. Set API_KEY_ENCRYPTION_SECRET on the API server.',
      'CREDENTIALS_KEY_MISSING',
    );
  }
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
    throw new TelephonyCredentialError('API_KEY_ENCRYPTION_SECRET must be a base64-encoded 32-byte value.', 'CREDENTIALS_KEY_MISSING');
  }
  return decoded;
}

export function encryptTelephonyToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function decryptTelephonyToken(payload: string) {
  const [version, ivPart, tagPart, dataPart] = payload.split(':');
  if ((version !== VERSION && version !== LEGACY_VERSION) || !ivPart || !tagPart || !dataPart) {
    throw new TelephonyCredentialError('Telephony credentials could not be read. Save the auth token again.', 'CREDENTIALS_UNREADABLE');
  }
  try {
    const key = version === LEGACY_VERSION
      ? (() => {
        const legacy = process.env.TELEPHONY_CREDENTIALS_KEY?.trim();
        if (!legacy) throw new TelephonyCredentialError('Legacy telephony credentials require migration.', 'CREDENTIALS_KEY_MISSING');
        const decoded = Buffer.from(legacy, 'base64');
        return decoded.length === 32 ? decoded : createHash('sha256').update(legacy).digest();
      })()
      : keyBytes();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    if (error instanceof TelephonyCredentialError) throw error;
    throw new TelephonyCredentialError('Telephony credentials could not be read. Save the auth token again.', 'CREDENTIALS_UNREADABLE');
  }
}
