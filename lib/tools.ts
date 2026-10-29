// Werkzeuge: feste App-Logik, die die KI aufruft. Die KI rechnet und plant nie selbst.
import { State, Kontakt, Termin, Profil, Notiz, LEERES_PROFIL, nrS, fullName, adresse, logP, neueId } from './state';
import { Geo } from './region';
import { tagesroute, besteReihenfolge, freieZeiten, termineAm, naviLinks, routenLink, kontaktZiel, ende, fahrt } from './planung';
import { vcard, ics } from './ausgabe';
import { fd, ft, fdl, relDay, parseTag, parseStart, sameDay, eod, sod, TAG_LANG } from './zeit';

export type Card =
  | { type: 'mail'; an: string; betreff: string; text: string }
  | { type: 'vcard'; name: string; nr: string; vcf: string }
  | { type: 'ics'; name: string; titel: string; ics: string }
  | { type: 'navi'; titel: string; ziel: string; apple: string; google: string }
  | { type: 'route'; titel: string; link: string; stationen: string[] };
// zug = Nummer der aktuellen Nutzer-Nachricht (für Bestätigungen); geo = vorab ermittelte PLZ-Koordinaten
export type Ctx = { S: State; acts: string[]; cards: Card[]; now: Date; zug?: number; geo?: Record<string, Geo | null> };

const S_ = { type: 'string' } as const, N_ = { type: 'number' } as const, B_ = { type: 'boolean' } as const;
const L_ = { type: 'array', items: { type: 'string' } } as const;
const K = { kontakt: { type: 'string', description: 'Kontaktnummer (z. B. "0003") oder Name' } };
const KONTAKT_FELDER = {
  anrede: { type: 'string', enum: ['Herr', 'Frau', ''] }, vorname: S_, nachname: S_, firma: S_, strasse: S_, plz: S_, ort: S_,
  telefon: S_, email: S_, quelle: { type: 'string', description: 'Woher der Kontakt kommt (Empfehlung, Website, Messe …)' },
  status: { type: 'string', description: 'frei, z. B. Interessent, Kunde, Angebot offen, ruhend' }, tags: L_,
};
const PROFIL_FELDER = {
  name: { type: 'string', description: 'Vorname des Nutzers' }, beruf: S_, branche: S_,
  assistent: { type: 'string', description: 'Name, den der Nutzer seinem Assistenten gibt (Standard PAI)' },
  start_strasse: S_, start_plz: S_, start_ort: { type: 'string', description: 'Wo der Arbeitstag beginnt (Büro oder Zuhause)' },
  zeitmodell: { type: 'string', enum: ['fest', 'flexibel'], description: 'fest = feste Arbeitszeiten; flexibel = arbeitet nur, wenn Kunden Termine haben' },
  arbeitsbeginn: { type: 'string', description: 'HH:MM; bei flexibel: frühester Terminbeginn' }, arbeitsende: { type: 'string', description: 'HH:MM; bei flexibel: spätestes Terminende' },
  termin_dauer: { type: 'number', description: 'übliche Termindauer in Minuten' }, puffer: { type: 'number', description: 'Minuten Puffer zwischen Terminen' },
  freie_tage: { type: 'array', items: { type: 'string', enum: TAG_LANG }, description: 'Tage ohne Termine' },
  arbeitsweise: { ...L_, description: 'Abläufe in den Worten des Nutzers' }, regeln: { ...L_, description: 'feste Wünsche, wie PAI arbeiten soll' },
  nervt: { ...L_, description: 'was heute am meisten Zeit kostet' },
};

