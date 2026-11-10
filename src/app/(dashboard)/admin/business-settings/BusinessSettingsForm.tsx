'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { businessSettingsSchema, countInPieces, LENGTH_UNITS_UM, thaanLengthMicrometers, type BusinessSettingsData } from '@/lib/business-settings'

type Snapshot = { revision: number; settings: BusinessSettingsData; savedAt: string | null }
type ListItem = BusinessSettingsData['grades'][number]
type Field = {
  key: string
  label: string
  type?: 'text' | 'email' | 'url' | 'number' | 'textarea' | 'checkbox'
  options?: readonly (readonly [string, string])[]
  step?: string
}
type ObjectSection = Exclude<keyof BusinessSettingsData, 'grades' | 'paymentMethods'>
type Section = { key: keyof BusinessSettingsData; title: string; description: string; fields?: readonly Field[] }

const sections: readonly Section[] = [
  { key: 'profile', title: 'Business profile', description: 'Identity and contact details for this installation.', fields: [
    { key: 'name', label: 'Business name' }, { key: 'logoUrl', label: 'Logo URL', type: 'url' },
    { key: 'email', label: 'Email address', type: 'email' }, { key: 'phone', label: 'Primary phone' },
    { key: 'alternatePhone', label: 'Alternate phone' }, { key: 'address', label: 'Business address', type: 'textarea' },
    { key: 'taxInformation', label: 'Tax information', type: 'textarea' },
  ] },
  { key: 'localization', title: 'Localization', description: 'Defaults for future business documents and workflows.', fields: [
    { key: 'currency', label: 'Currency code' }, { key: 'timeZone', label: 'IANA timezone' },
    { key: 'dateFormat', label: 'Date format', options: [['DD/MM/YYYY', 'DD/MM/YYYY'], ['MM/DD/YYYY', 'MM/DD/YYYY'], ['YYYY-MM-DD', 'YYYY-MM-DD']] },
  ] },
  { key: 'measurements', title: 'Measurements', description: 'Length uses integer micrometers. Counts convert through pieces.', fields: [
    { key: 'lengthUnit', label: 'Display length', options: [['m', 'Meters'], ['yd', 'Yards']] },
    { key: 'countUnit', label: 'Display count', options: [['piece', 'Pieces'], ['suit', 'Suits'], ['bundle', 'Bundles']] },
    { key: 'piecesPerSuit', label: 'Pieces per suit', type: 'number' },
    { key: 'piecesPerBundle', label: 'Pieces per bundle', type: 'number' },
  ] },
  { key: 'grades', title: 'Product grades', description: 'Keep grade codes stable. Disable a grade to retire it from future use.' },
  { key: 'textile', title: 'Textile defaults', description: 'Starting values for fabric handling, losses and packing.', fields: [
    { key: 'fabricType', label: 'Fabric type' }, { key: 'color', label: 'Default color' },
    { key: 'cuttingLossPercent', label: 'Cutting loss (%)', type: 'number', step: 'any' },
    { key: 'dyeingLossPercent', label: 'Dyeing loss (%)', type: 'number', step: 'any' },
    { key: 'packingConvention', label: 'Packing convention', type: 'textarea' },
  ] },
  { key: 'thaan', title: 'Thaan configuration', description: 'Define the standard suit count and length for a thaan.', fields: [
    { key: 'suitsPerThaan', label: 'Suits per thaan', type: 'number' },
    { key: 'metersPerSuit', label: 'Meters per suit', type: 'number', step: '0.000001' },
  ] },
  { key: 'invoice', title: 'Invoice settings', description: 'Numbering, receipt copy and print preferences for future invoices.', fields: [
    { key: 'prefix', label: 'Number prefix' }, { key: 'startingNumber', label: 'Starting number', type: 'number' },
    { key: 'digits', label: 'Minimum digits', type: 'number' },
    { key: 'paperSize', label: 'Paper size', options: [['A4', 'A4'], ['LETTER', 'Letter'], ['RECEIPT_80MM', '80 mm receipt']] },
    { key: 'copies', label: 'Print copies', type: 'number' }, { key: 'showLogo', label: 'Print business logo', type: 'checkbox' },
    { key: 'header', label: 'Business header', type: 'textarea' }, { key: 'footer', label: 'Receipt footer', type: 'textarea' },
  ] },
  { key: 'paymentMethods', title: 'Payment methods', description: 'Enable approved methods for future payment entry.' },
  { key: 'terminology', title: 'Operational terminology', description: 'Labels to use when future workflows adopt these settings.', fields:
    ['product', 'customer', 'supplier', 'bundle', 'sale', 'purchase', 'inventory'].map(key => ({ key, label: key[0].toUpperCase() + key.slice(1) })) },
]

