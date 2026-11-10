import type { Connection } from 'mongoose'

export const stages = ['greige', 'processor', 'dyed', 'damaged', 'rejected', 'lost'] as const
export type Stage = typeof stages[number]
export type Balances = Record<Stage, number>

type Lot = {
  _id: string
  supplierId: string
  supplier: string
  fabric: string
  receivedUm: number
  balances: Balances
  minorPerMeter: number
  currency: string
  revision: number
  postedAt: Date
}
type Job = {
  _id: string
  lotId: string
  processorId: string
  processor: string
  dispatchedUm: number
  outstandingUm: number
  revision: number
  postedAt: Date
}
export type Leg = { from: Stage | 'supplier'; to: Stage; um: number }
type Movement = {
  _id: string
  fingerprint: string
  lotId: string
  jobId?: string
  legs: Leg[]
  revision: number
  actor: string
  postedAt: Date
  reason?: string
}

export function warehouse(connection: Connection) {
  return {
    lots: connection.collection<Lot>('warehouse_lots'),
    jobs: connection.collection<Job>('warehouse_dye_jobs'),
    events: connection.collection<Movement>('warehouse_movements'),
  }
}
