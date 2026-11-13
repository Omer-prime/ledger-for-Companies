import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import mongoose from 'mongoose'

test('journal posting retries and a single reversal preserve the original entry', async () => {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:37171/?replicaSet=phase0&directConnection=true'
  process.env.MONGODB_DATABASE = 'oarlinks_disposable_onboarding_journal'
  const mongooseUrl = pathToFileURL(createRequire(import.meta.url).resolve('mongoose')).href
  const hook = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'mongoose' && context.parentURL?.endsWith('/models/Account.ts')) {
        const shim = 'import mongoose from ' + JSON.stringify(mongooseUrl) + '; export const { Schema, model, models } = mongoose;'
        return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(shim) }
      }
      if (specifier === '@/lib/auth') {
        return { shortCircuit: true, url: 'data:text/javascript,import {createHash} from "node:crypto";export const digest=(input)=>createHash("sha256").update(input).digest("hex");' }
      }
      if (specifier.startsWith('@/')) {
        return next(new URL('../src/' + specifier.slice(2) + '.ts', import.meta.url).href, context)
      }
      return next(specifier, context)
    },
  })
  try {
    const { dbConnect } = await import('../src/lib/db.ts')
    const { postJournal } = await import('../src/lib/journal-posting.ts')
    const connection = (await dbConnect()).connection
    assert.equal((await connection.db.admin().command({ hello: 1 })).setName, 'phase0')
    assert.deepEqual(await connection.db.listCollections({ name: 'journal_entries' }).toArray(), [])
    const accountId = String((await connection.collection('accounts').insertOne({ type: 'gl', name: 'Fixture receivable' })).insertedId)
    const incomeId = String((await connection.collection('accounts').insertOne({ type: 'gl', name: 'Fixture income' })).insertedId)
    const posting = {
      sourceEventId: 'journal-fixture-original', actor: 'fixture', reason: 'Fixture sale',
      lines: [{ accountId, debitPaisa: 300, creditPaisa: 0 }, { accountId: incomeId, debitPaisa: 0, creditPaisa: 300 }],
    }
    const stock = connection.collection('journal_test_stock')
    await assert.rejects(connection.transaction(async session => {
      await stock.insertOne({ sourceEventId: posting.sourceEventId }, { session })
      await postJournal(posting, session)
      throw new Error('Rollback fixture')
    }), /Rollback fixture/)
    assert.equal(await stock.countDocuments(), 0)
    assert.equal(await connection.collection('journal_entries').countDocuments(), 0)
    const original = await connection.transaction(async session => {
      await stock.insertOne({ sourceEventId: posting.sourceEventId }, { session })
      const entry = await postJournal(posting, session)
      assert.deepEqual(await postJournal(posting, session), entry)
      return entry
    })
    assert.equal(await stock.countDocuments(), 1)
    assert.deepEqual(await postJournal(posting), original)
    await assert.rejects(postJournal({ ...posting, reason: 'Changed payload' }), /idempotency conflict/)
    const reversal = {
      ...posting, sourceEventId: 'journal-fixture-reversal', reverses: original._id, reason: 'Fixture return',
    }
    const reversed = await postJournal(reversal)
    assert.equal(reversed.lines[0].creditPaisa, 300)
    assert.equal(reversed.lines[1].debitPaisa, 300)
    assert.deepEqual(await postJournal(reversal), reversed)
    await assert.rejects(postJournal({ ...reversal, sourceEventId: 'journal-fixture-reversal-again' }), { code: 11000 })
    assert.deepEqual(await connection.collection('journal_entries').findOne({ _id: original._id }), original)
    assert.equal(await connection.collection('journal_entries').countDocuments(), 2)
  } finally {
    await mongoose.disconnect()
    hook.deregister()
  }
})
