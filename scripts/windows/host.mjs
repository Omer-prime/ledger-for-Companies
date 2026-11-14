import { createServer } from 'node:https'
import { request } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
const json = path => JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''))
const config = json(join(root,'config','runtime.json'))
const release = readFileSync(join(root,'active.txt'),'utf8').trim()
if (!/^\d+\.\d+\.\d+$/.test(release)) throw Error('Invalid release pointer')
const cwd = join(root,'releases',release,'app')
const env = {...process.env, ...json(join(root,'config','app-env.json')), NODE_ENV:'production', NEXT_TELEMETRY_DISABLED:'1'}
if (env.APP_ORIGIN !== 'https://localhost:37443') throw Error('Invalid origin')
const child = spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','37442'],{cwd,env,windowsHide:true,stdio:'ignore'})
child.on('error',()=>process.exit(1))
child.on('exit',()=>process.exit(1))
let active=0
const server = createServer({pfx:readFileSync(join(root,'config','localhost.pfx')), passphrase:config.tlsPassword},(incoming,outgoing)=>{
  if(incoming.headers.host!=='localhost:37443') {outgoing.writeHead(400).end();return}
  const statusPath=join(root,'logs','update.json')
  if(incoming.url==='/_installation/version' && incoming.method==='GET'){
    let update='No update check recorded'
    try {update=json(statusPath).status} catch {}
    outgoing.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({version:release,update}))
    return
  }
  if(incoming.url==='/_installation/drain' && incoming.method==='GET'){outgoing.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({active}));return}
  if(existsSync(join(root,'maintenance.flag'))){outgoing.writeHead(503,{'Retry-After':'60'}).end('OarLinks is performing scheduled maintenance. Try again shortly.');return}
  active++
  let counted=true
  function finished(){if(counted){counted=false;active--}}
  const upstream=request({hostname:'127.0.0.1',port:37442,path:incoming.url,method:incoming.method,
    headers:{...incoming.headers,'x-forwarded-host':'localhost:37443','x-forwarded-proto':'https','x-forwarded-for':'127.0.0.1'}},reply=>{
    reply.on('end',finished);reply.on('close',finished);outgoing.writeHead(reply.statusCode,reply.headers);reply.pipe(outgoing)
  })
  upstream.on('error',()=>{finished();if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end()})
  outgoing.on('close',()=>{if(!outgoing.writableFinished)upstream.on('response',reply=>reply.resume())})
  incoming.pipe(upstream)
})
server.on('error',()=>{child.kill();process.exit(1)})
server.listen(37443,'127.0.0.1')
