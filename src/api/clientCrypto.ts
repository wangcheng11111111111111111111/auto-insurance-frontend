const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface EncryptedPayload {
  key_id: string
  encrypted_key: string
  iv: string
  ciphertext: string
}

interface EncryptionKeyResponse {
  success: boolean
  key_id: string
  algorithm: string
  public_key: string
}

let cachedKey: { value: EncryptionKeyResponse; expiresAt: number } | null = null

function bytesToBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

export async function fileToBase64(file: File): Promise<string> {
  return bytesToBase64(await file.arrayBuffer())
}

async function getEncryptionKey(): Promise<EncryptionKeyResponse> {
  if (cachedKey && cachedKey.expiresAt > Date.now()) return cachedKey.value
  const response = await fetch(`${API_BASE_URL}/api/auth/encryption-key`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error('无法获取前端加密公钥')
  }
  const value = (await response.json()) as EncryptionKeyResponse
  cachedKey = { value, expiresAt: Date.now() + 5 * 60 * 1000 }
  return value
}

export async function sealPayload(payload: Record<string, unknown>): Promise<EncryptedPayload> {
  if (!window.isSecureContext || !window.crypto?.subtle) {
    throw new Error('前端加密需要 HTTPS 或 localhost 环境')
  }
  const encryptionKey = await getEncryptionKey()
  const rsaKey = await window.crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(encryptionKey.public_key),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  )
  const aesKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
  ])
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const nonceBytes = window.crypto.getRandomValues(new Uint8Array(18))
  const protectedPayload = {
    ...payload,
    issued_at: Math.floor(Date.now() / 1000),
    nonce: bytesToBase64(nonceBytes),
  }
  const plaintext = new TextEncoder().encode(JSON.stringify(protectedPayload))
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext)
  const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey)
  const encryptedKey = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaKey, rawAesKey)
  return {
    key_id: encryptionKey.key_id,
    encrypted_key: bytesToBase64(encryptedKey),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  }
}
