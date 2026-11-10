import mongoose from 'mongoose'


type GlobalWithMongoose = typeof globalThis & {
    _mongoose?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
}


const globalWithMongoose = global as GlobalWithMongoose


export async function dbConnect() {
    const uri = process.env.MONGODB_URI
    const dbName = process.env.MONGODB_DATABASE
    if (!uri || !dbName || !/^[a-zA-Z0-9_-]{1,63}$/.test(dbName)) {
        throw new Error('MongoDB configuration is missing or invalid')
    }
    if (!globalWithMongoose._mongoose) {
        globalWithMongoose._mongoose = { conn: null, promise: null }
    }
    if (globalWithMongoose._mongoose!.conn) return globalWithMongoose._mongoose!.conn
    if (!globalWithMongoose._mongoose!.promise) {
        globalWithMongoose._mongoose!.promise = mongoose.connect(uri, {
            bufferCommands: false,
            dbName
        }).catch(error => {
            globalWithMongoose._mongoose!.promise = null
            throw error
        })
    }
    globalWithMongoose._mongoose!.conn = await globalWithMongoose._mongoose!.promise
    return globalWithMongoose._mongoose!.conn
}