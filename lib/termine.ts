import { State, Lead, fullName, nrS, addTL, logP } from './state';
import { at, hm, roundUp, sameDay, sod, isWerktag, feiertag, fd, ft, fdl, localIso, minOfDay } from './zeit';
import { richtung, vertraeglich } from './region';

const MIN = 60000;

// ---------- Anrufe ----------
export function naechsterAnruf(S: State, l: Lead, now = new Date()): Date {
  const r = S.regeln, takt = Math.max(5, r.anrufTakt || 15), step = takt * MIN;
  const [sh, sm] = hm(r.anrufStart), [bh, bm] = hm(r.anrufBis);
  const [kh, km] = l.erreichbar.ab ? hm(l.erreichbar.ab) : [sh, sm];
  const kBis = l.erreichbar.bis ? hm(l.erreichbar.bis) : [bh, bm];
  const vonMin = Math.max(sh * 60 + sm, kh * 60 + km), bisMin = Math.min(bh * 60 + bm, kBis[0] * 60 + kBis[1]);
  const belegt = new Set(S.leads.filter(x => x.id !== l.id && x.next?.typ === 'anruf').map(x => +new Date(x.next!.ts)));
  let t = roundUp(new Date(+now + MIN), takt);
  for (let guard = 0; guard < 2000; guard++) {
    const m = minOfDay(t);
    if (!isWerktag(t) || m > bisMin) { const d = sod(t); d.setDate(d.getDate() + 1); t = at(d, Math.floor(vonMin / 60), vonMin % 60); continue; }
    if (m < vonMin) { t = at(t, Math.floor(vonMin / 60), vonMin % 60); continue; }
    if (belegt.has(+t)) { t = new Date(+t + step); continue; }
    return t;
  }
  return t;
}
export function imZeitfenster(l: Lead, now = new Date()): boolean {
  const m = minOfDay(now);
  if (l.erreichbar.ab) { const [h, mi] = hm(l.erreichbar.ab); if (m < h * 60 + mi) return false; }
  if (l.erreichbar.bis) { const [h, mi] = hm(l.erreichbar.bis); if (m > h * 60 + mi) return false; }
  return true;
}

// ---------- Termine ----------
type Belegung = { a: number; b: number; lead: Lead; art: 'gebucht' | 'angeboten' };

export function abgelaufeneAngeboteEntfernen(S: State, now = new Date()) {
  S.slots = S.slots.filter(s => +new Date(s.ablauf) > +now && S.leads.some(l => l.id === s.leadId && !l.termin));
}
function belegungen(S: State, ohneLead: string, tag: Date): Belegung[] {
  const r = S.regeln, out: Belegung[] = [];
  for (const x of S.leads) if (x.id !== ohneLead && x.termin && sameDay(x.termin.start, tag)) {
    const a = +new Date(x.termin.start); out.push({ a, b: a + (x.termin.dauer || r.terminDauer) * MIN, lead: x, art: 'gebucht' });
  }
  for (const s of S.slots) if (s.leadId !== ohneLead && sameDay(s.start, tag)) {
    const x = S.leads.find(l => l.id === s.leadId); if (!x) continue;
    const a = +new Date(s.start); out.push({ a, b: a + r.terminDauer * MIN, lead: x, art: 'angeboten' });
  }
  return out.sort((p, q) => p.a - q.a);
}
export function terminTagErlaubt(S: State, d: Date) {
  const w = d.getDay(); if (w === 0 || feiertag(d)) return false;
  if (w === 6) return S.regeln.samstag; return !S.regeln.freieTage.includes(w);
}
function frei(start: number, dur: number, buf: number, bel: Belegung[]) {
  const e = start + dur; return bel.every(x => e + buf <= x.a || start >= x.b + buf);
}

export type Vorschlag = { start: Date; grund: string; score: number };

