import 'server-only';

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function importKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    keyCache.set(secret, key);
  }
  return key;
}

/** HMAC-SHA-256 hex. Rate-limit keys are hashed so raw IPs/contacts never reach the database. */
export async function hmacHex(secret: string, value: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await importKey(secret), encoder.encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}
