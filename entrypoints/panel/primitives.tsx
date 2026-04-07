import { useCallback, useState } from 'react';
import type { ReactDetectionResult } from '../../shared/types';
import { T } from './theme';

export function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <span style={{ fontSize: 11, color: T.textMuted }}>
      <strong style={{ color: T.text, fontWeight: 600 }}>{value.toLocaleString()}</strong>{' '}{label}
    </span>
  );
}

export function ReactBadge({ status }: { status: ReactDetectionResult | null }) {
  if (!status) return <PillBadge color={T.textDim}>detecting...</PillBadge>;
  if (!status.found) return <PillBadge color={T.textDim}>no react</PillBadge>;
  if (status.mode === 'dev') {
    return <PillBadge color={T.green}>{status.version ?? 'React'} dev</PillBadge>;
  }
  return <PillBadge color={T.yellow}>{status.version ?? 'React'} prod</PillBadge>;
}

export function PillBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 12,
      background: `${color}18`, color, letterSpacing: '0.3px', textTransform: 'uppercase',
    }}>
      {children}
    </span>
  );
}

export function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '9px 0', border: 'none',
        borderBottom: active ? `2px solid ${T.accent}` : '2px solid transparent',
        background: active ? T.bgActive : 'transparent',
        color: active ? T.text : T.textMuted,
        cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400,
        transition: 'all 0.15s', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.bgHover; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}

export function ActionButton({ children, onClick, disabled, variant = 'primary', small }: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'secondary' | 'ghost';
  small?: boolean;
}) {
  const colors = {
    primary: { bg: T.accentDim, hover: T.accent },
    danger: { bg: '#dc2626', hover: T.red },
    secondary: { bg: T.bgActive, hover: '#45456a' },
    ghost: { bg: 'transparent', hover: T.bgHover },
  };
  const c = colors[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '5px 10px' : '8px 16px',
        background: disabled ? T.bgActive : c.bg,
        color: disabled ? T.textDim : (variant === 'ghost' ? T.textMuted : '#fff'),
        border: variant === 'ghost' ? `1px solid ${T.border}` : 'none',
        borderRadius: T.radiusSm,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 600, fontSize: small ? 11 : 12,
        fontFamily: 'inherit', transition: 'all 0.15s',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = c.hover; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = disabled ? T.bgActive : c.bg; }}
    >
      {children}
    </button>
  );
}

export function HoverButton({ children, color, hoverColor, onClick }: {
  children: React.ReactNode; color: string; hoverColor: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', color, cursor: 'pointer',
        fontSize: 11, padding: '2px 6px', borderRadius: 4, transition: 'color 0.15s',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = hoverColor; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = color; }}
    >
      {children}
    </button>
  );
}

export function SearchInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%', padding: '7px 10px',
        background: T.bgSurface, border: `1px solid ${T.border}`,
        borderRadius: T.radiusSm, color: T.text, fontSize: 12,
        outline: 'none', fontFamily: 'inherit',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = T.accent; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = T.border; }}
    />
  );
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      fontSize: 13, fontWeight: 600, color: T.text,
    }}>
      {children}
    </div>
  );
}

export function CountBadge({ count }: { count: number }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
      background: T.bgActive, color: T.textMuted,
    }}>
      {count}
    </span>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: T.textDim }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>{description}</div>
    </div>
  );
}

export function ClickToCopy({ text }: { text: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(
      () => { setStatus('copied'); setTimeout(() => setStatus('idle'), 1500); },
      () => { setStatus('failed'); setTimeout(() => setStatus('idle'), 2000); },
    );
  }, [text]);

  return (
    <span
      onClick={handleClick}
      style={{ cursor: 'pointer', borderBottom: `1px dashed ${T.textDim}`, transition: 'color 0.15s' }}
      title="Click to copy"
    >
      {status === 'copied' ? 'Copied!' : status === 'failed' ? 'Copy failed' : text}
    </span>
  );
}

export function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 12, height: 12,
      border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff',
      borderRadius: '50%', animation: 'xray-spin 0.6s linear infinite',
    }} />
  );
}

export function PulsingDot() {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: T.accent, animation: 'xray-pulse 1.5s ease-in-out infinite',
    }} />
  );
}

export function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      padding: 12, background: T.bgSurface, border: `1px solid ${T.border}`,
      borderRadius: T.radius, textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: T.mono }}>
        {value.toLocaleString()}
      </div>
      <div style={{
        fontSize: 10, color: T.textDim, marginTop: 2,
        textTransform: 'uppercase', letterSpacing: '0.5px',
      }}>
        {label}
      </div>
    </div>
  );
}

export function ColorSwatch({ hex }: { hex: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 14, height: 14, borderRadius: 3,
      background: hex, border: '1px solid rgba(255,255,255,0.15)',
      verticalAlign: 'middle', marginRight: 6,
    }} />
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    inline: T.red,
    'non-tailwind': T.yellow,
    'tw-arbitrary': '#a78bfa',
  };
  const color = colors[severity] ?? T.textMuted;
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
      background: `${color}20`, color, textTransform: 'uppercase', letterSpacing: '0.3px',
    }}>
      {severity}
    </span>
  );
}

/**
 * Clickable source location that opens in VS Code / Cursor.
 * Falls back to displaying the path as text if no editor protocol is available.
 */
export function SourceLink({ file, line, column }: {
  file: string | null;
  line: number | null;
  column?: number | null;
}) {
  if (!file) return <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.mono }}>unknown</span>;

  // Shorten webpack/vite paths: strip everything before src/ or app/
  const display = file.replace(/^.*?(?=(?:src|app|components|pages|lib)\/)/, '');
  const lineStr = line ? `:${line}` : '';
  const colStr = column ? `:${column}` : '';
  const label = `${display}${lineStr}`;

  // VS Code URI: vscode://file/path:line:column
  const editorUri = `vscode://file/${file}${lineStr}${colStr}`;

  return (
    <a
      href={editorUri}
      title={`Open ${file}${lineStr}${colStr} in editor`}
      onClick={(e) => {
        // Try opening via the URI scheme
        e.preventDefault();
        window.open(editorUri, '_blank');
      }}
      style={{
        fontSize: 11, color: T.accent, fontFamily: T.mono,
        textDecoration: 'none', cursor: 'pointer',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        display: 'inline-block', maxWidth: '100%',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
      onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
    >
      {label}
    </a>
  );
}
