'use client';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { WissenEditor } from '@/components/WissenEditor';
import type { Profil } from '@/lib/state';

export type Einrichtungswerte = {
  name: string; beruf: string; branche: string; assistent: string;
  start_strasse: string; start_plz: string; start_ort: string;
  zeitmodell: 'fest' | 'flexibel'; arbeitsbeginn: string; arbeitsende: string; termin_dauer: number; puffer: number; freie_tage: string[];
  arbeitsweise: string[]; nervt: string[]; regeln: string[];
};
export type Wissen = { text: string; quellen: { url: string; titel: string }[]; stand: string };
const LERNSCHRITTE = ['Lese mich in deinen Beruf ein …', 'Schaue, wie ein Kundenkontakt typisch abläuft …', 'Sammle, was Kunden oft fragen …', 'Suche Fachbegriffe und Aktuelles aus der Branche …', 'Schreibe mir ein Briefing …'];

const BRANCHEN = ['Vertrieb / Außendienst', 'Energie & Haustechnik', 'Versicherung & Finanzen', 'Immobilien', 'Handwerk', 'Beratung', 'Gesundheit & Pflege', 'Sonstiges'];
const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const ZEITFRESSER = ['Kontakte abtippen', 'Termine eintragen', 'Routen planen', 'Notizen nach Gesprächen', 'Nachfassen & Wiedervorlagen', 'Mails schreiben', 'Vorbereitung auf Termine'];
const SCHRITTE = ['Über dich', 'Dein Arbeitstag', 'Deine Arbeitsweise'];
const zeilen = (t: string) => t.split('\n').map(x => x.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean);

