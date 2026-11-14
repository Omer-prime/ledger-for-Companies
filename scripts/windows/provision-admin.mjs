import mongoose from 'mongoose'
import { hashPassword } from './password.ts'
import { readFileSync } from 'node:fs'
const config=JSON.parse(readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''))
try {
 if(!/^oarlinks_[a-z0-9_]+$/.test(config.MONGODB_DATABASE)||!/^mongodb:\/\/[^:/@]+:[^/@]+@localhost:37441\/\?replicaSet=oarlinks&authSource=[a-z0-9_]+$/.test(config.MONGODB_URI))throw Error()
 const input=JSON.parse(readFileSync(0,'utf8'))
 const email=input.email.trim().toLowerCase()
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||input.password.length<16||input.password.length>256)throw Error()
 await mongoose.connect(config.MONGODB_URI,{dbName:config.MONGODB_DATABASE,serverSelectionTimeoutMS:5000})
 const db=mongoose.connection.db
 const hello=await db.admin().command({hello:1})
 if(hello.setName!=='oarlinks'||!hello.isWritablePrimary)throw Error()
 const collections=await db.listCollections({}, {nameOnly:true}).toArray()
 if(collections.some(row=>!['users','auth_sessions','auth_attempts'].includes(row.name)))throw Error()
 const users=db.collection('users')
 if(await users.countDocuments())throw Error()
 await users.createIndex({email:1},{unique:true})
 for(const name of ['auth_sessions','auth_attempts'])await db.collection(name).createIndex({expiresAt:1},{expireAfterSeconds:0})

 const hash=await hashPassword(input.password)
 await users.insertOne({_id:new mongoose.Types.ObjectId('000000000000000000000001'),email,role:'superadmin',passwordHash:hash,disabled:false,createdAt:new Date(),updatedAt:new Date()})
 console.log('Initial administrator provisioned')
} catch {
 console.error('Administrator setup refused or failed; no credentials logged')
 process.exitCode=1
} finally {await mongoose.disconnect()}
