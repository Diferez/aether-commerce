"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ClipboardCopy } from "lucide-react";
import { DIAL_CODES, defaultDialCodeEntry, dialCodeFlagEmoji, joinWhatsappNumber, splitWhatsappNumber, type DialCodeEntry } from "@aether-commerce/core";
import { useAdminLanguage } from "./AdminLanguageProvider";

// Stores/emits the same flat "573001234567" digit string the API has always
// expected (see isValidWhatsappNumber in @aether-commerce/core) - this only changes
// how the admin *enters* it, splitting the flat value into a searchable
// country-code picker plus a local-number field.
export function WhatsappNumberInput({ value, onChange }: Readonly<{ value: string; onChange: (value: string) => void }>) {
  const { t, locale } = useAdminLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // The dial code is tracked as its own piece of state rather than
  // re-derived from `value` on every render: a flat digit string like "57"
  // (Colombia, no local digits yet) is indistinguishable from "no country
  // selected" once you strip the prefix, so re-deriving on every keystroke
  // could make clearing the local field snap the country back to whatever
  // splitWhatsappNumber guesses. It only resyncs when `value` was changed
  // from outside in a way this component's own dial code can't explain
  // (a freshly loaded number, a paste) - never for its own onChange echoes.
  const [dialCode, setDialCode] = useState(() => splitWhatsappNumber(value).entry.dialCode);
  useEffect(() => {
    if (value !== "" && !value.startsWith(dialCode)) {
      setDialCode(splitWhatsappNumber(value).entry.dialCode);
    }
  }, [value, dialCode]);

  const entry = DIAL_CODES.find((candidate) => candidate.dialCode === dialCode) ?? defaultDialCodeEntry();
  const localNumber = value.startsWith(dialCode) ? value.slice(dialCode.length) : "";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return DIAL_CODES;
    return DIAL_CODES.filter(
      (candidate) =>
        candidate.nameEn.toLowerCase().includes(trimmed) ||
        candidate.nameEs.toLowerCase().includes(trimmed) ||
        candidate.dialCode.includes(trimmed.replace(/\D/g, "") || "\0")
    );
  }, [query]);

  function selectCountry(next: DialCodeEntry) {
    setDialCode(next.dialCode);
    onChange(joinWhatsappNumber(next.dialCode, localNumber));
    setOpen(false);
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, filtered.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const candidate = filtered[activeIndex];
      if (candidate) selectCountry(candidate);
    }
  }

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(`+${value.replace(/\D/g, "")}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser - the number is still
      // visible in the field, so this is a convenience failure, not a blocker.
    }
  }

  const countryName = locale === "es" ? entry.nameEs : entry.nameEn;

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5 rounded-md border border-border bg-surface pr-1.5 focus-within:ring-2 focus-within:ring-accent">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t.phoneInput.selectCountryCode.replace("{country}", countryName).replace("{dialCode}", `+${entry.dialCode}`)}
        className="focus-ring flex min-h-10 shrink-0 items-center gap-1.5 rounded-l-md border-r border-border px-2.5 text-sm text-ink hover:bg-surface-hover"
      >
        <span className="text-base leading-none">{dialCodeFlagEmoji(entry.iso2)}</span>
        <span className="tabular-nums">+{entry.dialCode}</span>
        <ChevronDown size={14} aria-hidden className="text-ink-subtle" />
      </button>

      <input
        type="tel"
        inputMode="numeric"
        value={localNumber}
        onChange={(event) => onChange(joinWhatsappNumber(dialCode, event.target.value))}
        placeholder={t.phoneInput.localNumberPlaceholder}
        aria-label={t.phoneInput.localNumberLabel}
        className="min-h-10 min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
      />

      <button
        type="button"
        onClick={() => void copyNumber()}
        disabled={!value}
        aria-label={t.phoneInput.copyNumber.replace("{number}", `+${value}`)}
        className="focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        {copied ? <Check size={14} aria-hidden className="text-success" /> : <ClipboardCopy size={14} aria-hidden />}
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+4px)] z-20 w-full min-w-72 overflow-hidden rounded-md border border-border bg-surface shadow-elevate-md">
          <div className="border-b border-border p-1.5">
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={t.phoneInput.searchPlaceholder}
              aria-label={t.phoneInput.searchLabel}
              role="combobox"
              aria-expanded="true"
              aria-controls="whatsapp-country-listbox"
              className="focus-ring min-h-9 w-full rounded-md border border-border bg-bg px-2.5 text-sm text-ink placeholder:text-ink-subtle"
            />
          </div>
          <ul id="whatsapp-country-listbox" role="listbox" className="max-h-64 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <li className="px-2.5 py-4 text-center text-sm text-ink-muted">{t.phoneInput.noCountriesFound}</li>
            ) : (
              filtered.map((candidate, index) => {
                const isActive = index === activeIndex;
                return (
                  <li key={candidate.iso2}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectCountry(candidate)}
                      className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm ${
                        isActive ? "bg-accent-soft text-accent" : "text-ink hover:bg-surface-hover"
                      }`}
                    >
                      <span className="text-base leading-none">{dialCodeFlagEmoji(candidate.iso2)}</span>
                      <span className="min-w-0 flex-1 truncate">{locale === "es" ? candidate.nameEs : candidate.nameEn}</span>
                      <span className="shrink-0 tabular-nums text-ink-subtle">+{candidate.dialCode}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
