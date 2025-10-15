'use client'

import { useEffect, useState } from 'react'
import dayjs from 'dayjs'

type Line = { productId: string; productName: string; qty: number; value: number }
const fmt = (n: number | null | undefined) => Number(n || 0).toLocaleString()

export default function InventoryPage() {
  const [rows, setRows] = useState<Line[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      try {
        const r = await fetch('/api/inventory/summary/all')
        const j = (await r.json()) as Line[]
        setRows(j)
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [])

  const totals = rows.reduce(
    (a, r) => ({ qty: a.qty + r.qty, value: a.value + r.value }),
    { qty: 0, value: 0 },
  )

  async function exportPdf(): Promise<void> {
    // dynamic import so it never runs on the server
    const { default: jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default

    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' })

    const title = 'Stock & Valuation (WAC)'
    const subtitle = dayjs().format('MMMM D, YYYY')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text(title, 40, 40)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(subtitle, 40, 58)

    const body = rows.map((r) => {
      const avg = r.qty > 0 ? r.value / r.qty : 0
      return [
        r.productName,
        fmt(r.qty),
        fmt(r.value),
        avg ? avg.toFixed(2) : '0.00',
      ]
    })

    // Append totals row if we have data
    if (rows.length > 0) {
      body.push([
        'Totals',
        fmt(totals.qty),
        fmt(totals.value),
        '—',
      ])
    }

    autoTable(doc, {
      startY: 75,
      head: [['Product', 'Qty', 'Value', 'Avg Cost']],
      body,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 10,
        cellPadding: 6,
        halign: 'right',
      },
      headStyles: {
        fillColor: [248, 250, 252], // slate-50
        textColor: [15, 23, 42],    // slate-900
        halign: 'left',
      },
      columnStyles: {
        0: { halign: 'left', cellWidth: 'auto' }, // Product
        1: { halign: 'right', cellWidth: 90 },    // Qty
        2: { halign: 'right', cellWidth: 110 },   // Value
        3: { halign: 'right', cellWidth: 90 },    // Avg
      },
      didParseCell: (data) => {
        // Make the very last row (Totals) bold
        const isTotals =
          rows.length > 0 && data.row.index === rows.length
        if (isTotals) data.cell.styles.fontStyle = 'bold'
      },
      margin: { left: 40, right: 40 },
    })

    const filename = `inventory-${dayjs().format('YYYY-MM-DD')}.pdf`
    doc.save(filename)
  }

  return (
    <main className="space-y-4">
      <section className="rounded-2xl bg-white p-6 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Stock & Valuation (WAC)</h1>
          <button
            onClick={exportPdf}
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-white shadow-soft hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Download PDF'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">Avg Cost</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((r) => {
                  const avg = r.qty > 0 ? r.value / r.qty : 0
                  return (
                    <tr key={r.productId} className="border-b/50">
                      <td className="px-3 py-2">{r.productName}</td>
                      <td className="px-3 py-2 text-right">{fmt(r.qty)}</td>
                      <td className="px-3 py-2 text-right">{fmt(r.value)}</td>
                      <td className="px-3 py-2 text-right">
                        {avg ? avg.toFixed(2) : '0.00'}
                      </td>
                    </tr>
                  )
                })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    No data
                  </td>
                </tr>
              )}
              {!loading && rows.length > 0 && (
                <tr className="bg-slate-50/60 font-semibold">
                  <td className="px-3 py-2 text-right">Totals</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.qty)}</td>
                  <td className="px-3 py-2 text-right">{fmt(totals.value)}</td>
                  <td className="px-3 py-2 text-right">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
