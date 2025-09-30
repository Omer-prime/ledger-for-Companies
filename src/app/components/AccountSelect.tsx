'use client'
import { useEffect, useState } from 'react'


type Account = { _id: string; name: string; type: string }


export default function AccountSelect({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
    const [list, setList] = useState<Account[]>([])
    useEffect(() => { fetch('/api/accounts').then(r => r.json()).then(setList) }, [])
    return (
        <select className="w-full rounded-xl border px-3 py-2" value={value} onChange={e => onChange(e.target.value)}>
            <option value="">Select account</option>
            {list.map(a => (<option key={a._id} value={a._id}>{a.name} ({a.type})</option>))}
        </select>
    )
}