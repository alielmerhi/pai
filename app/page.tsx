'use client';
import { useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Geo } from '@/lib/region';
import { State, laden, speichern } from '@/lib/state';
import { ausfuehren, Card } from '@/lib/tools';
import { kontext } from '@/lib/prompt';
import { demoState, BEISPIEL_MAIL } from '@/lib/demo';
import { ft, fdl } from '@/lib/zeit';

type UiMsg = { role: 'user' | 'ai'; text: string; acts: { t: string; err?: boolean }[]; cards: Card[]; quellen?: { url: string; titel: string }[]; starts?: boolean; busy?: boolean };
type ApiMsg = { role: 'user' | 'assistant'; content: any };
const MKEY = 'pai-ui-v1', AKEY = 'pai-api-v1', GKEY = 'pai-geo-v1';

// PLZ-Koordinaten im Gerät zwischenspeichern; übertragen wird nur die PLZ.
let GEO: Record<string, Geo | null> = {};
async function geoFuer(plz: unknown) {
  const p = String(plz || '').replace(/\D/g, '');
  if (p.length !== 5 || p in GEO) return;
  try { const r = await fetch('/api/geo?plz=' + p); const d = await r.json(); if (r.ok) { GEO[p] = d.geo ?? null; localStorage.setItem(GKEY, JSON.stringify(GEO)); } } catch {}
}

const STARTS = ['Was steht heute an?', 'Beispiel-Lead einfügen', '0002 geht nicht ran', 'Merk dir: dienstags keine Termine', 'Wie steht meine Provision?'];

function begruessung(S: State): UiMsg {
  const h = new Date().getHours();
  const anrufe = S.leads.filter(l => l.next?.typ === 'anruf' && new Date(l.next.ts).toDateString() === new Date().toDateString()).length;
  const mails = S.leads.filter(l => l.next?.typ === 'mail').length;
  return { role: 'ai', acts: [], cards: [], starts: true, text:
    `${h >= 5 && h < 11 ? 'Guten Morgen' : h >= 11 && h < 18 ? 'Guten Tag' : 'Guten Abend'}, ${S.berater.name}. ${fdl(new Date())}, ${ft(new Date())} Uhr.\n\n` +
    `${S.leads.length} Testleads geladen${anrufe ? `, ${anrufe} Anruf${anrufe > 1 ? 'e' : ''} heute` : ''}${mails ? `, ${mails} Rückruf-Mail fällig` : ''}.\n\nFüg eine Lead-Mail ein, sag mir, wen du nicht erreicht hast, oder frag, was ansteht.` };
}

// Verlauf kürzen, ohne Werkzeug-Paare zu zerreißen: Schnitt nur vor einer echten Nutzer-Nachricht.
function kuerzen(m: ApiMsg[], max = 40): ApiMsg[] {
  if (m.length <= max) return m;
  for (let i = m.length - max; i < m.length; i++) if (m[i].role === 'user' && typeof m[i].content === 'string') return m.slice(i);
  return m.slice(-2);
}

