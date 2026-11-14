import { generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { validate } from '../release.mjs'

const folder=process.argv[2]
if(!folder) throw Error('Supply the staging bundle directory')
const path=name=>join(folder,name)
const manifest=readFileSync(path('release.json'))
const meta=JSON.parse(manifest)
if(meta.version!=='0.0.1'||meta.channel!=='staging'||meta.nodeVersion!=='22.23.5')throw Error('Only lab staging version 0.0.1 for Node 22.23.5 may be signed')
const {publicKey,privateKey}=generateKeyPairSync('ed25519')
const signature=sign(null,manifest,privateKey)
writeFileSync(path('release-public.pem'),publicKey.export({format:'pem',type:'spki'}),{flag:'wx'})
writeFileSync(path('release.sig'),signature,{flag:'wx'})
await validate(path('release.json'),path('release.sig'),publicKey,path('oarlinks.zip'),'staging')
console.log('Lab bundle signature and archive verified; private key was never written.')
