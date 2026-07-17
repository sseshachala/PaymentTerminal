import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto'

function getKey(): Buffer {
  const k = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  if (k.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)')
  return k
}

function getHmacKey(): string {
  if (!process.env.HMAC_KEY) throw new Error('HMAC_KEY is required')
  return process.env.HMAC_KEY
}

export function encrypt(text: string): string {
  const KEY = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(encoded: string): string {
  const KEY = getKey()
  const [ivHex, authTagHex, cipherHex] = encoded.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(cipherHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

export function hmac(text: string): string {
  return createHmac('sha256', getHmacKey()).update(text.toLowerCase().trim()).digest('hex')
}

export function encryptMaybe(text: string | undefined | null): string | null {
  if (!text) return null
  return encrypt(text)
}

export function decryptMaybe(encoded: string | undefined | null): string | null {
  if (!encoded) return null
  return decrypt(encoded)
}
