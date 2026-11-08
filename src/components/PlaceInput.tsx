"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Place } from "@/lib/geo";

/** City search with OpenStreetMap suggestions. The value is only set once a suggestion is picked. */
export function PlaceInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  placeholder: string;
}) {
  const [text, setText] = useState(value?.label ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  const typed = useRef(false);

  // Show the new label when the place changes from outside (e.g. the swap button).
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    if (value) setText(value.label);
  }

  useEffect(() => {
    if (!typed.current || text.trim().length < 2 || text === value?.label) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(text)}`, { signal: ctrl.signal });
        const body = await res.json();
        setResults(Array.isArray(body) ? body : []);
        setActive(0);
        setOpen(true);
      } catch {
        // aborted or offline; keep previous suggestions
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text, value?.label]);

  function pick(p: Place) {
    typed.current = false;
    onChange(p);
    setText(p.label);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") setActive((a) => (a + 1) % results.length);
    else if (e.key === "ArrowUp") setActive((a) => (a - 1 + results.length) % results.length);
    else if (e.key === "Enter") pick(results[active]);
    else if (e.key === "Escape") setOpen(false);
    else return;
    e.preventDefault();
  }

  return (
    <label className="relative block min-w-0 flex-1">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</span>
      <input
        value={text}
        onChange={(e) => {
          typed.current = true;
          setText(e.target.value);
          if (value) onChange(null);
        }}
        onKeyDown={onKey}
        onFocus={() => results.length && !value && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className={`mt-2 w-full rounded-2xl border bg-paper px-4 py-3.5 text-lg outline-none transition focus:border-accent ${
          value ? "border-line" : text ? "border-warn/50" : "border-line"
        }`}
      />
      {loading && <span className="absolute right-4 bottom-4 size-3 animate-ping rounded-full bg-accent/60" />}
      {open && results.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-line bg-card shadow-xl shadow-black/10">
          {results.map((p, i) => (
            <li
              key={`${p.label}-${p.lat}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm ${i === active ? "bg-accent-soft" : ""}`}
            >
              <span className="truncate">{p.label}</span>
              <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-muted">{p.country}</span>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && results.length === 0 && (
        <p className="absolute z-20 mt-2 w-full rounded-2xl border border-line bg-card px-4 py-3 text-sm text-muted shadow-xl">
          No US or Canadian city found. Try a nearby city.
        </p>
      )}
    </label>
  );
}
