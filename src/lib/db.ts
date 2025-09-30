import mongoose from 'mongoose'


const MONGODB_URI = process.env.MONGODB_URI as string


if (!MONGODB_URI) throw new Error('MONGODB_URI is not set')


type GlobalWithMongoose = typeof globalThis & {
    _mongoose?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
}


const globalWithMongoose = global as GlobalWithMongoose


export async function dbConnect() {
    if (!globalWithMongoose._mongoose) {
        globalWithMongoose._mongoose = { conn: null, promise: null }
    }
    if (globalWithMongoose._mongoose!.conn) return globalWithMongoose._mongoose!.conn
    if (!globalWithMongoose._mongoose!.promise) {
        globalWithMongoose._mongoose!.promise = mongoose.connect(MONGODB_URI, {
            bufferCommands: false,
            dbName: 'ledger_app'
        })
    }
    globalWithMongoose._mongoose!.conn = await globalWithMongoose._mongoose!.promise
    return globalWithMongoose._mongoose!.conn
}