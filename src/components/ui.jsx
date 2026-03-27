'use client';

import styles from './ui.module.css';

export function Btn({ children, onClick, variant = 'default', size = 'md', disabled = false, style = {} }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`${styles.btn} ${styles[`btn_${variant}`]} ${styles[`btn_${size}`]}`}
      style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
    >
      {children}
    </button>
  );
}

export function Input({ label, value, onChange, placeholder, textarea, type = 'text', style = {} }) {
  return (
    <div className={styles.field}>
      {label && <label className={styles.label}>{label}</label>}
      {textarea ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={styles.input}
          style={{ minHeight: 90, resize: 'vertical', ...style }}
        />
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={styles.input}
          style={style}
        />
      )}
    </div>
  );
}

export function Select({ label, value, onChange, options }) {
  return (
    <div className={styles.field}>
      {label && <label className={styles.label}>{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.select}
      >
        {options.map((o) => {
          const val = typeof o === 'string' ? o : o.value;
          const lab = typeof o === 'string' ? o : o.label;
          return (
            <option key={val} value={val}>
              {lab}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export function Tag({ children, color = 'var(--gold)' }) {
  return (
    <span
      className={styles.tag}
      style={{ color, backgroundColor: color + '18' }}
    >
      {children}
    </span>
  );
}

export function FieldLabel({ text }) {
  return <div className={styles.fieldLabel}>{text}</div>;
}

// Simple inline SVG icon component
export function Icon({ name, size = 16 }) {
  const paths = {
    bolt: 'M13 2L3 14h9l-1 10 10-12h-9l1-10',
    briefcase: 'M2 7h20v14H2zM16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3',
    image: 'M3 3h18v18H3zM9 9a2 2 0 1 0 0-0.01',
    folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
    plus: 'M12 5v14M5 12h14',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    edit: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z',
    refresh: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5',
    check: 'M20 6L9 17l-5-5',
    x: 'M18 6L6 18M6 6l12 12',
    copy: 'M9 9h13v13H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] || ''} />
    </svg>
  );
}