export const TOOLS = [
  { name: 'profil_anzeigen', description: '„Wie arbeitest du gerade?“: Profil, Arbeitsweise, Regeln und Änderungsverlauf.', input_schema: { type: 'object', properties: {} } },
  { name: 'profil_aendern', description: 'Änderung an Profil oder Arbeitsweise VORSCHLAGEN (noch nicht aktiv). Liefert vorher → nachher. Danach fragen; erst nach dem Ja in einer neuen Nachricht profil_bestaetigen. Listen (arbeitsweise, regeln, nervt, freie_tage) immer komplett neu übergeben.', input_schema: { type: 'object', properties: { feld: { type: 'string', enum: Object.keys(PROFIL_FELDER) }, wert: { description: 'neuer Wert; bei Listen die komplette neue Liste' }, beschreibung: { type: 'string', description: 'in Worten des Nutzers' } }, required: ['feld', 'wert', 'beschreibung'] } },
  { name: 'profil_bestaetigen', description: 'Vorgeschlagene Änderung aktivieren – NUR nachdem der Nutzer in einer neuen Nachricht zugestimmt hat.', input_schema: { type: 'object', properties: { id: N_ }, required: ['id'] } },
  { name: 'wissen_korrigieren', description: 'Sagt der Nutzer, dass etwas in deinem Branchenwissen falsch ist oder fehlt: Korrektur VORSCHLAGEN (noch nicht aktiv). falsch = Wortlaut (oder eindeutiger Teil) des falschen Punkts; richtig = neuer Text (leer = Punkt streichen); ergaenzen = neuer Punkt. Danach vorher → nachher zeigen, fragen, erst nach dem Ja profil_bestaetigen.', input_schema: { type: 'object', properties: { falsch: S_, richtig: S_, ergaenzen: S_, beschreibung: S_ }, required: ['beschreibung'] } },
  { name: 'profil_zuruecknehmen', description: 'Aktive Änderung zurücknehmen oder offenen Vorschlag verwerfen.', input_schema: { type: 'object', properties: { id: N_ }, required: ['id'] } },
  { name: 'uebersicht', description: 'Tagesüberblick: Termine mit Fahrzeiten und Konflikten, fällige Aufgaben, offene Zusagen. Für „was steht an“, „morgen“, „Dienstag“.', input_schema: { type: 'object', properties: { datum: { type: 'string', description: 'heute, morgen, Wochentag oder TT.MM.' } } } },
  { name: 'kontakte_suchen', description: 'Kontakte nach Name, Firma, Ort, PLZ, Status, Tag oder Stichwort in Notizen finden.', input_schema: { type: 'object', properties: { suche: S_ } } },
  { name: 'kontakt_akte', description: 'Vollständige Akte: Daten, Persönliches, alle Gesprächsnotizen, offene Punkte, Termine, Aufgaben.', input_schema: { type: 'object', properties: K, required: ['kontakt'] } },
  { name: 'kontakt_anlegen', description: 'Neuen Kontakt anlegen, z. B. aus einer eingefügten Mail, Signatur oder Visitenkarte. Alle erkennbaren Felder übergeben. Prüft Dubletten (ergänzt dann die Akte) und zeigt die Kontaktkarte.', input_schema: { type: 'object', properties: { ...KONTAKT_FELDER, persoenliches: L_, notiz: { type: 'string', description: 'worum es geht, kurz' }, trotzdem_anlegen: { type: 'boolean', description: 'nur wenn der Nutzer bestätigt, dass es keine Dublette ist' } } } },
  { name: 'kontakt_aktualisieren', description: 'Daten eines Kontakts ergänzen oder korrigieren.', input_schema: { type: 'object', properties: { ...K, ...KONTAKT_FELDER, persoenliches_entfernen: L_ }, required: ['kontakt'] } },
  { name: 'notiz_speichern', description: 'Gespräch, Telefonat oder Sprachnotiz in der Akte festhalten. Du fasst zusammen, das Werkzeug speichert: Zusammenfassung (2–4 Sätze), Vereinbartes, Offenes, persönliche Details (Smalltalk, Familie, Hobbys, Vorlieben – einzeln, kurz) und daraus folgende Aufgaben. Besonders geschützte Angaben (Gesundheit, Religion, Politik usw.) nur mit sensibel_bestaetigt=true, nachdem der Nutzer zugestimmt hat.', input_schema: { type: 'object', properties: { ...K, art: { type: 'string', enum: ['gespraech', 'telefonat', 'notiz', 'mail'] }, zusammenfassung: S_, vereinbart: L_, offen: L_, persoenliches: L_, aufgaben: { type: 'array', items: { type: 'object', properties: { text: S_, faellig: { type: 'string', description: 'JJJJ-MM-TT oder TT.MM.' } }, required: ['text'] } }, sensibel_bestaetigt: B_ }, required: ['kontakt', 'zusammenfassung'] } },
  { name: 'spickzettel', description: 'Vorbereitung auf ein Gespräch oder einen Termin: Persönliches, letzte Gespräche, offene Punkte, Zusagen.', input_schema: { type: 'object', properties: K, required: ['kontakt'] } },
  { name: 'zeiten_vorschlagen', description: 'Freie Zeitfenster für einen neuen Termin, möglichst nah an bestehenden Terminen (wenig Fahrerei), innerhalb der Arbeitszeit. Nichts wird eingetragen.', input_schema: { type: 'object', properties: { ...K, plz: { type: 'string', description: 'falls kein Kontakt: PLZ des Termins' }, dauer: N_, datum: { type: 'string', description: 'nur an diesem Tag suchen' }, anzahl: N_ } } },
  { name: 'termin_eintragen', description: 'Termin eintragen, wenn der Nutzer ihn will. Prüft Überschneidungen und Fahrzeit und zeigt den Kalendereintrag.', input_schema: { type: 'object', properties: { ...K, titel: S_, start: { type: 'string', description: 'JJJJ-MM-TTTHH:MM (lokale Zeit)' }, dauer: N_, ort: { type: 'string', description: 'Adresse, falls nicht die des Kontakts' }, plz: S_, notiz: S_ }, required: ['start'] } },
  { name: 'termin_verschieben', description: 'Termin auf eine neue Zeit legen – nur nach Zustimmung des Nutzers.', input_schema: { type: 'object', properties: { termin: { type: 'number', description: 'Termin-ID' }, start: { type: 'string', description: 'JJJJ-MM-TTTHH:MM' } }, required: ['termin', 'start'] } },
  { name: 'termin_absagen', description: 'Termin entfernen.', input_schema: { type: 'object', properties: { termin: N_, grund: S_ }, required: ['termin'] } },
  { name: 'tagesroute', description: 'Route eines Tages: Reihenfolge, Fahrzeiten, Konflikte, Link für die Navigation mit allen Stopps, und ob eine andere Reihenfolge Fahrzeit spart (nur Vorschlag).', input_schema: { type: 'object', properties: { datum: S_ } } },
  { name: 'navigation', description: 'Navigation zu einem Kontakt oder Termin starten (Karte mit Apple- und Google-Maps-Link).', input_schema: { type: 'object', properties: { ...K, termin: N_ } } },
  { name: 'aufgabe_anlegen', description: 'Aufgabe oder Wiedervorlage anlegen.', input_schema: { type: 'object', properties: { ...K, text: S_, faellig: S_ }, required: ['text'] } },
  { name: 'aufgabe_erledigt', description: 'Aufgabe als erledigt markieren.', input_schema: { type: 'object', properties: { id: N_ }, required: ['id'] } },
  { name: 'mail_entwurf', description: 'E-Mail-Entwurf als Karte. Du schreibst Betreff und Text; der Nutzer kopiert und sendet selbst.', input_schema: { type: 'object', properties: { ...K, an: S_, betreff: S_, text: S_ }, required: ['betreff', 'text'] } },
  { name: 'kontaktkarte', description: 'Kontaktkarte (vCard) zum Speichern im Telefonbuch anzeigen.', input_schema: { type: 'object', properties: K, required: ['kontakt'] } },
  { name: 'kontakt_loeschen', description: 'Kontakt mit allen Notizen löschen. Nur nach ausdrücklicher Bestätigung.', input_schema: { type: 'object', properties: { ...K, bestaetigt: B_ }, required: ['kontakt', 'bestaetigt'] } },
  { name: 'beispieldaten_laden', description: 'Erfundene Beispielkontakte mit Notizen und Terminen laden, damit der Nutzer PAI ausprobieren kann. Nur auf Wunsch.', input_schema: { type: 'object', properties: {} } },
];