export function termineVorschlagen(S: State, l: Lead, now = new Date(), tageVoraus = 15): Vorschlag[] {
  abgelaufeneAngeboteEntfernen(S, now);
  const r = S.regeln, dur = r.terminDauer * MIN, buf = r.puffer * MIN;
  const [sh, sm] = hm(r.terminStart), [eh, em] = hm(r.terminEnde);
  const kAb = l.erreichbar.ab ? hm(l.erreichbar.ab) : null;
  const vonMin = Math.max(sh * 60 + sm, kAb ? kAb[0] * 60 + kAb[1] : 0);
  const myDir = richtung(l.plz);
  const kandidaten: Vorschlag[] = [];
  const d = sod(now);
  for (let i = 0; i < tageVoraus; i++) {
    d.setDate(d.getDate() + 1);
    if (!terminTagErlaubt(S, d)) continue;
    const bel = belegungen(S, l.id, d);
    if (r.richtung !== 'aus' && bel.some(x => !vertraeglich(myDir, richtung(x.lead.plz), r.richtung === 'streng'))) continue;
    let best: Vorschlag | null = null;
    for (let m = vonMin; m * MIN + dur <= (eh * 60 + em) * MIN; m += 30) {
      const s = +at(d, Math.floor(m / 60), m % 60);
      if (!frei(s, dur, buf, bel)) continue;
      let score = 1, grund = 'Freier Tag – Tour kann um diesen Termin gebaut werden';
      if (bel.length) {
        const gleich = bel.some(x => richtung(x.lead.plz) === myDir);
        score = gleich ? 3 : 2;
        const nb = bel.reduce((p, x) => Math.min(p, Math.abs(s - (x.b + buf)), Math.abs(x.a - (s + dur + buf))), Infinity);
        score += nb <= 30 * MIN ? 1 : 0; // direkt anschließend
        const nah = bel.slice().sort((p, q) => Math.min(Math.abs(s - p.b), Math.abs(p.a - s)) - Math.min(Math.abs(s - q.b), Math.abs(q.a - s)))[0];
        grund = `${s < nah.a ? 'Vor' : 'Nach'} ${nah.lead.nachname} (${nah.lead.ort}) – ${gleich ? 'gleiche Richtung' : 'benachbarte Richtung'}`;
      }
      if (!best || score > best.score) best = { start: new Date(s), grund, score };
    }
    if (best) kandidaten.push(best);
  }
  kandidaten.sort((a, b) => b.score - a.score || +a.start - +b.start);
  return kandidaten.slice(0, 2).sort((a, b) => +a.start - +b.start);
}

// Angebotene Slots reservieren – kein Slot wird zweimal angeboten
export function reservieren(S: State, l: Lead, v: Vorschlag[], now = new Date()) {
  S.slots = S.slots.filter(s => s.leadId !== l.id);
  const ablauf = new Date(+now + S.regeln.angebotGueltigStunden * 3600000).toISOString();
  for (const x of v) S.slots.push({ start: x.start.toISOString(), leadId: l.id, ablauf });
  return ablauf;
}

export function terminBuchen(S: State, l: Lead, start: Date, now = new Date()) {
  const r = S.regeln, dur = r.terminDauer * MIN, buf = r.puffer * MIN;
  if (isNaN(+start)) throw new Error('Unklare Uhrzeit – bitte als JJJJ-MM-TTTHH:MM angeben');
  if (start < now) throw new Error('Der Termin liegt in der Vergangenheit');
  if (!terminTagErlaubt(S, start)) throw new Error(`${fdl(start)} ist laut Regeln kein Termintag${feiertag(start) ? ' (' + feiertag(start) + ')' : ''}`);
  abgelaufeneAngeboteEntfernen(S, now);
  const bel = belegungen(S, l.id, start);
  const clash = bel.find(x => !frei(+start, dur, buf, [x]));
  if (clash) throw new Error(`Überschneidung mit ${fullName(clash.lead)} (${ft(clash.a)} in ${clash.lead.ort}, ${clash.art})`);
  const warn: string[] = [];
  const [sh, sm] = hm(r.terminStart);
  if (minOfDay(start) < sh * 60 + sm) warn.push(`Beginn vor ${r.terminStart} Uhr – entgegen deiner Regel.`);
  const wechsel = !!l.termin;
  if (wechsel) { l.verschiebungen++; if (l.verschiebungen >= 2) warn.push(`${l.verschiebungen}. Verschiebung – ab der dritten ist das ein Signal.`); }
  const typ = l.produkte.includes('WP') ? 'WP' : l.produkte[0];
  l.termin = { start: start.toISOString(), dauer: r.terminDauer, typ };
  l.status = 'termin'; l.next = { typ: 'termin', ts: start.toISOString(), text: 'Hausbesuch' };
  S.slots = S.slots.filter(s => s.leadId !== l.id);
  addTL(l, `Termin ${wechsel ? 'verschoben auf' : 'gebucht'}: ${fdl(start)}, ${ft(start)} Uhr`);
  logP(S, `Termin Lead ${nrS(l)} ${wechsel ? 'verschoben' : 'gebucht'}: ${fd(start)} ${ft(start)}`, 'Im Chat bestätigt');
  return { wechsel, warn };
}

export function angeboteUebersicht(S: State, now = new Date()) {
  abgelaufeneAngeboteEntfernen(S, now);
  return S.slots.map(s => { const l = S.leads.find(x => x.id === s.leadId)!; return { start: localIso(s.start), anzeige: fd(s.start) + ' ' + ft(s.start), lead: nrS(l), name: fullName(l), gueltig_bis: fd(s.ablauf) + ' ' + ft(s.ablauf) }; });
}
