'use client';

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

export type PartyOption = { id?: string; name: string; code?: string };
type ApiParty = { id: string; name: string; code?: string };

type Props = {
  value: string;
  onChange: (v: PartyOption) => void;
  placeholder?: string;
  searchUrl?: string;
  className?: string;
};

export default function PartyAutocomplete({
  value,
  onChange,
  placeholder = 'Party…',
  searchUrl = '/api/parties/search',
  className = '',
}: Props) {
  const [q, setQ] = useState<string>(value ?? '');
  const [open, setOpen] = useState<boolean>(false);
  const [items, setItems] = useState<ApiParty[]>([]);
  const [highlight, setHighlight] = useState<number>(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);          // NEW
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => setQ(value ?? ''), [value]);

  useEffect(() => {
    let active = true;
    const id = window.setTimeout(async () => {
      const url = `${searchUrl}?q=${encodeURIComponent(q || '')}&limit=10`;
      try {
        const r = await fetch(url);
        if (!r.ok) return;
        const data = (await r.json()) as ApiParty[];
        if (active) setItems(data);
      } catch {
        if (active) setItems([]);
      }
      if (active) setHighlight(0);
    }, 200);
    return () => { active = false; window.clearTimeout(id); };
  }, [q, searchUrl]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const insideInput = !!wrapRef.current && !!target && wrapRef.current.contains(target);
      const insideMenu  = !!menuRef.current && !!target && menuRef.current.contains(target);
      if (!insideInput && !insideMenu) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const updateRect = () => {
    if (!wrapRef.current) return;
    setRect(wrapRef.current.getBoundingClientRect());
  };
  useLayoutEffect(() => {
    if (!open) return;
    updateRect();
    const onScroll = () => updateRect();
    const onResize = () => updateRect();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const select = (i: number) => {
    const it = items[i];
    if (!it) return;
    onChange({ id: it.id, name: it.name, code: it.code });
    setQ(it.name);
    setOpen(false);
  };

  const menuStyle: React.CSSProperties = useMemo(() => {
    if (!rect) return {};
    return {
      position: 'fixed',
      left: rect.left,
      top: rect.bottom + 4,
      width: rect.width,
      maxHeight: '16rem',
      overflow: 'auto',
      zIndex: 10001,
    };
  }, [rect]);

  return (
    <div ref={wrapRef} className={`relative ${open ? 'z-[1]' : ''} ${className}`}>
      <input
        className="w-full rounded-md border px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        value={q}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return; }
          if (!open) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, items.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); select(highlight); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
      />

      {open && items.length > 0 && rect && createPortal(
        <div
          ref={menuRef}                                   // NEW
          role="listbox"
          className="rounded-lg border bg-white shadow-xl ring-1 ring-black/5 divide-y divide-slate-100"
          style={menuStyle}
        >
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e: React.MouseEvent<HTMLButtonElement>) => e.preventDefault()}
              onClick={() => select(i)}
              className={`block w-full truncate px-3 py-2 text-left text-sm ${
                i === highlight ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50'
              }`}
              title={it.name}
            >
              {it.name}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
