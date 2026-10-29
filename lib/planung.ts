// Disponent: Fahrzeiten, Tagesroute, beste Reihenfolge, freie Zeitfenster. Feste Logik – die KI rechnet nie selbst.
import { State, Termin, Kontakt, adresse, fullName } from './state';
import { Geo, fahrMin, fahrKm } from './region';
import { at, hm, sameDay, sod, feiertag, ft, fd, roundUp } from './zeit';

type Punkt = { geo?: Geo | null };
export const fahrt = (a: Punkt, b: Punkt): number | null => (a.geo && b.geo ? fahrMin(a.geo, b.geo) : null);
export const ende = (t: Termin) => new Date(+new Date(t.start) + t.dauer * 60000);
export const termineAm = (S: State, tag: Date) => S.termine.filter(t => sameDay(t.start, tag)).sort((a, b) => +new Date(a.start) - +new Date(b.start));
const STANDARD_FAHRT = 30; // wenn Koordinaten fehlen

// Tagesroute so, wie sie im Kalender steht: Fahrzeiten zwischen den Terminen und Konflikte.
export function tagesroute(S: State, tag: Date) {
  const ts = termineAm(S, tag), heim = S.profil.start;
  let vorher: Punkt & { name: string; ende: Date | null } = { geo: heim.geo, name: 'Start', ende: null };
  let gesamtMin = 0, gesamtKm = 0, unbekannt = 0;
  const stationen = ts.map(t => {
    const min = fahrt(vorher, t); const k = vorher.geo && t.geo ? fahrKm(vorher.geo, t.geo) : null;
    if (min == null) unbekannt++; else { gesamtMin += min; gesamtKm += k || 0; }
    const luecke = vorher.ende ? Math.round((+new Date(t.start) - +vorher.ende) / 60000) : null;
    const konflikt = luecke != null && min != null && luecke < min ? `Nur ${luecke} Min. zwischen den Terminen, Fahrt dauert etwa ${min} Min.` : luecke != null && luecke < 0 ? 'Überschneidet sich mit dem Termin davor.' : null;
    vorher = { geo: t.geo, name: t.titel, ende: ende(t) };
    return { id: t.id, zeit: `${ft(t.start)}–${ft(ende(t))}`, titel: t.titel, ort: t.ort, fahrt_vorher_min: min, fahrt_vorher_km: k, konflikt };
  });
  const rueck = ts.length ? fahrt(vorher, heim) : null;
  if (rueck != null) { gesamtMin += rueck; gesamtKm += fahrKm(vorher.geo!, heim.geo!); }
  return { tag: fd(tag), stationen, rueckfahrt_min: rueck, fahrzeit_gesamt_min: gesamtMin, strecke_gesamt_km: gesamtKm, ohne_koordinaten: unbekannt, startpunkt: adresse(heim) || 'nicht hinterlegt' };
}

// Beste Reihenfolge der Termine eines Tages (nur Vorschlag – der Nutzer entscheidet).
export function besteReihenfolge(S: State, tag: Date) {
  const ts = termineAm(S, tag).filter(t => t.geo), heim = S.profil.start;
  if (ts.length < 3 || !heim.geo) return null;
  const strecke = (folge: Termin[]) => { let s = 0, p: Punkt = heim; for (const t of folge) { s += fahrMin(p.geo!, t.geo!); p = t; } return s + fahrMin(p.geo!, heim.geo!); };
  const perms = (a: Termin[]): Termin[][] => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r]));
  let best: Termin[];
  if (ts.length <= 7) best = perms(ts).reduce((b, f) => (strecke(f) < strecke(b) ? f : b));
  else { // nächster Nachbar
    best = []; let p: Punkt = heim; const rest = [...ts];
    while (rest.length) { rest.sort((a, b) => fahrMin(p.geo!, a.geo!) - fahrMin(p.geo!, b.geo!)); p = rest.shift()!; best.push(p as Termin); }
  }
  const jetzt = strecke(ts), neu = strecke(best);
  if (jetzt - neu < 10) return { ersparnis_min: 0, hinweis: 'Die Reihenfolge ist schon gut.' };
  const zeiten = ts.map(t => t.start); // gleiche Uhrzeiten, neue Reihenfolge
  return {
    ersparnis_min: jetzt - neu, fahrzeit_jetzt_min: jetzt, fahrzeit_neu_min: neu,
    vorschlag: best.map((t, i) => ({ id: t.id, titel: t.titel, ort: t.ort, bisher: ft(t.start), neu: ft(zeiten[i]) })),
    hinweis: 'Nur ein Vorschlag. Termine werden erst verschoben, wenn der Nutzer zustimmt (und ggf. die Kunden).',
  };
}

