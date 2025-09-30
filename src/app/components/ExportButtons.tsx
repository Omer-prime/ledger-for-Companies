'use client'


export default function ExportButtons({ onCSV }: { onCSV: () => void }) {
    return (
        <div className="no-print flex gap-2">
            <button onClick={() => window.print()} className="rounded-xl border px-4 py-2 shadow-soft bg-white hover:bg-slate-50">Print</button>
            <button onClick={onCSV} className="rounded-xl border px-4 py-2 shadow-soft bg-white hover:bg-slate-50">Export CSV</button>
        </div>
    )
}