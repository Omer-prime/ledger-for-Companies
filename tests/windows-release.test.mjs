import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash,generateKeyPairSync,sign } from 'node:crypto'
import { mkdtemp,writeFile,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newer,validate } from '../scripts/windows/release.mjs'

test('Windows updater enforces monotonic numeric versions',()=>{
 assert.equal(newer('1.10.0','1.9.9'),true)
 assert.equal(newer('1.0.0','1.0.0'),false)
 assert.equal(newer('0.9.0','1.0.0'),false)
 assert.throws(()=>newer('../1.0.0','1.0.0'))
})
test('Windows release checks signed bytes, channel, schema epoch and package digest',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'oarlinks-release-'))
 try{
  const {publicKey,privateKey}=generateKeyPairSync('ed25519')
  const [m,s,a]=['manifest','signature','archive'].map(name=>join(temp,name))
  const archive=Buffer.from('disposable archive')
  await writeFile(a,archive)
  const meta={version:'1.2.3',channel:'stable',platform:'win32-x64',dataEpoch:1,rollbackCompatible:true,commit:'ab'.repeat(20),sha256:createHash('sha256').update(archive).digest('hex'),nodeVersion:process.versions.node}
  async function signed(value){const payload=Buffer.from(JSON.stringify(value));await writeFile(m,payload);await writeFile(s,sign(null,payload,privateKey))}
  await signed(meta)
  assert.equal((await validate(m,s,publicKey,a,'stable')).version,'1.2.3')
  await assert.rejects(validate(m,s,publicKey,a,'staging'),/Incompatible/)
  await writeFile(a,'modified')
  await assert.rejects(validate(m,s,publicKey,a,'stable'),/checksum/)
  await signed({...meta,dataEpoch:2})
  await assert.rejects(validate(m,s,publicKey,a,'stable'),/Incompatible/)
  await writeFile(m,'modified')
  await assert.rejects(validate(m,s,publicKey,a,'stable'),/signature/)
 }finally{await rm(temp,{recursive:true,force:true})}
})
