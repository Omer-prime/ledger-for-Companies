const pending = new Map<string, { payload: string; key: string }>()

export function inventoryPostHeaders(operation: string, body: unknown) {
  const payload = JSON.stringify(body)
  const prior = pending.get(operation)
  const key = prior?.payload === payload ? prior.key : crypto.randomUUID()
  pending.set(operation, { payload, key })
  return { 'Content-Type': 'application/json', 'Idempotency-Key': key }
}

export function finishInventoryRequest(operation: string) {
  pending.delete(operation)
}
