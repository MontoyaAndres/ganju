import { Context } from 'hono';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { getEnv } from './getEnv';
import { base64ToBytes, bytesToBase64 } from './base64';

const PREFIX = 'enc:v1:';
const NONCE_BYTES = 24;
const KEY_BYTES = 32;
const KEY_ENV = 'CRYPTO_SECRET';

export const getCredentialEncryptionKey = (c: Context) => {
  const rawKey = getEnv(c, KEY_ENV);
  if (!rawKey) {
    throw new Error(`Missing env: ${KEY_ENV}`);
  }
  return rawKey;
};

const loadKey = (rawKey: string) => {
  const bytes = base64ToBytes(rawKey);
  if (bytes.length !== KEY_BYTES) {
    throw new Error(
      `CRYPTO_SECRET must decode to ${KEY_BYTES} bytes (got ${bytes.length})`
    );
  }
  return bytes;
};

export const encryptString = (plaintext: string, rawKey: string) => {
  const key = loadKey(rawKey);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const cipher = xchacha20poly1305(key, nonce);
  const ciphertext = cipher.encrypt(new TextEncoder().encode(plaintext));
  const bundle = new Uint8Array(nonce.length + ciphertext.length);
  bundle.set(nonce, 0);
  bundle.set(ciphertext, nonce.length);
  return `${PREFIX}${bytesToBase64(bundle)}`;
};

export const decryptString = (value: string, rawKey: string) => {
  if (!value.startsWith(PREFIX)) return value;
  const bundle = base64ToBytes(value.slice(PREFIX.length));
  const nonce = bundle.slice(0, NONCE_BYTES);
  const ciphertext = bundle.slice(NONCE_BYTES);
  const key = loadKey(rawKey);
  const cipher = xchacha20poly1305(key, nonce);
  const plaintext = cipher.decrypt(ciphertext);
  return new TextDecoder().decode(plaintext);
};

export const sha256Hex = async (input: string) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  );
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

export const hmacSha256Hex = async (key: string, message: string) => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(message)
  );
  const bytes = new Uint8Array(signature);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

export const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};