const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100'

function SettingField({ field, value, onChange }: {
  field: Field
  value: string | number | boolean
  onChange: (value: string | number | boolean) => void
}) {
  if (field.type === 'checkbox') return (
    <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
      <input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} />
      {field.label}
    </label>
  )
  return (
    <label className="min-w-0 text-sm font-medium text-slate-700">
      {field.label}
      {field.options ? (
        <select className={inputClass} value={String(value)} onChange={event => onChange(event.target.value)}>
          {field.options.map(([option, name]) => <option key={option} value={option}>{name}</option>)}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea className={inputClass} rows={2} value={String(value)} onChange={event => onChange(event.target.value)} />
      ) : (
        <input className={inputClass} type={field.type ?? 'text'} step={field.step}
          value={String(value)} onChange={event => onChange(field.type === 'number' && event.target.value !== '' ? event.target.valueAsNumber : event.target.value)} />
      )}
    </label>
  )
}

function SettingsList({ items, required, singular, onChange }: {
  items: ListItem[]
  required: readonly string[]
  singular: string
  onChange: (items: ListItem[]) => void
}) {
  function change(index: number, patch: Partial<ListItem>) {
    onChange(items.map((item, position) => position === index ? { ...item, ...patch } : item))
  }
  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const builtIn = required.includes(item.code) && items.filter(other => other.code === item.code).length === 1
        return (
          <div key={index} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[6rem_minmax(0,1fr)_auto_auto] sm:items-end">
            <label className="text-xs font-medium">Code
              <input className={inputClass} readOnly={builtIn} value={item.code} onChange={event => change(index, { code: event.target.value })} />
            </label>
            <label className="text-xs font-medium">Label
              <input className={inputClass} value={item.label} onChange={event => change(index, { label: event.target.value })} />
            </label>
            <label className="flex items-center gap-2 py-2 text-sm">
              <input type="checkbox" checked={item.enabled} onChange={event => change(index, { enabled: event.target.checked })} />
              Enabled
            </label>
            {!builtIn && <button type="button" className="rounded-lg px-2 py-2 text-sm text-red-700 hover:bg-red-50"
              onClick={() => onChange(items.filter((_, position) => position !== index))}>Remove</button>}
          </div>
        )
      })}
      <button type="button" disabled={items.length >= 30} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        onClick={() => onChange([...items, { code: '', label: '', enabled: true }])}>Add {singular}</button>
    </div>
  )
}