// Freie Zeitfenster für einen neuen Termin, möglichst nah an bestehenden Terminen.
export function freieZeiten(S: State, ziel: Punkt, o: { dauer?: number; ab?: Date; tage?: number; anzahl?: number; nurTag?: Date | null }, now = new Date()) {
  const p = S.profil, dauer = o.dauer || p.terminDauer, anzahl = o.anzahl || 3;
  const frueh = roundUp(new Date(Math.max(+now + 2 * 3600e3, +(o.ab || now))), 30);
  const kandidaten: { start: Date; umweg: number; grund: string }[] = [];
  const tage = o.nurTag ? 1 : (o.tage || 10);
  let tag = sod(o.nurTag || frueh);
  for (let n = 0, gesehen = 0; gesehen < tage && n < 40; n++, tag = new Date(+tag + 864e5 + 3600e3), tag = sod(tag)) {
    if (p.freieTage.includes(tag.getDay()) || feiertag(tag)) { if (o.nurTag) break; continue; }
    gesehen++;
    const ts = termineAm(S, tag);
    const [bh, bm] = hm(p.arbeitsbeginn), [eh, em] = hm(p.arbeitsende);
    const beginn = at(tag, bh, bm), schluss = at(tag, eh, em);
    let bester: { start: Date; umweg: number; grund: string } | null = null;
    for (let s = new Date(beginn); +s + dauer * 60000 <= +schluss; s = new Date(+s + 30 * 60000)) {
      if (+s < +frueh) continue;
      const e = new Date(+s + dauer * 60000);
      const vor = [...ts].reverse().find(t => +new Date(t.start) < +s), nach = ts.find(t => +new Date(t.start) >= +s);
      const von: Punkt = vor || p.start, bis: Punkt = nach || p.start;
      const hin = fahrt(von, ziel) ?? STANDARD_FAHRT, weg = fahrt(ziel, bis) ?? STANDARD_FAHRT;
      const frei = vor ? +ende(vor) + (hin + p.puffer) * 60000 : +beginn + hin * 60000;
      if (+s < frei) continue;
      if (nach && +e + (weg + p.puffer) * 60000 > +new Date(nach.start)) continue;
      if (ts.some(t => +new Date(t.start) < +e && +ende(t) > +s)) continue;
      const direkt = vor && nach ? (fahrt(vor, nach) ?? STANDARD_FAHRT) : 0;
      const umweg = vor || nach ? hin + weg - direkt : hin * 2;
      const nah = [vor, nach].filter(Boolean).map(t => ({ t: t!, m: fahrt(t!, ziel) })).filter(x => x.m != null).sort((a, b) => a.m! - b.m!)[0];
      const grund = !ts.length ? 'Freier Tag, noch keine Termine' : nah ? `${nah.m} Min. von „${nah.t.titel}“ (${ft(nah.t.start)})` : 'Passt zwischen die Termine';
      if (!bester || umweg < bester.umweg) bester = { start: s, umweg, grund };
    }
    if (bester) kandidaten.push(bester);
  }
  kandidaten.sort((a, b) => a.umweg - b.umweg || +a.start - +b.start);
  return kandidaten.slice(0, anzahl).sort((a, b) => +a.start - +b.start)
    .map(k => ({ start: `${k.start.getFullYear()}-${String(k.start.getMonth() + 1).padStart(2, '0')}-${String(k.start.getDate()).padStart(2, '0')}T${ft(k.start)}`, anzeige: `${fd(k.start)} ${ft(k.start)}`, umweg_min: k.umweg, grund: k.grund }));
}

// ---------- Navigation (öffnet die Karten-App des Geräts) ----------
const enc = encodeURIComponent;
export const naviLinks = (ziel: string) => ({
  apple: `https://maps.apple.com/?daddr=${enc(ziel)}&dirflg=d`,
  google: `https://www.google.com/maps/dir/?api=1&destination=${enc(ziel)}&travelmode=driving`,
});
export function routenLink(start: string, ziele: string[]) {
  if (!ziele.length) return null;
  const letzte = ziele[ziele.length - 1], zwischen = ziele.slice(0, -1);
  return `https://www.google.com/maps/dir/?api=1${start ? '&origin=' + enc(start) : ''}&destination=${enc(letzte)}${zwischen.length ? '&waypoints=' + enc(zwischen.join('|')) : ''}&travelmode=driving`;
}
export const kontaktZiel = (k: Kontakt) => adresse(k) || fullName(k);
