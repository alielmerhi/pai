'use client';
import { useState } from 'react';
import { Logo } from '@/components/Logo';

export default function Login() {
  const [code, setCode] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    if (r.ok) location.href = '/'; else { setErr((await r.json().catch(() => ({}))).error || 'Fehler'); setBusy(false); }
  }
  return (
    <main className="login">
      <form onSubmit={go}>
        <Logo height={96} fg="#000000" />
        <p className="muted">Zugang nur mit Code. Demo mit Testdaten.</p>
        <input type="password" inputMode="numeric" autoComplete="current-password" placeholder="Zugangscode" value={code} onChange={e => setCode(e.target.value)} autoFocus aria-label="Zugangscode" />
        <button className="btn primary" disabled={busy || !code}>{busy ? 'Prüfe …' : 'Öffnen'}</button>
        {err && <p className="err">{err}</p>}
      </form>
    </main>
  );
}