// ---------- Hilfen ----------
const liste = (x: unknown) => (Array.isArray(x) ? x : x ? [x] : []).map(v => String(v).trim()).filter(Boolean);
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
const telNorm = (t: string) => String(t || '').replace(/\D/g, '').replace(/^49/, '0').replace(/^0+/, '');
const isoDatum = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function findKontakt(S: State, q: unknown): Kontakt {
  const s = String(q ?? '').trim(); if (!s) throw new Error('Welcher Kontakt?');
  if (/^\d{1,4}$/.test(s)) { const k = S.kontakte.find(x => x.nr === +s); if (k) return k; }
  const n = norm(s);
  const treffer = S.kontakte.filter(k => norm(`${fullName(k)} ${k.firma} ${k.nachname}`).includes(n) || n.includes(norm(k.nachname || '#')));
  if (treffer.length === 1) return treffer[0];
  if (treffer.length > 1) throw new Error(`Mehrere Treffer: ${treffer.slice(0, 5).map(k => `${nrS(k)} ${fullName(k)} (${k.ort})`).join(', ')} – welcher?`);
  throw new Error(`Kein Kontakt „${s}“ gefunden`);
}
function findTermin(S: State, id: unknown): Termin {
  const t = S.termine.find(x => x.id === Number(id)); if (!t) throw new Error('Termin nicht gefunden – erst uebersicht oder kontakt_akte aufrufen'); return t;
}
function dublette(S: State, i: any): Kontakt | null {
  const mail = String(i.email || '').toLowerCase(), tel = telNorm(i.telefon);
  return S.kontakte.find(k => (mail && k.email.toLowerCase() === mail) || (tel.length > 5 && telNorm(k.tel) === tel)
    || (i.nachname && norm(k.nachname) === norm(i.nachname) && norm(k.vorname || '') === norm(i.vorname || '') && (!i.plz || k.plz === String(i.plz)))) || null;
}
const FELDMAP: [string, keyof Kontakt][] = [['anrede', 'anrede'], ['vorname', 'vorname'], ['nachname', 'nachname'], ['firma', 'firma'], ['strasse', 'strasse'], ['plz', 'plz'], ['ort', 'ort'], ['telefon', 'tel'], ['email', 'email'], ['quelle', 'quelle'], ['status', 'status']];
function felder(k: Kontakt, i: any, nurLeere = false) {
  const g: string[] = [];
  for (const [von, nach] of FELDMAP) {
    const v = i[von]; if (v === undefined || v === null || v === '') continue;
    if (nurLeere && k[nach]) continue;
    (k as any)[nach] = nach === 'plz' ? String(v).replace(/\D/g, '') : String(v).trim(); g.push(von);
  }
  if (i.tags) { k.tags = [...new Set([...k.tags, ...liste(i.tags)])]; g.push('tags'); }
  return g;
}
const geoFuer = (ctx: Ctx, plz?: string) => (plz && ctx.geo?.[plz]) || null;

// Besonders geschützte Daten (Art. 9 DSGVO): erst nachfragen, dann speichern.
const SENSIBEL = /\b(krank\w*|krankheit|diagnose|therapie|operation|op\b|krebs|herz\w*|diabet\w*|demenz|depress\w*|schwanger\w*|behinder\w*|rollstuhl|r[üu]cken\w*|medikament\w*|klinik|krankenhaus|pflegegrad|religi\w*|kirche|moschee|synagoge|glaube|muslim\w*|christ\w*|jud\w*|partei|w[äa]hlt|afd|cdu|spd|gr[üu]ne|gewerkschaft|sexuell\w*|schwul|lesbisch|vorstrafe\w*)\b/i;

function notizKurz(n: Notiz) { return { datum: `${fd(n.ts)} ${ft(n.ts)}`, art: n.art, zusammenfassung: n.zusammenfassung, vereinbart: n.vereinbart, offen: n.offen }; }
function terminKurz(t: Termin, now: Date) { return { id: t.id, wann: `${relDay(t.start, now)} ${ft(t.start)}–${ft(ende(t))}`, titel: t.titel, ort: t.ort }; }

function akte(S: State, k: Kontakt, now: Date) {
  const termine = S.termine.filter(t => t.kontaktId === k.id).sort((a, b) => +new Date(a.start) - +new Date(b.start));
  return {
    kontakt: nrS(k), name: fullName(k), anrede: k.anrede, firma: k.firma || null, adresse: adresse(k) || null, telefon: k.tel || null, email: k.email || null,
    quelle: k.quelle || null, status: k.status || null, tags: k.tags, angelegt: fd(k.erstellt),
    persoenliches: k.persoenliches,
    notizen: k.notizen.slice(-10).map(notizKurz),
    offene_punkte: k.notizen.flatMap(n => n.offen).slice(-8),
    termine: termine.filter(t => +ende(t) >= +now).map(t => terminKurz(t, now)),
    letzter_termin: termine.filter(t => +ende(t) < +now).map(t => `${fd(t.start)} ${t.titel}`).pop() || null,
    aufgaben: S.aufgaben.filter(a => a.kontaktId === k.id && !a.erledigt).map(a => ({ id: a.id, text: a.text, faellig: a.faellig ? relDay(a.faellig, now) : null })),
  };
}

