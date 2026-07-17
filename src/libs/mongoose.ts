import dns from 'node:dns'
import { Elysia } from 'elysia'
import mongoose from 'mongoose'

// Local/ISP DNS refuses SRV queries (mongodb+srv://). Force public resolvers.
dns.setServers(['8.8.8.8', '1.1.1.1'])

// Idempotent — safe to call multiple times (serverless warm containers reuse the connection)
export const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return
  await mongoose.connect(process.env.DATABASE_URL!)
  console.log('Connected to MongoDB')
}

const READY_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
} as const

export const checkConnection = () => {
  const state = mongoose.connection.readyState as keyof typeof READY_STATES
  return {
    ok: state === 1,
    status: READY_STATES[state] ?? 'unknown',
    host: mongoose.connection.host ?? null,
    db: mongoose.connection.name ?? null,
  }
}

// Used in local dev: onStart connects, onStop disconnects cleanly
export const mongoosePlugin = new Elysia({ name: 'mongoose' })
  .onStart(connectDB)
  .onStop(async () => {
    await mongoose.disconnect()
  })