export default function BusinessSettingsForm() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [draft, setDraft] = useState<BusinessSettingsData | null>(null)
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadVersion, reload] = useState(0)
  const inFlight = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch('/api/business-settings', { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error()
        const result: Snapshot = await response.json()
        setSnapshot(result)
        setDraft(result.settings)
        setNotice(null)
      } catch {
        if (!controller.signal.aborted) setNotice({ text: 'Business settings could not be loaded.', error: true })
      }
    }
    void load()
    return () => controller.abort()
  }, [loadVersion])

  const dirty = snapshot && draft && JSON.stringify(snapshot.settings) !== JSON.stringify(draft)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !snapshot || !dirty || inFlight.current) return
    const validated = businessSettingsSchema.safeParse(draft)
    if (!validated.success) {
      const issue = validated.error.issues[0]
      setNotice({ text: issue.path.join(' · ') + ' — ' + issue.message, error: true })
      return
    }
    inFlight.current = true
    setSaving(true)
    setNotice(null)
    try {
      const response = await fetch('/api/business-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: snapshot.revision, settings: validated.data }),
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Could not save business settings.')
      }
      const result: Snapshot = await response.json()
      setSnapshot(result)
      setDraft(result.settings)
      setNotice({ text: 'Settings saved.' })
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Could not save business settings.', error: true })
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  function updateField(section: ObjectSection, key: string, value: string | number | boolean) {
    setDraft(current => current && { ...current, [section]: { ...current[section], [key]: value } })
  }

  const countPreview = draft && [draft.measurements.piecesPerSuit, draft.measurements.piecesPerBundle].every(value => Number.isSafeInteger(value) && value > 0)
    ? '1 suit = ' + countInPieces(1, 'suit', draft.measurements) + ' pieces · 1 bundle = ' + countInPieces(1, 'bundle', draft.measurements) + ' pieces'
    : null
  const thaanLength = draft ? thaanLengthMicrometers(draft.thaan) / LENGTH_UNITS_UM.m : 0

  return (
    <main className="mx-auto min-w-0 max-w-6xl text-slate-900">
      <header className="rounded-2xl bg-slate-900 px-5 py-6 text-white sm:px-8">
        <p className="text-xs font-semibold tracking-widest text-blue-200 uppercase">OarLinks · Administration</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Business settings</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-300">Manage this installation’s profile, operational defaults, and document preferences.</p>
      </header>
      {snapshot && draft && (
        <nav aria-label="Settings sections" className="my-4 flex flex-wrap gap-2">
          {sections.map(section => <a key={section.key} href={'#' + section.key} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:border-blue-300 hover:text-blue-800">{section.title}</a>)}
        </nav>
      )}
      {!snapshot || !draft ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5" role="status">
          {notice?.text ?? 'Loading business settings…'}
          {notice && <button type="button" className="ml-3 text-blue-800 underline" onClick={() => reload(version => version + 1)}>Try again</button>}
        </div>
      ) : (
        <form onSubmit={save} noValidate>
          <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:px-5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{snapshot.revision ? 'Revision ' + snapshot.revision : 'Default configuration'}</p>
              <p aria-live="polite" className={'text-xs ' + (notice?.error ? 'text-red-700' : 'text-slate-600')}>
                {notice?.text ?? (dirty ? 'Unsaved changes' : 'Each save creates a new revision.')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={saving} onClick={() => {
                if (dirty && !window.confirm('Discard unsaved changes and reload?')) return
                setSnapshot(null)
                setDraft(null)
                setNotice(null)
                reload(version => version + 1)
              }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">Reload</button>
              <button type="submit" disabled={!dirty || saving} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>
          <fieldset disabled={saving} className="grid min-w-0 gap-4">
            {sections.map(section => (
              <section key={section.key} id={section.key} className="scroll-mt-36 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
                <h2 className="text-lg font-semibold">{section.title}</h2>
                <p className="mb-4 mt-1 text-sm text-slate-600">{section.description}</p>
                {section.key === 'grades' || section.key === 'paymentMethods' ? (
                  <SettingsList items={draft[section.key]} required={section.key === 'grades' ? ['A', 'B', 'C'] : ['CASH', 'BANK']}
                    singular={section.key === 'grades' ? 'grade' : 'method'}
                    onChange={items => setDraft(current => current && { ...current, [section.key]: items })} />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {section.fields?.map(field => {
                      const key = section.key as ObjectSection
                      const values = draft[key] as Record<string, string | number | boolean>
                      return <SettingField key={field.key} field={field} value={values[field.key]} onChange={value => updateField(key, field.key, value)} />
                    })}
                  </div>
                )}
                {section.key === 'measurements' && <p className="mt-3 text-xs text-slate-600">1 meter = 1,000,000 µm · 1 yard = 914,400 µm{countPreview && <><br />{countPreview}</>}</p>}
                {section.key === 'thaan' && <p className="mt-3 text-sm font-medium text-blue-800">{thaanLength.toLocaleString()} meters per thaan</p>}
              </section>
            ))}
          </fieldset>
        </form>
      )}
    </main>
  )
}
