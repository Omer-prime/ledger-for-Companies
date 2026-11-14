import { verify, createHash } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'

export const versionPattern=/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/
export function newer(a,b){
  if(!versionPattern.test(a)||!versionPattern.test(b)) throw Error('Invalid release version')
  const parts=a.split('.').map(Number), base=b.split('.').map(Number)
  for(let i=0;i<3;i++)if(parts[i]!==base[i])return parts[i]>base[i]
  return false
}
export async function validate(manifest,signature,publicKey,archive,channel){
  const bytes=readFileSync(manifest)
  if(!verify(null,bytes,publicKey,readFileSync(signature)))throw Error('Invalid release signature')
  const meta=JSON.parse(bytes)
  if(!versionPattern.test(meta.version)||!['stable','staging'].includes(channel)||meta.channel!==channel||
     meta.platform!=='win32-x64'||meta.dataEpoch!==1||meta.rollbackCompatible!==true||
     !/^[a-f0-9]{40}$/.test(meta.commit)|| !/^[a-f0-9]{64}$/.test(meta.sha256)||
     !/^22\.\d+\.\d+$/.test(meta.nodeVersion))throw Error('Incompatible release manifest')
  if(process.platform==='win32' && process.versions.node!==meta.nodeVersion)throw Error('Approved Node version differs from release build')
  const hash=createHash('sha256')
  for await(const chunk of createReadStream(archive))hash.update(chunk)
  if(hash.digest('hex')!==meta.sha256)throw Error('Release checksum mismatch')
  return meta
}
if(process.argv[2]==='verify'){
  try{const [, , ,manifest,signature,key,archive,channel]=process.argv
    console.log(JSON.stringify(await validate(manifest,signature,readFileSync(key),archive,channel)))
  }catch(error){console.error(error.message);process.exitCode=1}
}
if(process.argv[2]==='newer'){try{process.exitCode=newer(process.argv[3],process.argv[4])?0:2}catch{process.exitCode=1}}
