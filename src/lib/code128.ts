// Code 128 subset B — printable ASCII only; checksum is Code 128 Mod 103.
// Each symbol is encoded as alternating bar/space widths.
const patterns: string[] = ["BaBbBb","BbBaBb","BbBbBa","AbAbBc","AbAcBb","AcAbBb","AbBbAc","AbBcAb","AcBbAb","BbAbAc","BbAcAb","BcAbAb","AaBbCb","AbBaCb","AbBbCa","AaCbBb","AbCaBb","AbCbBa","BbCbAa","BbAaCb","BbAbCa","BaCbAb","BbCaAb","CaBaCa","CaAbBb","CbAaBb","CbAbBa","CaBbAb","CbBaAb","CbBbAa","BaBaBc","BaBcBa","BcBaBa","AaAcBc","AcAaBc","AcAcBa","AaBcAc","AcBaAc","AcBcAa","BaAcAc","BcAaAc","BcAcAa","AaBaCc","AaBcCa","AcBaCa","AaCaBc","AaCcBa","AcCaBa","CaCaBa","BaAcCa","BcAaCa","BaCaAc","BaCcAa","BaCaCa","CaAaBc","CaAcBa","CcAaBa","CaBaAc","CaBcAa","CcBaAa","CaDaAa","BbAdAa","DcAaAa","AaAbBd","AaAdBb","AbAaBd","AbAdBa","AdAaBb","AdAbBa","AaBbAd","AaBdAb","AbBaAd","AbBdAa","AdBaAb","AdBbAa","BdAbAa","BbAaAd","DaCaAa","BdAaAb","AcDaAa","AaAbDb","AbAaDb","AbAbDa","AaDbAb","AbDaAb","AbDbAa","DaAbAb","DbAaAb","DbAbAa","BaBaDa","BaDaBa","DaBaBa","AaAaDc","AaAcDa","AcAaDa","AaDaAc","AaDcAa","DaAaAc","DaAcAa","AaCaDa","AaDaCa","CaAaDa","DaAaCa","BaAdAb","BaAbAd","BaAbCb","BcCaAaB"]

export function code128Bars(value: string): { x: number; width: number }[] {
  if (!value || value.length > 60 || !/^[\x20-\x7e]+$/.test(value)) throw new Error('Barcode supports 1-60 printable ASCII characters')
  const symbols = [104, ...Array.from(value, ch => ch.charCodeAt(0) - 32)]
  let checksum = 104
  for (let i = 1; i < symbols.length; i++) checksum += symbols[i] * i
  symbols.push(checksum % 103, 106)
  let cursor = 0
  const bars: { x: number; width: number }[] = []
  for (const symbol of symbols) {
    const pattern = patterns[symbol]
    for (let i=0; i<pattern.length; i++) {
      const width = pattern[i].charCodeAt(0) - (pattern[i] >= 'a' ? 96 : 64)
      if (i % 2 === 0) bars.push({x:cursor,width})
      cursor += width
    }
  }
  return bars
}
export function code128Width(value: string): number {
  const bars = code128Bars(value)
  const last = bars[bars.length-1]
  return last.x+last.width
}
