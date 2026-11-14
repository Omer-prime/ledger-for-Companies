/* eslint-disable @typescript-eslint/no-require-imports -- mongosh script host exposes CommonJS require. */
try {
 const config=JSON.parse(require('fs').readFileSync(process.env.OARLINKS_RESTORE_CONFIG,'utf8'))
 const connection=new Mongo(config.uri)
 const admin=connection.getDB('admin')
 if(admin.runCommand({hello:1}).setName!=='oarlinks_restore')quit(1)
 if(connection.getDB(process.env.OARLINKS_RESTORE_DB).getCollectionNames().length)quit(1)
} catch {quit(1)}