// Abgeschlossene Runden schlank halten: Websuche-Ergebnisse sind groß und werden später nicht mehr gebraucht.
function verdichten(m: ApiMsg[]): ApiMsg[] {
  return m.map(x => {
    if (x.role !== 'assistant' || !Array.isArray(x.content)) return x;
    if (!x.content.some((b: any) => b.type === 'server_tool_use' || b.type === 'web_search_tool_result' || b.citations)) return x;
    const c = x.content.filter((b: any) => b.type !== 'server_tool_use' && b.type !== 'web_search_tool_result')
      .map((b: any) => (b.type === 'text' && b.citations ? { type: 'text', text: b.text } : b));
    return { ...x, content: c.length ? c : [{ type: 'text', text: '(Websuche)' }] };
  });
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
    try { GEO = JSON.parse(localStorage.getItem(GKEY) || '{}'); } catch {}
    const s = laden() || demoState(); speichern(s); setS(s);
    try { api.current = JSON.parse(localStorage.getItem(AKEY) || '[]'); } catch { api.current = []; }
    let ui: UiMsg[] = []; try { ui = JSON.parse(localStorage.getItem(MKEY) || '[]'); } catch {}
    setMsgs(ui.length ? ui.map(m => ({ ...m, busy: false })) : [begruessung(s)]);
  }, []);
  const scrollZiel = useRef<'ende' | 'antwort' | null>('ende');
  useEffect(() => {
    try { localStorage.setItem(MKEY, JSON.stringify(msgs.filter(m => !m.busy).slice(-60))); } catch {}
    const f = feed.current; if (!f || !scrollZiel.current) return;
    if (scrollZiel.current === 'ende') { f.scrollTo({ top: f.scrollHeight, behavior: 'smooth' }); scrollZiel.current = null; return; }
    // Lange Antworten von oben lesen: die eigene Nachricht bleibt knapp oben sichtbar
    const el = f.querySelectorAll('.m-user'); const last = el[el.length - 1] as HTMLElement | undefined;
    if (last) f.scrollTo({ top: Math.max(0, last.offsetTop - 12), behavior: 'smooth' });
  }, [msgs]);

  const zeige = (t: string) => { setToast(t); setTimeout(() => setToast(''), 3500); };

  // Neue Version erkennen (Startbildschirm-App lädt sonst die alte weiter)
  const [neu, setNeu] = useState(false);
  useEffect(() => {
    const pruefe = () => fetch('/api/version', { cache: 'no-store' }).then(r => r.json()).then(d => { if (d.v && d.v !== process.env.NEXT_PUBLIC_VERSION) setNeu(true); }).catch(() => {});
    pruefe(); const t = setInterval(pruefe, 120000);
    const sicht = () => { if (document.visibilityState === 'visible') pruefe(); };
    document.addEventListener('visibilitychange', sicht);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', sicht); };
  }, []);

  async function senden(text: string) {
    if (!S || busy || !text.trim()) return;
    if (text === 'Beispiel-Lead einfügen') text = BEISPIEL_MAIL;
    setInput(''); setBusy(true); S.zug = (S.zug || 0) + 1; scrollZiel.current = 'antwort';
    if (ta.current) ta.current.style.height = 'auto';
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
        const texte = d.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
        if (texte) cur.text = texte;
        for (const b of d.content) {
          if (b.type === 'server_tool_use' && b.name === 'web_search') cur.acts.push({ t: `Im Internet gesucht: ${b.input?.query || ''}` });
          if (b.type === 'web_search_tool_result' && !Array.isArray(b.content)) cur.acts.push({ t: 'Websuche fehlgeschlagen', err: true });
          if (b.type === 'text' && Array.isArray(b.citations)) for (const c of b.citations) if (c.url && !(cur.quellen ||= []).some(q => q.url === c.url)) cur.quellen!.push({ url: c.url, titel: c.title || c.url });
        }
        upd();
        if (d.stop_reason === 'pause_turn') continue; // lange Websuche: unverändert zurückschicken
        const calls = d.content.filter((b: any) => b.type === 'tool_use');
        if (d.stop_reason !== 'tool_use' || !calls.length) break;
        for (const c of calls) if (c.input?.plz) await geoFuer(c.input.plz);
        const results = calls.map((c: any) => {
          const ctx = { S, acts: [] as string[], cards: [] as Card[], now: new Date(), zug: S.zug, geo: GEO };
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
      api.current = verdichten(verlauf);
    } catch (e: any) {
      cur.text = `Das hat nicht geklappt: ${e.message}`; cur.acts.push({ t: 'Keine Verbindung zur KI', err: true });
      // Verlauf auf den Stand vor dieser Nachricht zurücksetzen (keine halben Werkzeug-Paare); Aktionen bleiben in der Akte
      api.current = kuerzen(api.current);
    } finally {
      cur.busy = false; upd(); speichern(S); setS({ ...S }); scrollZiel.current = null;
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
        <div className="mark">PA<i>I</i><span className="test">Testdaten</span></div>
        <button className={'reset' + (resetArm ? ' arm' : '')} onClick={neuStart}>{resetArm ? 'Alles löschen? Nochmal tippen' : 'Neu starten'}</button>
      </div></header>
      <main className="feed" ref={feed}><div className="col"><div className="msgs">
        {msgs.map((m, i) => m.role === 'user'
          ? <UserNachricht key={i} text={m.text} />
          : <div key={i} className="m-ai">
              <div className="who">{S?.schema?.mitarbeiter || 'PAI'}</div>
              {m.acts.length > 0 && <ul className="acts">{m.acts.map((a, j) => <li key={j} className={a.err ? 'err' : ''}>{a.t}</li>)}</ul>}
              {m.busy && !m.text && <div className="thinking" aria-label="PAI denkt"><span>·</span><span>·</span><span>·</span></div>}
              {m.text && <div className="txt md"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}>{m.text}</ReactMarkdown></div>}
              {m.quellen && m.quellen.length > 0 && <div className="quellen">Quellen: {m.quellen.slice(0, 6).map((q, j) => <a key={j} href={q.url} target="_blank" rel="noopener noreferrer">{q.titel}</a>)}</div>}
              {m.cards.map((c, j) => c.type === 'mail' ? <MailKarte key={j} c={c} zeige={zeige} /> : c.type === 'ics' ? <KalenderKarte key={j} c={c} /> : <KontaktKarte key={j} c={c} zeige={zeige} />)}
              {m.starts && <div className="starts">{STARTS.map(s => <button key={s} onClick={() => senden(s)}>{s}</button>)}</div>}
            </div>)}
      </div></div></main>
      <footer className="compose"><div className="col">
        <form className="box" onSubmit={e => { e.preventDefault(); senden(input); }}>
          <textarea ref={ta} rows={1} value={input} placeholder="Nachricht oder Lead-Mail" aria-label="Nachricht an PAI"
            onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'; }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !mobil) { e.preventDefault(); senden(input); } }} />
          <button className="send" disabled={busy || !input.trim()} aria-label="Senden">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </form>
        <p className="note">Nur Testdaten. PAI sendet keine Mails – das machst du. <span className="ver">Version {process.env.NEXT_PUBLIC_VERSION}</span></p>
      </div></footer>
      {neu && <button className="update" onClick={() => location.reload()}>Neue Version da – tippen zum Laden</button>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

async function kopieren(t: string, label: string, zeige: (t: string) => void) {
  try { await navigator.clipboard.writeText(t); zeige(label + ' kopiert'); } catch { zeige('Kopieren nicht möglich – Text markieren'); }
}

function UserNachricht({ text }: { text: string }) {
  const lang = text.split('\n').length > 6 || text.length > 400;
  const [auf, setAuf] = useState(false);
  return (
    <div className={'m-user' + (lang && !auf ? ' zu' : '')}>
      {lang && !auf ? text.split('\n').slice(0, 4).join('\n') : text}
      {lang && <button className="mehr" onClick={() => setAuf(!auf)}>{auf ? 'Weniger' : `Ganze Mail (${text.split('\n').length} Zeilen)`}</button>}
    </div>
  );
}

function MailKarte({ c, zeige }: { c: Extract<Card, { type: 'mail' }>; zeige: (t: string) => void }) {
  const mailto = `mailto:${encodeURIComponent(c.an || '')}?subject=${encodeURIComponent(c.betreff)}&body=${encodeURIComponent(c.text)}`;
  const [auf, setAuf] = useState(false);
  const lang = c.text.split('\n').length > 9;
  return (
    <div className="card">
      <div className="to">Mail-Entwurf an {c.an || '–'}</div>
      <div className="subj">{c.betreff}</div>
      <pre className={lang && !auf ? 'zu' : ''}>{c.text}</pre>
      {lang && <button className="mehr" onClick={() => setAuf(!auf)}>{auf ? 'Weniger' : 'Ganzen Text zeigen'}</button>}
      <div className="row">
        <button className="btn primary" onClick={() => kopieren(c.text, 'Text', zeige)}>Text kopieren</button>
        <button className="btn" onClick={() => kopieren(c.betreff, 'Betreff', zeige)}>Betreff kopieren</button>
        <a className="btn ghost" href={mailto}>In Mail-App</a>
      </div>
    </div>
  );
}

function KontaktKarte({ c, zeige }: { c: Extract<Card, { type: 'vcard' }>; zeige: (t: string) => void }) {
  const form = useRef<HTMLFormElement>(null);
  let svg = '';
  try { const q: any = qrcode(0, 'L'); q.stringToBytes = (qrcode as any).stringToBytesFuncs['UTF-8']; q.addData(c.vcf, 'Byte'); q.make(); svg = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch {}
  const tel = (c.vcf.match(/^TEL;TYPE=CELL:(.+)$/m) || [])[1]?.trim();
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
        <div className="hint qr-hint">Am Rechner: QR-Code mit der iPhone-Kamera scannen.</div>
        <form ref={form} method="POST" action="/api/vcard" target="_blank">
          <input type="hidden" name="vcf" value={c.vcf} /><input type="hidden" name="name" value={c.name} />
          <div className="row">
            <button className="btn primary" type="submit">Kontakt speichern</button>
            {tel && <a className="btn" href={`tel:${tel}`}>Anrufen</a>}
            <button className="btn ghost" type="button" onClick={teilen}>Teilen</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function KalenderKarte({ c }: { c: Extract<Card, { type: 'ics' }> }) {
  return (
    <div className="card">
      <div className="to">Kalendereintrag</div>
      <div className="subj">{c.titel}</div>
      <div className="hint">Antippen öffnet „Zum Kalender hinzufügen“. Kalender (WP / PV / TGA) dort auswählen.</div>
      <form method="POST" action="/api/ics" target="_blank">
        <input type="hidden" name="ics" value={c.ics} /><input type="hidden" name="name" value={c.name} />
        <div className="row"><button className="btn primary" type="submit">In Kalender eintragen</button></div>
      </form>
    </div>
  );
}
