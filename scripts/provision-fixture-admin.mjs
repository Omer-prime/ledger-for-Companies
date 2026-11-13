import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { resolve, dirname, basename } from 'node:path'
import mongoose from 'mongoose'
import { hashPassword } from '../src/lib/password.ts'

const uri = 'mongodb://127.0.0.1:37171/?replicaSet=phase0&directConnection=true'
const dbName = process.env.MONGODB_DATABASE
const output = process.argv[2]
if (process.env.MONGODB_URI !== uri || !/^oarlinks_disposable_[a-z0-9_]+$/.test(dbName ?? '') ||
    !output || dirname(resolve(output)) !== resolve('.phase0-validation') || !/^fixture-[a-z0-9-]+\.json$/.test(basename(output))) {
  throw new Error('Use the loopback phase0 replica set, an oarlinks_disposable_* database, and a new .phase0-validation/fixture-*.json file.')
}

async function provision() {
  const connection = await mongoose.createConnection(uri, { dbName, serverSelectionTimeoutMS: 5000 }).asPromise()
  try {
    const hello = await connection.db.admin().command({ hello: 1 })
    if (hello.setName !== 'phase0' || !hello.isWritablePrimary || (await connection.db.listCollections().toArray()).length) {
      throw new Error('An empty disposable database on the writable phase0 replica set is required.')
    }
    const email = 'disposable-admin@example.test'
    const password = randomBytes(24).toString('base64url')
    await writeFile(output, JSON.stringify({ email, password }), { flag: 'wx', mode: 0o600 })
    await connection.db.collection('users').createIndex({ email: 1 }, { unique: true })
    for (const collection of ['auth_sessions', 'auth_attempts']) {
      await connection.db.collection(collection).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    }
    await connection.db.collection('users').insertOne({
      email, passwordHash: await hashPassword(password), role: 'superadmin', disabled: false,
      createdAt: new Date(), updatedAt: new Date(),
    })
  } finally {
    await connection.close()
  }
}

await provision().catch(() => {
  process.stderr.write('Fixture provisioning failed. Check the disposable database and whether the output file already exists.\n')
  process.exitCode = 1
})