// Profil-Felder ↔ Werte
function profilWert(p: Profil, feld: string): unknown {
  if (feld === 'start_strasse') return p.start.strasse; if (feld === 'start_plz') return p.start.plz; if (feld === 'start_ort') return p.start.ort;
  if (feld === 'termin_dauer') return p.terminDauer; if (feld === 'freie_tage') return p.freieTage.map(d => TAG_LANG[d]);
  return (p as any)[feld];
}
function profilPruefen(feld: string, v: any): unknown {
  if (['arbeitsweise', 'regeln', 'nervt'].includes(feld)) return liste(v);
  if (feld === 'zeitmodell') { const z = String(v); if (z !== 'fest' && z !== 'flexibel') throw new Error('zeitmodell: fest oder flexibel'); return z; }
  if (feld === 'wissen') return String(v ?? '').trim();
  if (feld === 'freie_tage') { const t = liste(v).map(x => TAG_LANG.findIndex(n => norm(n) === norm(x))).filter(x => x >= 0); return t.map(d => TAG_LANG[d]); }
  if (['arbeitsbeginn', 'arbeitsende'].includes(feld)) { const m = String(v).match(/^(\d{1,2})(?::(\d{2}))?/); if (!m || +m[1] > 23) throw new Error('Uhrzeit als HH:MM'); return `${m[1].padStart(2, '0')}:${m[2] || '00'}`; }
  if (['termin_dauer', 'puffer'].includes(feld)) { const n = Number(v); if (!isFinite(n) || n < 0 || n > 600) throw new Error('Minuten zwischen 0 und 600'); return Math.round(n); }
  if (feld === 'start_plz') return String(v).replace(/\D/g, '');
  return String(v ?? '').trim();
}
function profilSetzen(ctx: Ctx, feld: string, v: any) {
  const p = ctx.S.profil;
  if (feld === 'start_strasse') p.start.strasse = v;
  else if (feld === 'start_plz') { p.start.plz = v; p.start.geo = geoFuer(ctx, v); }
  else if (feld === 'start_ort') p.start.ort = v;
  else if (feld === 'termin_dauer') p.terminDauer = v;
  else if (feld === 'wissen') p.wissen = { quellen: [], stand: new Date().toISOString(), ...(p.wissen || {}), text: v };
  else if (feld === 'freie_tage') p.freieTage = (v as string[]).map(x => TAG_LANG.indexOf(x)).filter(x => x >= 0);
  else (p as any)[feld] = v;
}
export function profilKurz(p: Profil) {
  return { name: p.name, beruf: p.beruf, branche: p.branche, assistent: p.assistent, startpunkt: adresse(p.start) || null,
    zeitmodell: p.zeitmodell === 'flexibel' ? 'flexibel – arbeitet nur, wenn Kunden Termine haben; Termine bündeln, keine leeren Tage verplanen' : 'feste Arbeitszeiten',
    [p.zeitmodell === 'flexibel' ? 'termine_moeglich' : 'arbeitszeit']: `${p.arbeitsbeginn}–${p.arbeitsende}`, termin_dauer_min: p.terminDauer, puffer_min: p.puffer,
    freie_tage: p.freieTage.map(d => TAG_LANG[d]), arbeitsweise: p.arbeitsweise, regeln: p.regeln, nervt: p.nervt };
}

function kontaktKarte(ctx: Ctx, k: Kontakt) { ctx.cards.push({ type: 'vcard', name: fullName(k), nr: nrS(k), vcf: vcard(k) }); }
function kalenderKarte(ctx: Ctx, t: Termin) {
  const k = t.kontaktId ? ctx.S.kontakte.find(x => x.id === t.kontaktId) : null;
  ctx.cards.push({ type: 'ics', name: t.titel, titel: `${t.titel} · ${fd(t.start)} ${ft(t.start)}`, ics: ics(t, k) });
}
function konflikte(S: State, t: Termin) {
  const tag = termineAm(S, new Date(t.start)), i = tag.findIndex(x => x.id === t.id), w: string[] = [];
  const vor = tag[i - 1], nach = tag[i + 1];
  for (const x of tag) if (x.id !== t.id && +new Date(x.start) < +ende(t) && +ende(x) > +new Date(t.start)) w.push(`Überschneidet sich mit „${x.titel}“ (${ft(x.start)})`);
  if (vor && !w.length) { const m = fahrt(vor, t), l = (+new Date(t.start) - +ende(vor)) / 60000; if (m != null && l < m + S.profil.puffer) w.push(`Nur ${Math.round(l)} Min. nach „${vor.titel}“, Fahrt ca. ${m} Min.`); }
  if (nach && !w.length) { const m = fahrt(t, nach), l = (+new Date(nach.start) - +ende(t)) / 60000; if (m != null && l < m + S.profil.puffer) w.push(`Nur ${Math.round(l)} Min. bis „${nach.titel}“, Fahrt ca. ${m} Min.`); }
  const [eh, em] = S.profil.arbeitsende.split(':').map(Number), e = ende(t);
  if (e.getHours() * 60 + e.getMinutes() > eh * 60 + em) w.push(S.profil.zeitmodell === 'flexibel' ? `Endet nach deinem spätesten Termin-Ende (${S.profil.arbeitsende})` : `Endet nach deinem Arbeitsende (${S.profil.arbeitsende})`);
  if (S.profil.freieTage.includes(new Date(t.start).getDay())) w.push(`${TAG_LANG[new Date(t.start).getDay()]} ist eigentlich dein freier Tag`);
  return w;
}

