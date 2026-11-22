/**
 * End-to-end encrypted file transfer (client -> server agent).
 *
 *   1. The agent holds a long-lived ECDH P-256 key pair; its public JWK is published on its
 *      `servers` row (only the agent can write that row, enforced by RLS).
 *   2. For every file the client makes a fresh ephemeral key pair, derives a shared secret with
 *      the agent's public key, runs HKDF-SHA-256 and encrypts with AES-256-GCM.
 *   3. The additional authenticated data binds the ciphertext to the server id and target path,
 *      so a stored blob can't be replayed to another server or renamed.
 *   4. The agent verifies the GCM tag and the plaintext SHA-256 before writing anything.
 *
 * Supabase Storage only ever sees ciphertext. Works in browsers, Electron, Node 20+ and Bun.
 */

const subtle = () => {
  const c = (globalThis as any).crypto;
  if (!c?.subtle) throw new Error('WebCrypto is not available');
  return c.subtle as SubtleCrypto;
};
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const INFO = new TextEncoder().encode('easyserver-transfer-v1');
const buf = (u: Uint8Array) => u as unknown as BufferSource;

export async function generateKeyPair(): Promise<{ publicJwk: JsonWebKey; privateJwk: JsonWebKey }> {
  const kp = (await subtle().generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair;
  return {
    publicJwk: await subtle().exportKey('jwk', kp.publicKey),
    privateJwk: await subtle().exportKey('jwk', kp.privateKey),
  };
}

async function deriveAesKey(priv: CryptoKey, pub: CryptoKey, salt: Uint8Array, usage: KeyUsage) {
  const bits = await subtle().deriveBits({ name: 'ECDH', public: pub }, priv, 256);
  const hk = await subtle().importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(INFO) }, hk, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

const aad = (serverId: string, path: string) => new TextEncoder().encode(`${serverId}\n${path}`);

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const h = new Uint8Array(await subtle().digest('SHA-256', buf(data)));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface Sealed {
  epk: JsonWebKey;
  iv: string; // base64, 12 bytes
  salt: string; // base64, 16 bytes
  sha256: string; // hex of plaintext
  ciphertext: Uint8Array;
}

export async function seal(serverPublicJwk: JsonWebKey, serverId: string, path: string, plain: Uint8Array): Promise<Sealed> {
  const c = (globalThis as any).crypto as Crypto;
  const serverPub = await subtle().importKey('jwk', serverPublicJwk, ECDH, false, []);
  const eph = (await subtle().generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair;
  const iv = c.getRandomValues(new Uint8Array(12));
  const salt = c.getRandomValues(new Uint8Array(16));
  const key = await deriveAesKey(eph.privateKey, serverPub, salt, 'encrypt');
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(aad(serverId, path)) }, key, buf(plain));
  return {
    epk: await subtle().exportKey('jwk', eph.publicKey),
    iv: toB64(iv),
    salt: toB64(salt),
    sha256: await sha256Hex(plain),
    ciphertext: new Uint8Array(ct),
  };
}

export async function open(
  serverPrivateJwk: JsonWebKey,
  serverId: string,
  path: string,
  sealed: Omit<Sealed, 'ciphertext'>,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const priv = await subtle().importKey('jwk', serverPrivateJwk, ECDH, false, ['deriveBits']);
  const epk = await subtle().importKey('jwk', sealed.epk, ECDH, false, []);
  const key = await deriveAesKey(priv, epk, fromB64(sealed.salt), 'decrypt');
  const plain = new Uint8Array(
    await subtle().decrypt({ name: 'AES-GCM', iv: buf(fromB64(sealed.iv)), additionalData: buf(aad(serverId, path)) }, key, buf(ciphertext)),
  );
  if ((await sha256Hex(plain)) !== sealed.sha256) throw new Error('Checksum mismatch');
  return plain;
}

/** Short, human-checkable fingerprint of a public key (shown in Settings on both sides). */
export async function fingerprint(jwk: JsonWebKey): Promise<string> {
  const hex = await sha256Hex(new TextEncoder().encode(`${jwk.x}.${jwk.y}`));
  return hex.slice(0, 16).toUpperCase().match(/.{4}/g)!.join(' ');
}
