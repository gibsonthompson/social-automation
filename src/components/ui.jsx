'use client';

/**
 * UI primitives: Btn, Input, Select (custom, never a native <select>),
 * Tag, FieldLabel, Icon, Switch, Segmented, plus app-wide toast() and
 * confirmDialog() with their <Overlays /> host.
 *
 * Path: src/components/ui.jsx
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import styles from './ui.module.css';

// ── Button ──────────────────────────────────────────────────────

export function Btn({ children, onClick, variant = 'default', size = 'md', disabled = false, icon = false, title, type = 'button', style = {} }) {
  return (
    <button
      type={type}
      title={title}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`${styles.btn} ${styles[`btn_${variant}`] || ''} ${styles[`btn_${size}`] || ''} ${icon ? styles.btn_icon : ''}`}
      style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
    >
      {children}
    </button>
  );
}

// ── Input ───────────────────────────────────────────────────────

export function Input({ label, value, onChange, placeholder, textarea, type = 'text', style = {} }) {
  return (
    <div className={styles.field}>
      {label && <label className={styles.label}>{label}</label>}
      {textarea ? (
        <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={styles.input} style={{ minHeight: 90, resize: 'vertical', ...style }} />
      ) : (
        <input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={styles.input} style={style} />
      )}
    </div>
  );
}

// ── Select (custom dropdown with keyboard support) ──────────────

export function Select({ label, value, onChange, options, placeholder = 'Select', width, renderValue }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef(null);
  const list = (options || []).map(o => (typeof o === 'string' ? { value: o, label: o } : o));
  const current = list.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => { if (open) setActive(Math.max(0, list.findIndex(o => o.value === value))); }, [open]);

  const choose = (o) => { onChange(o.value); setOpen(false); };

  const onKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(list.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (list[active]) choose(list[active]); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className={label ? styles.field : undefined} style={{ width }}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={styles.select} ref={wrap}>
        <button type="button" className={styles.selectBtn} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)} onKeyDown={onKey}>
          <span className={styles.selectValue}>{current ? (renderValue ? renderValue(current) : current.label) : <span style={{ color: 'var(--tx-dim)' }}>{placeholder}</span>}</span>
          <span className={styles.selectCaret}><Icon name="chevronDown" size={14} /></span>
        </button>
        {open && (
          <div className={styles.menu} role="listbox">
            {list.map((o, i) => (
              <button
                key={String(o.value)}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`${styles.menuItem} ${i === active ? styles.active : ''} ${o.value === value ? styles.selected : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
              >
                {o.dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: o.dot, flexShrink: 0 }} />}
                <span>{o.label}</span>
                {o.hint && <span className={styles.menuHint}>{o.hint}</span>}
                {o.value === value && <span className={styles.menuCheck}><Icon name="check" size={14} /></span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small pieces ────────────────────────────────────────────────

export function Tag({ children, color = 'var(--tx-muted)' }) {
  const bg = color.startsWith('var(') ? 'rgba(148,163,184,.1)' : color + '1F';
  return <span className={styles.tag} style={{ color, backgroundColor: bg }}>{children}</span>;
}

export function FieldLabel({ text }) {
  return <div className={styles.fieldLabel}>{text}</div>;
}

export function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} className={`cf-switch ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)}>
      <span className="cf-switch-knob" />
    </button>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="cf-seg" role="tablist">
      {options.map(o => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        return (
          <button key={opt.value} type="button" role="tab" aria-selected={value === opt.value} className={`cf-seg-btn ${value === opt.value ? 'is-active' : ''}`} onClick={() => onChange(opt.value)}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Spinner({ size = 20 }) {
  return <div className="cf-spinner" style={{ width: size, height: size }} />;
}

// ── Icons ───────────────────────────────────────────────────────

const ICONS = {
  bolt: ['M13 2L3 14h9l-1 10 10-12h-9l1-10'],
  briefcase: ['M2 7h20v14H2z', 'M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3'],
  image: ['M3 3h18v18H3z', 'M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M21 15l-5-5L5 21'],
  folder: ['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'],
  plus: ['M12 5v14', 'M5 12h14'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  edit: ['M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'],
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  check: ['M20 6L9 17l-5-5'],
  checkCircle: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4L12 14.01l-3-3'],
  x: ['M18 6L6 18', 'M6 6l12 12'],
  copy: ['M9 9h13v13H9z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
  home: ['M3 10.5L12 3l9 7.5', 'M5 9.5V21h14V9.5'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  calendar: ['M3 5h18v16H3z', 'M16 3v4', 'M8 3v4', 'M3 10h18'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  history: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M12 7v5l3 2'],
  chart: ['M3 3v18h18', 'M7 15l4-4 3 3 6-6'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  play: ['M6 4l14 8-14 8z'],
  pause: ['M6 4h4v16H6z', 'M14 4h4v16h-4z'],
  external: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14L21 3'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'],
  eye: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  heart: ['M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z'],
  message: ['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'],
  share: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  bookmark: ['M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'],
  alert: ['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 18l6-6-6-6'],
  power: ['M18.36 6.64a9 9 0 1 1-12.73 0', 'M12 2v10'],
  volume: ['M11 5L6 9H2v6h4l5 4V5z', 'M19.07 4.93a10 10 0 0 1 0 14.14', 'M15.54 8.46a5 5 0 0 1 0 7.07'],
  mute: ['M11 5L6 9H2v6h4l5 4V5z', 'M23 9l-6 6', 'M17 9l6 6'],
  instagram: ['M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z', 'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z', 'M17.5 6.5h.01'],
  facebook: ['M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z'],
  sparkle: ['M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z'],
  undo: ['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'],
};

export function Icon({ name, size = 16, stroke = 2, style }) {
  const d = ICONS[name] || [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }} aria-hidden="true">
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

// ── Toasts and confirm dialogs (module store, no context needed) ─

let overlayState = { toasts: [], dialog: null };
const listeners = new Set();
const emit = () => listeners.forEach(l => l());
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getSnap = () => overlayState;
const getServerSnap = () => overlayState;
let toastSeq = 0;

export function toast(message, tone = 'info', ms = 4200) {
  const id = ++toastSeq;
  overlayState = { ...overlayState, toasts: [...overlayState.toasts, { id, message, tone }] };
  emit();
  setTimeout(() => {
    overlayState = { ...overlayState, toasts: overlayState.toasts.filter(t => t.id !== id) };
    emit();
  }, ms);
}

export function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    overlayState = { ...overlayState, dialog: { title, body, confirmLabel, danger, resolve } };
    emit();
  });
}

function closeDialog(result) {
  const d = overlayState.dialog;
  overlayState = { ...overlayState, dialog: null };
  emit();
  d?.resolve(result);
}

export function Overlays() {
  const state = useSyncExternalStore(subscribe, getSnap, getServerSnap);
  const d = state.dialog;

  useEffect(() => {
    if (!d) return;
    const onKey = (e) => { if (e.key === 'Escape') closeDialog(false); if (e.key === 'Enter') closeDialog(true); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [d]);

  return (
    <>
      {d && (
        <div className="cf-overlay" onClick={() => closeDialog(false)}>
          <div className="cf-card cf-dialog" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{d.title}</div>
            {d.body && <div style={{ fontSize: 13, color: 'var(--tx-muted)', marginBottom: 18 }}>{d.body}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={() => closeDialog(false)}>Cancel</Btn>
              <Btn variant={d.danger ? 'danger' : 'primary'} onClick={() => closeDialog(true)}>{d.confirmLabel}</Btn>
            </div>
          </div>
        </div>
      )}
      <div className="cf-toasts" aria-live="polite">
        {state.toasts.map(t => (
          <div key={t.id} className={`cf-toast is-${t.tone}`}>
            <span style={{ color: t.tone === 'error' ? 'var(--red)' : t.tone === 'success' ? 'var(--green)' : 'var(--cyan)', marginTop: 1 }}>
              <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'checkCircle' : 'sparkle'} size={15} />
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}