export function ausfuehren(name: string, i: any, ctx: Ctx): unknown {
  const { S, now } = ctx; const act = (t: string) => ctx.acts.push(t);
  switch (name) {
    case 'profil_einrichten': {
      if (S.profil.eingerichtet) throw new Error('Profil ist schon eingerichtet – Änderungen über profil_aendern mit Bestätigung.');
      for (const [f, v] of Object.entries(i || {})) { if (v === undefined || v === null || v === '' || !(f in PROFIL_FELDER)) continue; profilSetzen(ctx, f, profilPruefen(f, v)); }
      S.profil.eingerichtet = true; logP(S, 'Profil eingerichtet');
      act(`Profil eingerichtet${S.profil.name ? ' für ' + S.profil.name : ''}`);
      return { eingerichtet: true, profil: profilKurz(S.profil), hinweis: S.profil.start.plz ? null : 'Startpunkt fehlt – ohne ihn keine Fahrzeiten ab Start.' };
    }
    case 'profil_anzeigen': {
      act('Profil gelesen');
      return { ...profilKurz(S.profil), aenderungen: S.aenderungen.slice(-15).map(a => `#${a.id} ${fd(a.ts)} [${a.status}] ${a.text}`), protokoll: S.log.slice(-8).map(x => `${fd(x.ts)} ${ft(x.ts)} ${x.text}`) };
    }
    case 'profil_aendern': {
      const feld = String(i.feld); if (!(feld in PROFIL_FELDER)) throw new Error('Unbekanntes Feld');
      const vorher = profilWert(S.profil, feld), nachher = profilPruefen(feld, i.wert);
      S.aenderungen.forEach(a => { if (a.status === 'offen' && a.feld === feld) a.status = 'zurueckgenommen'; });
      const id = (S.aenderungen.at(-1)?.id || 0) + 1;
      S.aenderungen.push({ id, ts: now.toISOString(), feld, vorher: structuredClone(vorher), nachher, text: String(i.beschreibung || ''), status: 'offen', zug: ctx.zug ?? 0 });
      act(`Änderung #${id} vorgeschlagen – wartet auf dein Ja`);
      return { id, vorher, nachher, hinweis: 'Noch nicht aktiv. Vorher → nachher zeigen und fragen, ob das ab jetzt gelten soll.' };
    }
    case 'wissen_korrigieren': {
      const alt = S.profil.wissen?.text || ''; let neu = alt; let vorher = '', nachher = '';
      if (i.falsch) {
        const zeilen = alt.split('\n'), q = norm(String(i.falsch));
        const idx = zeilen.findIndex(z => !z.startsWith('#') && norm(z).includes(q));
        if (idx < 0) throw new Error('Diesen Punkt finde ich im Branchenwissen nicht – Wortlaut prüfen.');
        vorher = zeilen[idx].replace(/^-\s*/, '');
        if (i.richtig) { zeilen[idx] = '- ' + String(i.richtig).trim(); nachher = String(i.richtig).trim(); } else { zeilen.splice(idx, 1); nachher = '(gestrichen)'; }
        neu = zeilen.join('\n');
      }
      if (i.ergaenzen) { neu = /### Von dir ergänzt/.test(neu) ? neu + '\n- ' + String(i.ergaenzen).trim() : `${neu}\n\n### Von dir ergänzt\n- ${String(i.ergaenzen).trim()}`; nachher = [nachher, '+ ' + String(i.ergaenzen).trim()].filter(Boolean).join(' · '); }
      if (neu === alt) throw new Error('Nichts zu ändern');
      S.aenderungen.forEach(a => { if (a.status === 'offen' && a.feld === 'wissen') a.status = 'zurueckgenommen'; });
      const id = (S.aenderungen.at(-1)?.id || 0) + 1;
      S.aenderungen.push({ id, ts: now.toISOString(), feld: 'wissen', vorher: alt, nachher: neu, text: String(i.beschreibung || 'Branchenwissen korrigiert'), status: 'offen', zug: ctx.zug ?? 0 });
      act(`Korrektur #${id} vorgeschlagen – wartet auf dein Ja`);
      return { id, vorher: vorher || '(neu)', nachher, hinweis: 'Noch nicht aktiv. Zeigen und fragen, ob das so stimmt.' };
    }
    case 'profil_bestaetigen': {
      const a = S.aenderungen.find(x => x.id === Number(i.id)); if (!a || a.status !== 'offen') throw new Error('Kein offener Vorschlag mit dieser Nummer');
      if ((ctx.zug ?? 0) <= a.zug) throw new Error('Bestätigung muss vom Nutzer in einer neuen Nachricht kommen – erst fragen.');
      profilSetzen(ctx, a.feld, a.nachher); a.status = 'aktiv'; a.ts = now.toISOString();
      logP(S, `Profil geändert (#${a.id}): ${a.text}`); act(`Ab jetzt aktiv (#${a.id}): ${a.text}`);
      return { aktiv: true, id: a.id };
    }
    case 'profil_zuruecknehmen': {
      const a = S.aenderungen.find(x => x.id === Number(i.id)); if (!a || a.status === 'zurueckgenommen') throw new Error('Keine Änderung mit dieser Nummer');
      if (a.status === 'aktiv') { profilSetzen(ctx, a.feld, a.feld === 'freie_tage' ? a.vorher : profilPruefen(a.feld, a.vorher)); logP(S, `Änderung #${a.id} zurückgenommen`); }
      a.status = 'zurueckgenommen'; act(`Zurückgenommen (#${a.id}): ${a.text}`);
      return { zurueckgenommen: a.id, wieder: a.vorher };
    }

    case 'uebersicht': {
      const tag = parseTag(i.datum, now);
      const r = tagesroute(S, tag);
      const ts = termineAm(S, tag).map(t => {
        const k = t.kontaktId ? S.kontakte.find(x => x.id === t.kontaktId) : null;
        const letzte = k?.notizen.at(-1);
        return { ...terminKurz(t, now), kontakt: k ? `${nrS(k)} ${fullName(k)}` : null, zuletzt: letzte ? `${fd(letzte.ts)}: ${letzte.zusammenfassung}` : null, offen: k ? k.notizen.flatMap(n => n.offen).slice(-3) : [] };
      });
      const aufgaben = S.aufgaben.filter(a => !a.erledigt && (!a.faellig || +new Date(a.faellig) <= +eod(tag)))
        .map(a => { const k = a.kontaktId ? S.kontakte.find(x => x.id === a.kontaktId) : null; return { id: a.id, text: a.text, kontakt: k ? fullName(k) : null, faellig: a.faellig ? (+new Date(a.faellig) < +sod(now) ? 'überfällig' : relDay(a.faellig, now)) : 'ohne Datum' }; });
      act(`Überblick ${relDay(tag, now)}`);
      return { tag: fdl(tag), termine: ts, fahrzeit_gesamt_min: r.fahrzeit_gesamt_min, konflikte: r.stationen.filter(s => s.konflikt).map(s => `${s.zeit} ${s.titel}: ${s.konflikt}`), aufgaben, kontakte_gesamt: S.kontakte.length };
    }
    case 'kontakte_suchen': {
      const q = norm(String(i.suche || ''));
      const r = S.kontakte.filter(k => !q || norm([fullName(k), k.firma, k.ort, k.plz, k.status, k.tags.join(' '), k.persoenliches.join(' '), k.notizen.map(n => n.zusammenfassung).join(' ')].join(' ')).includes(q));
      act(`${r.length} Kontakt${r.length === 1 ? '' : 'e'} gefunden`);
      return r.slice(0, 25).map(k => ({ kontakt: nrS(k), name: fullName(k), firma: k.firma || null, ort: k.ort, status: k.status || null, letzte_notiz: k.notizen.at(-1) ? fd(k.notizen.at(-1)!.ts) : null }));
    }
    case 'kontakt_akte': { const k = findKontakt(S, i.kontakt); act(`Akte ${nrS(k)} ${fullName(k)} gelesen`); return akte(S, k, now); }
    case 'kontakt_anlegen': {
      const d = i.trotzdem_anlegen ? null : dublette(S, i);
      if (d) {
        const neu = felder(d, i, true);
        if (i.persoenliches) d.persoenliches = [...new Set([...d.persoenliches, ...liste(i.persoenliches)])];
        act(`Kontakt gibt es schon: ${nrS(d)} ${fullName(d)} – ${neu.length ? 'Lücken ergänzt' : 'nichts geändert'}`);
        return { dublette: true, kontakt: nrS(d), name: fullName(d), ergaenzt: neu, hinweis: 'Bestehende Akte ergänzt, nichts überschrieben.' };
      }
      const k: Kontakt = { id: crypto.randomUUID(), nr: S.nextNr++, anrede: '', vorname: '', nachname: '', firma: '', strasse: '', plz: '', ort: '', tel: '', email: '', quelle: '', status: '', tags: [], persoenliches: liste(i.persoenliches), notizen: [], erstellt: now.toISOString() };
      felder(k, i);
      if (!k.vorname && !k.nachname && !k.firma) { S.nextNr--; throw new Error('Name oder Firma fehlt'); }
      k.geo = geoFuer(ctx, k.plz);
      if (i.notiz) k.notizen.push({ id: neueId(S), ts: now.toISOString(), art: 'notiz', zusammenfassung: String(i.notiz), vereinbart: [], offen: [] });
      S.kontakte.push(k); kontaktKarte(ctx, k); logP(S, `Kontakt ${nrS(k)} angelegt`);
      act(`Kontakt ${nrS(k)} angelegt: ${fullName(k)}${k.ort ? ', ' + k.ort : ''}`);
      const fehlt = [!k.tel && 'Telefon', !k.email && 'E-Mail', !k.plz && 'Adresse'].filter(Boolean);
      return { kontakt: nrS(k), name: fullName(k), fehlt, kontaktkarte: 'wird angezeigt' };
    }
    case 'kontakt_aktualisieren': {
      const k = findKontakt(S, i.kontakt); const g = felder(k, i);
      if (i.plz) k.geo = geoFuer(ctx, k.plz);
      const weg = liste(i.persoenliches_entfernen).map(norm);
      if (weg.length) { k.persoenliches = k.persoenliches.filter(p => !weg.some(w => norm(p).includes(w))); g.push('persoenliches'); }
      act(`${nrS(k)} aktualisiert: ${g.join(', ') || 'nichts'}`);
      return { kontakt: nrS(k), geaendert: g };
    }
    case 'notiz_speichern': {
      const k = findKontakt(S, i.kontakt);
      const pers = liste(i.persoenliches), text = [i.zusammenfassung, ...liste(i.vereinbart), ...liste(i.offen), ...pers].join(' ');
      const treffer = text.match(SENSIBEL);
      if (treffer && !i.sensibel_bestaetigt) {
        act('Gespeichert wird erst nach deiner Rückfrage');
        return { gespeichert: false, rueckfrage: `Die Notiz enthält eventuell besonders geschützte Angaben („${treffer[0]}“: Gesundheit, Religion, Politik o. Ä.). Frag den Nutzer, ob das wirklich in die Akte soll oder ob du es weglässt. Erst danach erneut speichern.` };
      }
      const n: Notiz = { id: neueId(S), ts: now.toISOString(), art: i.art || 'gespraech', zusammenfassung: String(i.zusammenfassung).trim(), vereinbart: liste(i.vereinbart), offen: liste(i.offen) };
      k.notizen.push(n);
      const neuPers = pers.filter(p => !k.persoenliches.some(x => norm(x) === norm(p)));
      k.persoenliches.push(...neuPers);
      const aufg = (Array.isArray(i.aufgaben) ? i.aufgaben : []).filter((a: any) => a?.text).map((a: any) => {
        const f = a.faellig ? parseTag(a.faellig, now) : null;
        const x = { id: neueId(S), kontaktId: k.id, text: String(a.text), faellig: f ? isoDatum(f) : null, erledigt: false, erstellt: now.toISOString() };
        S.aufgaben.push(x); return `${x.text}${f ? ' (' + relDay(f, now) + ')' : ''}`;
      });
      logP(S, `Notiz zu ${nrS(k)} gespeichert`);
      act(`Notiz in Akte ${nrS(k)} ${fullName(k)} gespeichert`);
      if (neuPers.length) act(`${neuPers.length} persönliche${neuPers.length === 1 ? 's Detail' : ' Details'} gemerkt`);
      if (aufg.length) act(`${aufg.length} Aufgabe${aufg.length === 1 ? '' : 'n'} angelegt`);
      return { gespeichert: true, kontakt: nrS(k), persoenliches_neu: neuPers, aufgaben_neu: aufg };
    }
    case 'spickzettel': {
      const k = findKontakt(S, i.kontakt); const a = akte(S, k, now);
      act(`Spickzettel ${fullName(k)}`);
      return { name: a.name, anrede: k.anrede, persoenliches: a.persoenliches, letzte_gespraeche: a.notizen.slice(-3), offene_punkte: a.offene_punkte, zugesagt: k.notizen.flatMap(n => n.vereinbart).slice(-5), naechster_termin: a.termine[0] || null, aufgaben: a.aufgaben };
    }
    case 'zeiten_vorschlagen': {
      const k = i.kontakt ? findKontakt(S, i.kontakt) : null;
      const plz = k?.plz || String(i.plz || '').replace(/\D/g, '');
      const ziel = { geo: k?.geo || geoFuer(ctx, plz) };
      const v = freieZeiten(S, ziel, { dauer: i.dauer, anzahl: i.anzahl || 3, nurTag: i.datum ? parseTag(i.datum, now) : null }, now);
      act(`${v.length} freie Zeitfenster gefunden`);
      return { vorschlaege: v, hinweis: ziel.geo ? 'Nichts eingetragen – erst nach Zustimmung termin_eintragen.' : 'Ohne PLZ keine Fahrzeiten – Vorschläge nur nach Kalenderlücken.' };
    }
    case 'termin_eintragen': {
      const k = i.kontakt ? findKontakt(S, i.kontakt) : null;
      const start = parseStart(i.start, now); if (isNaN(+start)) throw new Error('Startzeit als JJJJ-MM-TTTHH:MM');
      if (+start < +now - 3600e3) throw new Error('Der Termin liegt in der Vergangenheit');
      const plz = String(i.plz || k?.plz || '').replace(/\D/g, '');
      const t: Termin = { id: neueId(S), kontaktId: k?.id, titel: String(i.titel || (k ? fullName(k) + (k.firma && k.vorname ? ', ' + k.firma : '') : 'Termin')), start: `${isoDatum(start)}T${ft(start)}`, dauer: Number(i.dauer) || S.profil.terminDauer, ort: String(i.ort || (k ? adresse(k) : '')), plz, geo: k && !i.ort ? k.geo : geoFuer(ctx, plz), notiz: i.notiz };
      S.termine.push(t);
      const warn = konflikte(S, t);
      kalenderKarte(ctx, t); logP(S, `Termin ${t.titel} ${fd(t.start)} ${ft(t.start)}`);
      act(`Termin eingetragen: ${fd(t.start)} ${ft(t.start)} ${t.titel}`);
      warn.forEach(w => act('Achtung: ' + w));
      return { termin: t.id, wann: `${fdl(t.start)}, ${ft(t.start)}–${ft(ende(t))}`, warnungen: warn };
    }
    case 'termin_verschieben': {
      const t = findTermin(S, i.termin); const alt = `${fd(t.start)} ${ft(t.start)}`;
      const start = parseStart(i.start, now); if (isNaN(+start)) throw new Error('Startzeit als JJJJ-MM-TTTHH:MM');
      t.start = `${isoDatum(start)}T${ft(start)}`;
      const warn = konflikte(S, t); kalenderKarte(ctx, t);
      act(`Verschoben: ${t.titel} ${alt} → ${fd(t.start)} ${ft(t.start)}`); warn.forEach(w => act('Achtung: ' + w));
      return { termin: t.id, neu: `${fdl(t.start)}, ${ft(t.start)}`, warnungen: warn, hinweis: 'Neuen Kalendereintrag speichern, alten im Kalender löschen. Ggf. Kunden informieren.' };
    }
    case 'termin_absagen': {
      const t = findTermin(S, i.termin); S.termine = S.termine.filter(x => x.id !== t.id);
      act(`Termin entfernt: ${fd(t.start)} ${ft(t.start)} ${t.titel}`);
      return { entfernt: t.id, hinweis: 'Auch im Kalender löschen.' };
    }
    case 'tagesroute': {
      const tag = parseTag(i.datum, now); const r = tagesroute(S, tag);
      const ts = termineAm(S, tag); const start = adresse(S.profil.start);
      if (ts.length) {
        const link = routenLink(start, ts.map(t => t.ort || t.titel));
        if (link) ctx.cards.push({ type: 'route', titel: `Route ${relDay(tag, now)} · ${ts.length} Termin${ts.length === 1 ? '' : 'e'}`, link, stationen: ts.map(t => `${ft(t.start)} ${t.titel}${t.ort ? ' – ' + t.ort : ''}`) });
      }
      act(`Route ${relDay(tag, now)} geprüft`);
      return { ...r, bessere_reihenfolge: besteReihenfolge(S, tag) };
    }
    case 'navigation': {
      let ziel = '', titel = '';
      if (i.termin) { const t = findTermin(S, i.termin); ziel = t.ort || t.titel; titel = `${ft(t.start)} ${t.titel}`; }
      else { const k = findKontakt(S, i.kontakt); ziel = kontaktZiel(k); titel = fullName(k); if (!adresse(k)) throw new Error('Keine Adresse in der Akte'); }
      ctx.cards.push({ type: 'navi', titel, ziel, ...naviLinks(ziel) }); act(`Navigation: ${titel}`);
      return { angezeigt: true, ziel };
    }
    case 'aufgabe_anlegen': {
      const k = i.kontakt ? findKontakt(S, i.kontakt) : null; const f = i.faellig ? parseTag(i.faellig, now) : null;
      const a = { id: neueId(S), kontaktId: k?.id, text: String(i.text), faellig: f ? isoDatum(f) : null, erledigt: false, erstellt: now.toISOString() };
      S.aufgaben.push(a); act(`Aufgabe: ${a.text}${f ? ' (' + relDay(f, now) + ')' : ''}`);
      return { aufgabe: a.id };
    }
    case 'aufgabe_erledigt': {
      const a = S.aufgaben.find(x => x.id === Number(i.id)); if (!a) throw new Error('Aufgabe nicht gefunden');
      a.erledigt = true; act(`Erledigt: ${a.text}`); return { erledigt: a.id };
    }
    case 'mail_entwurf': {
      const k = i.kontakt ? findKontakt(S, i.kontakt) : null;
      ctx.cards.push({ type: 'mail', an: String(i.an || k?.email || ''), betreff: String(i.betreff), text: String(i.text) });
      act('Mail-Entwurf erstellt'); return { angezeigt: true, hinweis: 'Nutzer kopiert und sendet selbst. Text nicht wiederholen.' };
    }
    case 'kontaktkarte': { const k = findKontakt(S, i.kontakt); kontaktKarte(ctx, k); act(`Kontaktkarte ${fullName(k)}`); return { angezeigt: true }; }
    case 'kontakt_loeschen': {
      if (!i.bestaetigt) throw new Error('Löschen braucht die ausdrückliche Bestätigung des Nutzers');
      const k = findKontakt(S, i.kontakt);
      S.kontakte = S.kontakte.filter(x => x.id !== k.id); S.termine = S.termine.filter(t => t.kontaktId !== k.id); S.aufgaben = S.aufgaben.filter(a => a.kontaktId !== k.id);
      logP(S, `Kontakt ${nrS(k)} gelöscht`); act(`Kontakt ${nrS(k)} mit allen Notizen gelöscht`);
      return { geloescht: nrS(k) };
    }
    case 'beispieldaten_laden': {
      if (S.kontakte.length) throw new Error('Es gibt schon Kontakte – Beispieldaten nur in einem leeren PAI.');
      beispiele(ctx); act('Beispieldaten geladen (erfunden)');
      return { geladen: S.kontakte.map(k => `${nrS(k)} ${fullName(k)}`), termine_morgen: S.termine.length };
    }
  }
  throw new Error('Unbekanntes Werkzeug: ' + name);
}

// Erfundene Beispiele – branchenneutral, Telefonnummern im 0151-000-Bereich, Mails @example.com.
export const BEISPIEL_GEO: Record<string, Geo> = { '10405': { lat: 52.5368, lon: 13.4241 }, '14467': { lat: 52.4009, lon: 13.0591 }, '16515': { lat: 52.7545, lon: 13.2369 }, '12555': { lat: 52.4566, lon: 13.5786 }, '13467': { lat: 52.6116, lon: 13.3104 } };
function beispiele(ctx: Ctx) {
  const { S, now } = ctx; const g = { ...BEISPIEL_GEO, ...(ctx.geo || {}) }; const c: Ctx = { ...ctx, geo: g, cards: [], acts: [] };
  const run = (n: string, x: any) => ausfuehren(n, x, c);
  const vor = (tage: number) => isoDatum(new Date(+now - tage * 864e5));
  run('kontakt_anlegen', { anrede: 'Herr', vorname: 'Thomas', nachname: 'Berger', strasse: 'Kiefernweg 12', plz: '16515', ort: 'Oranienburg', telefon: '0151 000 01 01', email: 't.berger@example.com', quelle: 'Empfehlung', status: 'Angebot offen' });
  run('notiz_speichern', { kontakt: '1', art: 'gespraech', zusammenfassung: 'Erstgespräch vor Ort, sehr interessiert. Will vor der Entscheidung mit seiner Tochter sprechen, die sich mit Technik auskennt.', vereinbart: ['Angebot bis Freitag per Mail'], offen: ['Tochter einbeziehen', 'Finanzierung klären'], persoenliches: ['Schäferhund Rex', 'seit März in Rente', 'Fan von Hertha BSC'] });
  run('kontakt_anlegen', { anrede: 'Frau', vorname: 'Sabine', nachname: 'Kranz', firma: 'Kranz Immobilien', strasse: 'Brandenburger Str. 40', plz: '14467', ort: 'Potsdam', telefon: '0151 000 01 02', email: 'kranz@example.com', quelle: 'Messe', status: 'Interessent' });
  run('notiz_speichern', { kontakt: '2', art: 'telefonat', zusammenfassung: 'Kurzes Telefonat. Hat drei Objekte, die infrage kommen. Möchte erst eines testen.', vereinbart: ['Termin vor Ort'], offen: ['Welches Objekt zuerst?'], persoenliches: ['Tochter studiert in Leipzig', 'trinkt nur Tee'] });
  run('kontakt_anlegen', { anrede: 'Herr', vorname: 'Jens', nachname: 'Wolter', strasse: 'Lindenring 21', plz: '12555', ort: 'Berlin-Köpenick', telefon: '0151 000 01 03', email: 'jens.wolter@example.com', quelle: 'Website', status: 'Kunde' });
  run('notiz_speichern', { kontakt: '3', art: 'gespraech', zusammenfassung: 'Seit zwei Jahren Kunde, sehr zufrieden. Hat zwei Nachbarn erwähnt, die Interesse haben könnten.', vereinbart: ['Empfehlungskarten mitbringen'], offen: ['Nach Nachbarn fragen'], persoenliches: ['baut gerade einen Wintergarten', 'Enkel heißt Paul'] });
  run('kontakt_anlegen', { anrede: 'Frau', vorname: 'Petra', nachname: 'Lindner', strasse: 'Am Hang 5', plz: '13467', ort: 'Berlin-Hermsdorf', telefon: '0151 000 01 04', email: 'p.lindner@example.com', quelle: 'Empfehlung von Jens Wolter', status: 'Interessent' });
  // Termine morgen bzw. am nächsten Arbeitstag – bewusst in ungünstiger Reihenfolge (Süd → Nord → Süd)
  let m = new Date(+sod(now) + 864e5 + 3600e3); m = sod(m);
  while (S.profil.freieTage.includes(m.getDay())) m = sod(new Date(+m + 864e5 + 3600e3));
  const d = isoDatum(m);
  run('termin_eintragen', { kontakt: '2', titel: 'Kranz Immobilien – Objekt ansehen', start: `${d}T09:30`, dauer: 60 });
  run('termin_eintragen', { kontakt: '1', titel: 'Berger – Angebot besprechen', start: `${d}T11:30`, dauer: 60 });
  run('termin_eintragen', { kontakt: '3', titel: 'Wolter – Jahresgespräch', start: `${d}T14:00`, dauer: 45 });
  run('termin_eintragen', { kontakt: '4', titel: 'Lindner – Erstgespräch', start: `${d}T16:00`, dauer: 60 });
  run('aufgabe_anlegen', { kontakt: '1', text: 'Angebot an Thomas Berger schicken', faellig: vor(-2) });
  S.log = [];
}
