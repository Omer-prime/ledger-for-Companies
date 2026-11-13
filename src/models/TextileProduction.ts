import type { Connection } from 'mongoose'

export type GradeStock = { pending: number; packed: number; label: string }
export type CuttingOrder = {
  _id: string
  lotId: string
  allocatedUm: number
  suitLengthUm: number
  revision: number
  currency: string
  minorPerMeter: number
  createdAt: Date
  completion?: {
    batchId: string
    suitLengthUm: number
    suits: number
    quarantined: number
    returnedUm: number
    offcutsUm: number
    wasteUm: number
    consumedUm: number
  }
  unclassified: number
  grades: Record<string, GradeStock>
}
export type Thaan = {
  _id: string
  soldSuits?: number
  saleId?: string
  orderId: string
  batchId: string
  lotId: string
  contents: { grade: string; label: string; suits: number }[]
  suits: number
  targetSuits: number
  defaultTargetSuits: number
  defaultSuitLengthUm: number
  suitLengthUm: number
  totalUm: number
  revision: number
  actor: string
  postedAt: Date
}
export type ProductionMovement = {
  _id: string
  fingerprint: string
  orderId: string
  lotId: string
  revision: number
  actor: string
  postedAt: Date
  document: Record<string, unknown>
}

export function textileProduction(connection: Connection) {
  return {
    orders: connection.collection<CuttingOrder>('textile_cutting_orders'),
    thaans: connection.collection<Thaan>('textile_thaans'),
    events: connection.collection<ProductionMovement>('textile_production_movements'),
  }
}
