export function metersToMicrometers(value: string) {
  if (!/^\d{1,9}(?:\.\d{1,6})?$/.test(value)) throw new RangeError('Invalid length in meters')
  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 1000000 + Number(fraction.padEnd(6, '0'))
}

export function reconcileCutting(
  allocatedUm: number, suitLengthUm: number, suits: number, quarantined: number,
  returnedUm: number, offcutsUm: number, wasteUm: number,
) {
  const consumedUm = (suits + quarantined) * suitLengthUm + offcutsUm + wasteUm
  if (!Number.isSafeInteger(consumedUm) || consumedUm + returnedUm !== allocatedUm) {
    throw new RangeError('Output, returned fabric, offcuts and waste must equal the allocation')
  }
  return consumedUm
}
