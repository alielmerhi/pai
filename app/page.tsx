'use client';
import { useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { State, laden, speichern } from '@/lib/state';
import { ausfuehren, Card } from '@/lib/tools';
import { kontext } from '@/lib/prompt';
import { demoState, BEISPIEL_MAIL } from '@/lib/demo';
import { ft, fdl } from '@/lib/zeit';

type UiMsg = { role: 'user' | 'ai'; text: string; acts: { t: string; err?: boolean }[]; cards: Card[]; starts?: boolean; busy?: boolean };
type ApiMsg = { role: 'user' | 'assistant'; content: any };
const MKEY = 'pai-ui-v1', AKEY = 'pai-api-v1';

const STARTS = ['Was steht heute an?', 'Beispiel-Lead einfügen', '0002 geht nicht ran', 'Merk dir: dienstags keine Termine', 'Wie steht meine Provision?'];

function begruessung(S: State): UiMsg {
  const h = new Date().getHours();
  const anrufe = S.leads.filter(l => l.next?.typ === 'anruf' && new Date(l.next.ts).toDateString() === new Date().toDateString()).length;
  const mails = S.leads.filter(l => l.next?.typ === 'mail').length;
  return { role: 'ai', acts: [], cards: [], starts: true, text:
    `${h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend'}, ${S.berater.name}. ${fdl(new Date())}, ${ft(new Date())} Uhr.\n\n` +
    `${S.leads.length} Testleads geladen${anrufe ? `, ${anrufe} Anruf${anrufe > 1 ? 'e' : ''} heute` : ''}${mails ? `, ${mails} Rückruf-Mail fällig` : ''}.\n\nFüg eine Lead-Mail ein, sag mir, wen du nicht erreicht hast, oder frag, was ansteht.` };
}

// Verlauf kürzen, ohne Werkzeug-Paare zu zerreißen: Schnitt nur vor einer echten Nutzer-Nachricht.
function kuerzen(m: ApiMsg[], max = 40): ApiMsg[] {
  if (m.length <= max) return m;
  for (let i = m.length - max; i < m.length; i++) if (m[i].role === 'user' && typeof m[i].content === 'string') return m.slice(i);
  return m.slice(-2);
}

export default function Chat() {
  const [S, setS] = useState<State | null>(null);
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [resetArm, setResetArm] = useState(false);
  const api = useRef<ApiMsg[]>([]);
  const feed = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const s = laden() || demoState(); speichern(s); setS(s);
    try { api.current = JSON.parse(localStorage.getItem(AKEY) || '[]'); } catch { api.current = []; }
    let ui: UiMsg[] = []; try { ui = JSON.parse(localStorage.getItem(MKEY) || '[]'); } catch {}
    setMsgs(ui.length ? ui.map(m => ({ ...m, busy: false })) : [begruessung(s)]);
  }, []);
  useEffect(() => { try { localStorage.setItem(MKEY, JSON.stringify(msgs.filter(m => !m.busy).slice(-60))); } catch {} feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);

  const zeige = (t: string) => { setToast(t); setTimeout(() => setToast(''), 3500); };

  async function senden(text: string) {
    if (!S || busy || !text.trim()) return;
    if (text === 'Beispiel-Lead einfügen') text = BEISPIEL_MAIL;
    setInput(''); setBusy(true);
    const cur: UiMsg = { role: 'ai', text: '', acts: [], cards: [], busy: true };
    setMsgs(m => [...m.map(x => ({ ...x, starts: false })), { role: 'user', text, acts: [], cards: [] }, cur]);
    const upd = () => setMsgs(m => [...m.slice(0, -1), { ...cur }]);
    const letzte = api.current[api.current.length - 1];
    let verlauf = letzte?.role === 'user' // nach abgebrochener Werkzeug-Runde: Text an die offenen Ergebnisse hängen
      ? kuerzen([...api.current.slice(0, -1), { role: 'user', content: [...(Array.isArray(letzte.content) ? letzte.content : [{ type: 'text', text: String(letzte.content) }]), { type: 'text', text }] }])
      : kuerzen([...api.current, { role: 'user', content: text }]);
    try {
      for (let runde = 0; runde < 10; runde++) {
        const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: verlauf, kontext: kontext(S, new Date()) }) });
        if (r.status === 401) { location.href = '/login'; return; }
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Fehler');
        verlauf = [...verlauf, { role: 'assistant', content: d.content }];
        const texte = d.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
        if (texte) cur.text = texte;
        const calls = d.content.filter((b: any) => b.type === 'tool_use');
        if (d.stop_reason !== 'tool_use' || !calls.length) break;
        const results = calls.map((c: any) => {
          const ctx = { S, acts: [] as string[], cards: [] as Card[], now: new Date() };
          try {
            const out = ausfuehren(c.name, c.input || {}, ctx);
            cur.acts.push(...ctx.acts.map(t => ({ t }))); cur.cards.push(...ctx.cards);
            return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out ?? null) };
          } catch (e: any) {
            cur.acts.push({ t: e.message, err: true });
            return { type: 'tool_result', tool_use_id: c.id, content: 'FEHLER: ' + e.message, is_error: true };
          }
        });
        speichern(S); upd();
        verlauf = [...verlauf, { role: 'user', content: results }];
      }
      api.current = verlauf;
    } catch (e: any) {
      cur.text = `Das hat nicht geklappt: ${e.message}`; cur.acts.push({ t: 'Keine Verbindung zur KI', err: true });
      // Verlauf auf den Stand vor dieser Nachricht zurücksetzen (keine halben Werkzeug-Paare); Aktionen bleiben in der Akte
      api.current = kuerzen(api.current);
    } finally {
      cur.busy = false; upd(); speichern(S); setS({ ...S });
      try { localStorage.setItem(AKEY, JSON.stringify(api.current)); } catch {}
      setBusy(false);
    }
  }

  function neuStart() {
    if (!resetArm) { setResetArm(true); setTimeout(() => setResetArm(false), 3000); return; }
    const s = demoState(); speichern(s); setS(s); api.current = []; localStorage.removeItem(AKEY);
    setMsgs([begruessung(s)]); setResetArm(false); zeige('Demo neu gestartet');
  }

  const mobil = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  return (
    <div className="chat">
      <header className="top"><div className="col">
        <div className="mark">PA<i>I</i><small>dein Vertriebsmitarbeiter</small></div>
        <div className="meta"><span>Testdaten</span><button onClick={neuStart}>{resetArm ? 'Wirklich? Nochmal tippen' : 'Neu starten'}</button></div>
      </div></header>
      <main className="feed" ref={feed}><div className="col"><div className="msgs">
        {msgs.map((m, i) => m.role === 'user'
          ? <div key={i} className="m-user">{m.text}</div>
          : <div key={i} className="m-ai">
              <div className="who">PAI</div>
              {m.acts.length > 0 && <ul className="acts">{m.acts.map((a, j) => <li key={j} className={a.err ? 'err' : ''}>{a.t}</li>)}</ul>}
              {m.busy && !m.text && <div className="thinking" aria-label="PAI denkt"><span>·</span><span>·</span><span>·</span></div>}
              {m.text && <div className="txt">{m.text}</div>}
              {m.cards.map((c, j) => c.type === 'mail' ? <MailKarte key={j} c={c} zeige={zeige} /> : <KontaktKarte key={j} c={c} zeige={zeige} />)}
              {m.starts && <div className="starts">{STARTS.map(s => <button key={s} onClick={() => senden(s)}>{s}</button>)}</div>}
            </div>)}
      </div></div></main>
      <footer className="compose"><div className="col">
        <form className="box" onSubmit={e => { e.preventDefault(); senden(input); }}>
          <textarea ref={ta} rows={1} value={input} placeholder="Schreib PAI – z. B. „0004 geht nicht ran“ oder Lead-Mail einfügen" aria-label="Nachricht an PAI"
            onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'; }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !mobil) { e.preventDefault(); senden(input); } }} />
          <button className="send" disabled={busy || !input.trim()} aria-label="Senden">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </form>
        <p className="note">Nur Testdaten eingeben. PAI versendet nichts selbst – Mails schickst du.</p>
      </div></footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

async function kopieren(t: string, label: string, zeige: (t: string) => void) {
  try { await navigator.clipboard.writeText(t); zeige(label + ' kopiert'); } catch { zeige('Kopieren nicht möglich – Text markieren'); }
}

function MailKarte({ c, zeige }: { c: Extract<Card, { type: 'mail' }>; zeige: (t: string) => void }) {
  const mailto = `mailto:${encodeURIComponent(c.an || '')}?subject=${encodeURIComponent(c.betreff)}&body=${encodeURIComponent(c.text)}`;
  return (
    <div className="card">
      <div className="to">E-Mail-Entwurf an {c.an || '–'}</div>
      <div className="subj">{c.betreff}</div>
      <pre>{c.text}</pre>
      <div className="row">
        <button className="btn" onClick={() => kopieren(c.betreff, 'Betreff', zeige)}>Betreff kopieren</button>
        <button className="btn" onClick={() => kopieren(c.text, 'Text', zeige)}>Text kopieren</button>
        <a className="btn ghost" href={mailto}>In Mail-App öffnen</a>
      </div>
    </div>
  );
}

function KontaktKarte({ c, zeige }: { c: Extract<Card, { type: 'vcard' }>; zeige: (t: string) => void }) {
  const form = useRef<HTMLFormElement>(null);
  let svg = '';
  try { const q: any = qrcode(0, 'L'); q.stringToBytes = (qrcode as any).stringToBytesFuncs['UTF-8']; q.addData(c.vcf, 'Byte'); q.make(); svg = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch {}
  async function teilen() {
    const file = new File([c.vcf], `${c.name}.vcf`, { type: 'text/vcard' });
    if ((navigator as any).canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: c.name }); } catch {} }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = `${c.name}.vcf`; a.click(); zeige('Kontaktkarte geladen'); }
  }
  return (
    <div className="card vcard">
      {svg && <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} aria-label="QR-Code der Kontaktkarte" />}
      <div className="vc-body">
        <div className="to">Kontaktkarte · Lead {c.nr}</div>
        <div className="subj">{c.name}</div>
        <div className="hint">Antippen öffnet „Neuer Kontakt“. Am Rechner: QR-Code mit dem iPhone scannen.</div>
        <form ref={form} method="POST" action="/api/vcard" target="_blank">
          <input type="hidden" name="vcf" value={c.vcf} /><input type="hidden" name="name" value={c.name} />
          <div className="row">
            <button className="btn primary" type="submit">Zu Kontakten hinzufügen</button>
            <button className="btn ghost" type="button" onClick={teilen}>Teilen</button>
          </div>
        </form>
      </div>
    </div>
  );
}
