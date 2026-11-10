import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key))
  })
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  return 'scrypt-v1$' + salt + '$' + (await derive(password, salt)).toString('hex')
}

export async function verifyPassword(password: string, hash?: string) {
  const match = /^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(hash ?? '')
  const candidate = await derive(password, match?.[1] ?? '00000000000000000000000000000000')
  return !!match && timingSafeEqual(candidate, Buffer.from(match[2], 'hex'))
}
