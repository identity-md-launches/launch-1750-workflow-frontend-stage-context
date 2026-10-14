import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { getAddress, type Address } from 'viem';
import { useRuntime } from './context';

export function Arrow({ back = false }: { back?: boolean }) { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={back ? { transform: 'rotate(180deg)' } : undefined}><path d="M4 12h15m-6-6 6 6-6 6" /></svg>; }
export function Mark() { return <svg aria-hidden="true" width="32" height="36" viewBox="0 0 36 42" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M8 4v25a8 8 0 0 0 16 0V4M30 38V13a8 8 0 0 0-16 0v25" /></svg>; }
export function Weave({ compact = false }: { compact?: boolean }) {
  return <svg className={compact ? 'weave compact' : 'weave'} aria-hidden="true" viewBox="0 0 560 400" fill="none">
    <rect width="560" height="400" fill="#ebe8da" />
    <g stroke="#d7d3c3" strokeWidth="1">{Array.from({ length: 28 }, (_, i) => <path key={i} d={`M${i * 22} 0v400M0 ${i * 22}h560`} />)}</g>
    <g stroke="#203f32" strokeWidth="10">{Array.from({ length: 10 }, (_, i) => <path key={i} d={`M${95 + i * 14} 345V${135 + i * 1.2}a${135 - i * 12} ${135 - i * 12} 0 0 1 ${270 - i * 24} 0v${170 - i * 5}`} />)}</g>
    <g stroke="#b86d44" strokeWidth="8">{Array.from({ length: 10 }, (_, i) => <path key={i} d={`M${455 - i * 13} 50v${162 - i * 4}a${110 - i * 10} ${110 - i * 10} 0 0 1 ${-220 + i * 20} 0V${95 + i * 5}`} />)}</g>
    <path d="M72 302h70v14H72zM400 83h70v14h-70z" fill="#b8c185" />
  </svg>;
}
export function Field({ label, hint, children, error }: { label: string; hint?: string; children: ReactNode; error?: string }) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children) ? cloneElement(children as ReactElement<Record<string, unknown>>, { 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined }) : children;
  return <div className="field"><label><span>{label}</span>{control}</label>{hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}{error && <p id={`${id}-error`} className="error-text" role="alert">{error}</p>}</div>;
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) { return <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>; }
export function AddressView({ address, label }: { address: Address; label?: string }) {
  const { deployment } = useRuntime();
  const [copied, setCopied] = useState(false);
  return <div className="address-view">{label && <span className="muted">{label}</span>}<a href={`${deployment.network.explorer}/address/${address}`} target="_blank" rel="noreferrer" className="address">{getAddress(address)}</a><button className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(getAddress(address)); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copied' : 'Copy address'}</button></div>;
}
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { const d = ref.current!; const previous = document.activeElement as HTMLElement; d.showModal(); return () => { d.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} aria-labelledby={id} className="modal" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}><div className="modal-head"><h2 id={id}>{title}</h2><button aria-label="Close" className="icon-button" onClick={onClose}>×</button></div>{children}</dialog>;
}