const BEKANNT = BRANCHEN.slice(0, -1);
const TAGNAMEN = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export function Einrichtung({ fertig, vorlage, abbrechen }: { fertig: (w: Einrichtungswerte, wissen: Wissen | null) => Promise<void> | void; vorlage?: Profil | null; abbrechen?: () => void }) {
  const [schritt, setSchritt] = useState(0);
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  // Phase nach dem Formular: PAI liest sich im Internet in die Branche ein
  const [lernen, setLernen] = useState<null | { status: 'laeuft' | 'fertig' | 'fehler'; werte: Einrichtungswerte; wissen?: Wissen; fehler?: string; suchen?: string[] }>(null);
  const [lernIdx, setLernIdx] = useState(0);
  useEffect(() => { if (lernen?.status !== 'laeuft') return; setLernIdx(0); const t = setInterval(() => setLernIdx(i => Math.min(i + 1, LERNSCHRITTE.length - 1)), 7000); return () => clearInterval(t); }, [lernen?.status]);
  async function einlesen(werte: Einrichtungswerte) {
    setLernen({ status: 'laeuft', werte });
    try {
      const r = await fetch('/api/wissen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beruf: werte.beruf, branche: werte.branche, ort: werte.start_ort, arbeitsweise: werte.arbeitsweise, nervt: werte.nervt }) });
      if (r.status === 401) { location.href = '/login'; return; }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Einlesen hat nicht geklappt.');
      setLernen({ status: 'fertig', werte, wissen: { text: d.text, quellen: d.quellen || [], stand: new Date().toISOString() }, suchen: d.suchen || [] });
    } catch (e: any) { setLernen({ status: 'fehler', werte, fehler: e.message || 'Keine Verbindung.' }); }
  }
  async function abschliessen(wissen: Wissen | null) { if (!lernen) return; setLaeuft(true); try { await fertig(lernen.werte, wissen); } finally { setLaeuft(false); } }
  const v = vorlage;
  const [w, setW] = useState({
    name: v?.name || '', beruf: v?.beruf || '', branche: v ? (BEKANNT.includes(v.branche) ? v.branche : v.branche ? 'Sonstiges' : '') : '', brancheEigen: v && !BEKANNT.includes(v.branche) ? v.branche : '', assistent: v?.assistent || 'PAI',
    start_strasse: v?.start.strasse || '', start_plz: v?.start.plz || '', start_ort: v?.start.ort || '',
    zeitmodell: (v?.zeitmodell || 'fest') as 'fest' | 'flexibel',
    arbeitsbeginn: v?.arbeitsbeginn || '09:00', arbeitsende: v?.arbeitsende || '18:00', termin_dauer: v?.terminDauer || 60, puffer: v?.puffer ?? 15,
    freie_tage: v ? v.freieTage.map(d => TAGNAMEN[d]) : ['Samstag', 'Sonntag'],
    ablauf: v?.arbeitsweise.join('\n') || '', nervt: v ? v.nervt.filter(x => ZEITFRESSER.includes(x)) : [] as string[], nervtEigen: v ? v.nervt.filter(x => !ZEITFRESSER.includes(x)).join('\n') : '', regeln: v?.regeln.join('\n') || '',
  });
  const set = (k: keyof typeof w, v: any) => { setW(x => ({ ...x, [k]: v })); setFehler(''); };
  const umschalten = (k: 'freie_tage' | 'nervt', v: string) => set(k, w[k].includes(v) ? w[k].filter(x => x !== v) : [...w[k], v]);

  function pruefen(s: number) {
    if (s === 0) { if (!w.name.trim()) return 'Bitte deinen Vornamen eintragen.'; if (!w.beruf.trim()) return 'Bitte deinen Beruf eintragen.'; if (!w.branche) return 'Bitte eine Branche wählen.'; }
    if (s === 1) {
      if (!/^\d{5}$/.test(w.start_plz.trim())) return 'Bitte eine fünfstellige PLZ für deinen Startpunkt eintragen.';
      if (!w.start_ort.trim()) return 'Bitte den Ort eintragen.';
      if (w.arbeitsbeginn >= w.arbeitsende) return w.zeitmodell === 'flexibel' ? 'Das späteste Ende muss nach dem frühesten Beginn liegen.' : 'Arbeitsende muss nach dem Arbeitsbeginn liegen.';
      if (w.freie_tage.length === 7) return 'Mindestens ein Tag muss für Termine möglich sein.';
    }
    if (s === 2 && !w.nervt.length && !w.nervtEigen.trim()) return 'Wähl mindestens eine Sache, die dich Zeit kostet – daran richte ich mich aus.';
    return '';
  }
  async function weiter() {
    const f = pruefen(schritt); if (f) { setFehler(f); return; }
    if (schritt < 2) { setSchritt(schritt + 1); window.scrollTo({ top: 0 }); return; }
    const werte: Einrichtungswerte = {
        name: w.name.trim(), beruf: w.beruf.trim(), branche: w.branche === 'Sonstiges' ? w.brancheEigen.trim() || 'Sonstiges' : w.branche,
        assistent: w.assistent.trim() || 'PAI', start_strasse: w.start_strasse.trim(), start_plz: w.start_plz.trim(), start_ort: w.start_ort.trim(),
        zeitmodell: w.zeitmodell, arbeitsbeginn: w.arbeitsbeginn, arbeitsende: w.arbeitsende, termin_dauer: w.termin_dauer, puffer: w.puffer, freie_tage: w.freie_tage,
        arbeitsweise: zeilen(w.ablauf), nervt: [...w.nervt, ...zeilen(w.nervtEigen)], regeln: zeilen(w.regeln),
    };
    // Beim Bearbeiten: neu einlesen nur, wenn sich Beruf oder Branche geändert haben
    if (v?.wissen && v.beruf === werte.beruf && v.branche === werte.branche) { setLaeuft(true); try { await fertig(werte, v.wissen); } finally { setLaeuft(false); } return; }
    einlesen(werte);
  }

  if (lernen) return (
    <div className="setup">
      <div className="setup-col">
        <div className="setup-kopf"><Logo height={40} fg="#000000" /><span className="test">Testdaten</span></div>
        {lernen.status === 'laeuft' && <div className="lernen" aria-live="polite">
          <div className="lern-puls" aria-hidden="true"><span /><span /><span /></div>
          <h1>Ich bereite mich auf dich vor</h1>
          <p className="setup-lead">Bevor wir starten, lese ich mich im Internet zum Beruf <b>{lernen.werte.beruf}</b> ({lernen.werte.branche}) ein – wie eine neue Assistenz vor dem ersten Arbeitstag. Das dauert etwa eine Minute.</p>
          <ul className="lern-schritte">{LERNSCHRITTE.map((t, i) => <li key={t} className={i < lernIdx ? 'fertig' : i === lernIdx ? 'jetzt' : ''}>{t}</li>)}</ul>
          <p className="setup-hinweis">Gesucht wird nur nach Beruf und Branche – nie nach Kunden.</p>
        </div>}
        {lernen.status === 'fertig' && lernen.wissen && <div className="lernen">
          <h1>Fertig eingelesen</h1>
          <p className="setup-lead">Das habe ich über deine Arbeit gelernt. Stimmt etwas nicht oder fehlt etwas? Tipp auf „Bearbeiten“ – du kannst es auch später unter „Mein PAI“ ändern.</p>
          <WissenEditor text={lernen.wissen.text} speichern={t => setLernen(l => (l && l.wissen ? { ...l, wissen: { ...l.wissen, text: t } } : l))} />
          {lernen.wissen.quellen.length > 0 && <div className="quellen">Quellen: {lernen.wissen.quellen.map((q, i) => <a key={i} href={q.url} target="_blank" rel="noopener noreferrer">{q.titel}</a>)}</div>}
          <div className="setup-aktionen"><button className="btn primary gross" disabled={laeuft} onClick={() => abschliessen(lernen.wissen!)}>Zum Chat</button></div>
        </div>}
        {lernen.status === 'fehler' && <div className="lernen">
          <h1>Einlesen hat nicht geklappt</h1>
          <p className="setup-lead">{lernen.fehler} Du kannst es nochmal versuchen oder ohne Branchenwissen starten – ich lerne dann im Chat dazu.</p>
          <div className="setup-aktionen">
            <button className="btn ghost" disabled={laeuft} onClick={() => abschliessen(null)}>Ohne starten</button>
            <button className="btn primary gross" onClick={() => einlesen(lernen.werte)}>Nochmal versuchen</button>
          </div>
        </div>}
      </div>
    </div>
  );

  return (
    <div className="setup">
      <div className="setup-col">
        <div className="setup-kopf"><Logo height={40} fg="#000000" /><span className="test">Testdaten</span></div>
        <h1>{v ? 'Profil bearbeiten' : 'Richte deinen Assistenten ein'}</h1>
        <p className="setup-lead">{v ? 'Deine Kontakte und Notizen bleiben erhalten.' : 'Damit PAI so arbeitet wie du. Dauert zwei Minuten, alles bleibt auf diesem Gerät.'}</p>
        <ol className="fortschritt" aria-label="Fortschritt">
          {SCHRITTE.map((s, i) => <li key={s} className={i === schritt ? 'jetzt' : i < schritt ? 'fertig' : ''}><span>{i + 1}</span>{s}</li>)}
        </ol>

        <form className="setup-form" onSubmit={e => { e.preventDefault(); weiter(); }}>
          {schritt === 0 && <>
            <label>Dein Vorname<input value={w.name} onChange={e => set('name', e.target.value)} autoComplete="given-name" autoFocus /></label>
            <label>Dein Beruf<input value={w.beruf} onChange={e => set('beruf', e.target.value)} placeholder="z. B. Energieberater, Versicherungsmakler" /></label>
            <fieldset><legend>Branche</legend>
              <div className="chips">{BRANCHEN.map(b => <button type="button" key={b} className={w.branche === b ? 'an' : ''} aria-pressed={w.branche === b} onClick={() => set('branche', b)}>{b}</button>)}</div>
              {w.branche === 'Sonstiges' && <input className="mt" value={w.brancheEigen} onChange={e => set('brancheEigen', e.target.value)} placeholder="Welche Branche?" aria-label="Eigene Branche" />}
            </fieldset>
            <label>Wie soll dein Assistent heißen?<input value={w.assistent} onChange={e => set('assistent', e.target.value)} /><small>Du kannst ihm einen eigenen Namen geben.</small></label>
          </>}

          {schritt === 1 && <>
            <fieldset><legend>Wo startet dein Arbeitstag?</legend>
              <small className="unter">Büro oder Zuhause – von hier rechne ich Fahrzeiten.</small>
              <input value={w.start_strasse} onChange={e => set('start_strasse', e.target.value)} placeholder="Straße und Hausnummer (optional)" aria-label="Straße" autoComplete="street-address" />
              <div className="zwei"><input value={w.start_plz} onChange={e => set('start_plz', e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" placeholder="PLZ" aria-label="PLZ" autoComplete="postal-code" /><input value={w.start_ort} onChange={e => set('start_ort', e.target.value)} placeholder="Ort" aria-label="Ort" autoComplete="address-level2" /></div>
            </fieldset>
            <fieldset><legend>Wie arbeitest du?</legend>
              <div className="wahl">
                <button type="button" className={w.zeitmodell === 'fest' ? 'an' : ''} aria-pressed={w.zeitmodell === 'fest'} onClick={() => set('zeitmodell', 'fest')}><b>Feste Arbeitszeiten</b><span>z. B. jeden Tag 9 bis 18 Uhr</span></button>
                <button type="button" className={w.zeitmodell === 'flexibel' ? 'an' : ''} aria-pressed={w.zeitmodell === 'flexibel'} onClick={() => set('zeitmodell', 'flexibel')}><b>Flexibel</b><span>Ich arbeite nur, wenn Kunden Termine haben</span></button>
              </div>
            </fieldset>
            <div className="zwei">
              <label>{w.zeitmodell === 'flexibel' ? 'Termine frühestens ab' : 'Arbeitsbeginn'}<input type="time" value={w.arbeitsbeginn} onChange={e => set('arbeitsbeginn', e.target.value)} /></label>
              <label>{w.zeitmodell === 'flexibel' ? 'Termine enden spätestens' : 'Arbeitsende'}<input type="time" value={w.arbeitsende} onChange={e => set('arbeitsende', e.target.value)} /></label>
            </div>
            {w.zeitmodell === 'flexibel' && <small className="unter">Ich bündle Termine auf wenige Tage, damit du nicht für einen einzelnen Termin losfahren musst.</small>}
            <div className="zwei">
              <label>Übliche Termindauer<select value={w.termin_dauer} onChange={e => set('termin_dauer', +e.target.value)}>{[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} Min.</option>)}</select></label>
              <label>Puffer<select value={w.puffer} onChange={e => set('puffer', +e.target.value)}>{[0, 10, 15, 30, 45].map(m => <option key={m} value={m}>{m} Min.</option>)}</select></label>
            </div>
            <fieldset><legend>{w.zeitmodell === 'flexibel' ? 'An welchen Tagen kannst du nie?' : 'An welchen Tagen keine Termine?'}</legend>
              <div className="chips">{TAGE.map(t => <button type="button" key={t} className={w.freie_tage.includes(t) ? 'an' : ''} aria-pressed={w.freie_tage.includes(t)} onClick={() => umschalten('freie_tage', t)}>{t.slice(0, 2)}</button>)}</div>
            </fieldset>
          </>}

          {schritt === 2 && <>
            <fieldset><legend>Was kostet dich heute am meisten Zeit?</legend>
              <small className="unter">Mehrere möglich. Hier helfe ich dir zuerst.</small>
              <div className="chips">{ZEITFRESSER.map(z => <button type="button" key={z} className={w.nervt.includes(z) ? 'an' : ''} aria-pressed={w.nervt.includes(z)} onClick={() => umschalten('nervt', z)}>{z}</button>)}</div>
              <input className="mt" value={w.nervtEigen} onChange={e => set('nervtEigen', e.target.value)} placeholder="Etwas anderes? (optional)" aria-label="Weitere Zeitfresser" />
            </fieldset>
            <label>Wie läuft ein typischer Kundenkontakt bei dir ab?<textarea rows={4} value={w.ablauf} onChange={e => set('ablauf', e.target.value)} placeholder={'z. B.\nAnfrage kommt per Mail\nErstanruf am selben Tag\nTermin vor Ort\nAngebot innerhalb von 2 Tagen'} /><small>Optional. Ein Schritt pro Zeile.</small></label>
            <label>Was soll ich immer beachten?<textarea rows={3} value={w.regeln} onChange={e => set('regeln', e.target.value)} placeholder={'z. B.\nKunden in Mails siezen\nFreitags nur bis 14 Uhr Termine'} /><small>Optional. Kannst du später im Chat jederzeit ändern.</small></label>
          </>}

          {fehler && <p className="setup-fehler" role="alert">{fehler}</p>}
          <div className="setup-aktionen">
            {schritt === 0 && abbrechen && <button type="button" className="btn ghost" onClick={abbrechen}>Abbrechen</button>}
            {schritt > 0 && <button type="button" className="btn ghost" onClick={() => { setSchritt(schritt - 1); setFehler(''); }}>Zurück</button>}
            <button type="submit" className="btn primary gross" disabled={laeuft}>{schritt < 2 ? 'Weiter' : v ? (laeuft ? 'Speichert …' : 'Speichern') : 'Fertig – los geht’s'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
