// Werkzeuge: feste App-Logik, die die KI aufruft. Die KI rechnet nie selbst.
import { State, Lead, Regeln, DEFAULT_REGELN, nrS, fullName, addTL, logP, failCount } from './state';
import { PROD, HEIZ, STATUS, ABSCHLUSS, heizAlias, statusAlias, findLead, findeDublette, neuerLead, pflichtFehlt, fragenFuersTelefonat, auffaelligkeiten, prioritaet, waermeKwh, heizlastKw } from './leads';
import { naechsterAnruf, imZeitfenster, termineVorschlagen, reservieren, terminBuchen, angeboteUebersicht, terminTagErlaubt, abgelaufeneAngeboteEntfernen } from './termine';
import { mailTermin, mailRueckruf, mailVorschlaege, mailFrei, vcard, foerderEingabe, provision, Mail } from './kommunikation';
import { foerderung, REGELN } from './foerderung';
import { richtung } from './region';
import { fd, ft, fdl, relDay, localIso, parseTag, parseStart, sameDay, eod, at, addWerktage, feiertag, TAG } from './zeit';

export type Card = ({ type: 'mail' } & Mail) | { type: 'vcard'; name: string; nr: string; vcf: string };
export type Ctx = { S: State; acts: string[]; cards: Card[]; now: Date };

const S_ = { type: 'string' } as const, N_ = { type: 'number' } as const, B_ = { type: 'boolean' } as const;
const LEAD = { lead: { type: 'string', description: 'Leadnummer (z. B. "0004") oder Name' } };
const LEAD_FELDER = {
  anrede: { type: 'string', enum: ['Herr', 'Frau', ''] }, vorname: S_, nachname: S_, strasse: S_, plz: S_, ort: S_,
  telefon: S_, telefon2: S_, email: S_, quelle: S_, anfrage_id: S_,
  produkte: { type: 'array', items: { type: 'string', enum: ['WP', 'PV', 'SP', 'GF'] } },
  gebaeude: { type: 'string', description: 'EFH, DHH, RH, ZFH, MFH, Gewerbe' }, baujahr_haus: N_, wohnflaeche: N_, personen: N_, wohneinheiten: N_,
  neubau: B_, baugenehmigung_jahr: N_,
  heizungsart: { type: 'string', enum: Object.keys(HEIZ) }, heizung_einbaujahr: N_, heizung_funktionstuechtig: B_,
  verbrauch: N_, verbrauch_einheit: { type: 'string', enum: ['l', 'm3', 'kWh'] }, standort_heizung: S_, verteilung: { type: 'string', description: 'Fußbodenheizung, Heizkörper, gemischt' },
  strom_kwh: N_, eigentuemer: B_, selbstgenutzt: B_, mieter: B_,
  zve: { type: 'number', description: 'Durchschnitt zu versteuerndes Einkommen der maßgeblichen Jahre – NIE Brutto' }, minderjaehriges_kind: B_, entscheider: S_,
  erreichbar_ab: { type: 'string', description: 'HH:MM' }, erreichbar_bis: { type: 'string', description: 'HH:MM' }, erreichbarkeit_text: S_,
  projektstart: S_, notiz: S_,
};

export const TOOLS = [
  { name: 'uebersicht', description: 'Tagesüberblick: Anrufliste (nach Zeitfenster), Termine, fällige Rückruf-Mails, offene Termin-Ergebnisse, angebotene Slots, freie Zeitfenster. Für "was steht an", "morgen", "Dienstag".', input_schema: { type: 'object', properties: { datum: { type: 'string', description: 'heute, morgen, Wochentag oder TT.MM.' } } } },
  { name: 'leads_suchen', description: 'Leads nach Name, Ort, PLZ, Nummer oder Status finden.', input_schema: { type: 'object', properties: { suche: S_, status: S_ } } },
  { name: 'lead_akte', description: 'Vollständige Kundenakte eines Leads inkl. Verlauf, Förderung, fehlende Angaben, Fragen fürs Telefonat.', input_schema: { type: 'object', properties: LEAD, required: ['lead'] } },
  { name: 'lead_anlegen', description: 'Neuen Lead aus einer eingefügten Lead-Mail anlegen. Alle erkennbaren Felder übergeben, Unbekanntes weglassen. Prüft automatisch Dubletten (ergänzt dann die bestehende Akte), vergibt die Nummer, plant den Erstanruf und erstellt die Kontaktkarte.', input_schema: { type: 'object', properties: { ...LEAD_FELDER, trotzdem_anlegen: { type: 'boolean', description: 'nur wenn der Nutzer bestätigt, dass es keine Dublette ist' } } } },
  { name: 'lead_aktualisieren', description: 'Angaben in einer Akte ergänzen oder korrigieren (z. B. nach Telefonat: Verbrauch, Eigentum, zvE).', input_schema: { type: 'object', properties: { ...LEAD, ...LEAD_FELDER }, required: ['lead'] } },
  { name: 'anruf_ergebnis', description: 'Anrufversuch protokollieren. Uhrzeit setzt die App. Nicht erreicht → nächster Versuch im Takt bzw. nach 3 Fehlversuchen Rückruf-Mail. Erreicht → Gespräch erfassen (Daten zusätzlich mit lead_aktualisieren).', input_schema: { type: 'object', properties: { ...LEAD, ergebnis: { type: 'string', enum: ['erreicht', 'mailbox', 'nicht_rangegangen', 'rueckruf_vereinbart', 'besetzt'] }, rueckruf_um: { type: 'string', description: 'JJJJ-MM-TTTHH:MM bei vereinbartem Rückruf' }, notiz: S_ }, required: ['lead', 'ergebnis'] } },
  { name: 'termine_vorschlagen', description: 'Genau zwei Terminvorschläge nach den Regeln (Tour nach Richtung, Puffer, frühester Beginn, Zeitfenster des Kunden). Reserviert die Slots. Erst nach qualifizierendem Gespräch.', input_schema: { type: 'object', properties: { ...LEAD, mail_entwurf: { type: 'boolean', description: 'Vorschläge zusätzlich als Mail-Entwurf' } }, required: ['lead'] } },
  { name: 'termin_buchen', description: 'Termin fest buchen (Zusage des Kunden) oder verschieben. Erstellt die Terminbestätigung als Entwurf.', input_schema: { type: 'object', properties: { ...LEAD, start: { type: 'string', description: 'JJJJ-MM-TTTHH:MM (lokale Zeit)' } }, required: ['lead', 'start'] } },
  { name: 'termin_ergebnis', description: 'Ergebnis nach einem Hausbesuch erfassen (Pflicht nach jedem Termin).', input_schema: { type: 'object', properties: { ...LEAD, ergebnis: { type: 'string', enum: ['vorvertrag', 'angebot', 'verloren', 'wiedervorlage', 'verkauft'] }, grund: S_, wiedervorlage: { type: 'string', description: 'Datum TT.MM. oder JJJJ-MM-TT' }, provision_variabel: { type: 'number', description: 'nur wenn vom Nutzer genannt, z. B. PV' } }, required: ['lead', 'ergebnis'] } },
  { name: 'status_setzen', description: 'Pipeline-Status ändern (Neu, Telefonat, Termin, Angebot, Vorvertrag, TGA, Verkauft, Abgeschlossen, Wiedervorlage, Verloren, Storniert).', input_schema: { type: 'object', properties: { ...LEAD, status: S_, grund: S_, provision_variabel: N_ }, required: ['lead', 'status'] } },
  { name: 'foerderung_berechnen', description: 'BEG-Förderung Wärmepumpe. Mit lead: nutzt die Akte. Ohne lead: freie Rechnung mit den übergebenen Werten. Liefert Spanne, solange Voraussetzungen fehlen.', input_schema: { type: 'object', properties: { ...LEAD, kosten: N_, antragsdatum: { type: 'string', description: 'JJJJ-MM-TT, für Szenario' }, heizungsart: { type: 'string', enum: Object.keys(HEIZ) }, heizung_einbaujahr: N_, funktionstuechtig: B_, eigentuemer: B_, selbstgenutzt: B_, wohneinheiten: N_, zve: N_, minderjaehriges_kind: B_, neubau: B_ } } },
  { name: 'mail_entwurf', description: 'E-Mail-Entwurf als Karte (Nutzer kopiert und sendet über Outlook).', input_schema: { type: 'object', properties: { ...LEAD, art: { type: 'string', enum: ['terminbestaetigung', 'rueckruf', 'terminvorschlaege', 'frei'] }, betreff: S_, text: S_ }, required: ['lead', 'art'] } },
  { name: 'kontaktkarte', description: 'Kontaktkarte (vCard) für einen Lead anzeigen.', input_schema: { type: 'object', properties: LEAD, required: ['lead'] } },
  { name: 'regel_setzen', description: 'Feste Arbeitsregel ändern ("Merk dir: dienstags keine Termine").', input_schema: { type: 'object', properties: { schluessel: { type: 'string', enum: Object.keys(DEFAULT_REGELN) }, wert: { description: 'Zeit als "HH:MM", Minuten als Zahl, freieTage als Liste 1–6 (1=Mo), richtung: benachbart|streng|aus' } }, required: ['schluessel', 'wert'] } },
  { name: 'regel_merken', description: 'Freie Regel merken, die keine feste Einstellung ist (z. B. "bei Empfehlungen immer am selben Tag anrufen"). Auch zum Löschen.', input_schema: { type: 'object', properties: { text: S_, loeschen: B_ }, required: ['text'] } },
  { name: 'regeln_anzeigen', description: 'Alle aktuellen Regeln und das Protokoll der letzten Aktionen (was, wann, auf welcher Regel).', input_schema: { type: 'object', properties: {} } },
  { name: 'provision_stand', description: 'Provision im laufenden Monat und Abstand zur nächsten Stufe.', input_schema: { type: 'object', properties: {} } },
  { name: 'lead_loeschen', description: 'DSGVO-Löschung auf Kundenwunsch: Daten weg, Nummer bleibt gesperrt. Nur nach ausdrücklicher Bestätigung des Nutzers.', input_schema: { type: 'object', properties: { ...LEAD, bestaetigt: B_ }, required: ['lead', 'bestaetigt'] } },
];

// ---------- Hilfen ----------
type F = [string, (l: Lead) => unknown, (l: Lead, v: any) => void];
const num = (x: unknown) => { const v = Number(String(x).replace(/[^\d.]/g, '')); return isFinite(v) && v > 0 ? v : null; };
const FELDER: F[] = [
  ['anrede', l => l.anrede, (l, v) => l.anrede = v], ['vorname', l => l.vorname, (l, v) => l.vorname = v], ['nachname', l => l.nachname, (l, v) => l.nachname = v],
  ['strasse', l => l.strasse, (l, v) => l.strasse = v], ['plz', l => l.plz, (l, v) => l.plz = String(v).replace(/\D/g, '')], ['ort', l => l.ort, (l, v) => l.ort = v],
  ['telefon', l => l.tel, (l, v) => l.tel = v], ['telefon2', l => l.tel2, (l, v) => l.tel2 = v], ['email', l => l.email, (l, v) => l.email = v],
  ['quelle', () => null, (l, v) => l.quelle = v], ['anfrage_id', l => l.anfrageId, (l, v) => l.anfrageId = v],
  ['produkte', () => null, (l, v) => l.produkte = [...new Set<string>([...l.produkte, ...(v as string[]).filter(p => PROD[p])])]],
  ['gebaeude', l => l.objekt.typ, (l, v) => l.objekt.typ = v], ['baujahr_haus', l => l.objekt.baujahr, (l, v) => l.objekt.baujahr = num(v)],
  ['wohnflaeche', l => l.objekt.flaeche, (l, v) => l.objekt.flaeche = num(v)], ['personen', l => l.objekt.personen, (l, v) => l.objekt.personen = num(v)],
  ['wohneinheiten', l => l.objekt.we, (l, v) => l.objekt.we = num(v)], ['neubau', l => l.objekt.neubau, (l, v) => l.objekt.neubau = !!v],
  ['baugenehmigung_jahr', l => l.objekt.baugenehmigung, (l, v) => l.objekt.baugenehmigung = num(v)],
  ['heizungsart', l => (l.heizung.art === 'unbekannt' ? null : l.heizung.art), (l, v) => l.heizung.art = heizAlias(v)],
  ['heizung_einbaujahr', l => l.heizung.einbau, (l, v) => l.heizung.einbau = num(v)], ['heizung_funktionstuechtig', l => l.heizung.funktion, (l, v) => l.heizung.funktion = !!v],
  ['verbrauch', l => l.heizung.verbrauch, (l, v) => l.heizung.verbrauch = num(v)], ['verbrauch_einheit', () => null, (l, v) => l.heizung.einheit = v],
  ['standort_heizung', l => l.heizung.standort, (l, v) => l.heizung.standort = v], ['verteilung', l => l.heizung.verteilung, (l, v) => l.heizung.verteilung = v],
  ['strom_kwh', l => l.strom, (l, v) => l.strom = num(v)], ['eigentuemer', l => l.eigentum.eigentuemer, (l, v) => l.eigentum.eigentuemer = !!v],
  ['selbstgenutzt', l => l.eigentum.selbst, (l, v) => l.eigentum.selbst = !!v], ['mieter', l => l.eigentum.mieter, (l, v) => l.eigentum.mieter = !!v],
  ['zve', l => l.zve, (l, v) => l.zve = num(v)], ['minderjaehriges_kind', l => l.kind, (l, v) => l.kind = !!v], ['entscheider', l => l.entscheider, (l, v) => l.entscheider = v],
  ['erreichbar_ab', l => l.erreichbar.ab, (l, v) => l.erreichbar.ab = v], ['erreichbar_bis', l => l.erreichbar.bis, (l, v) => l.erreichbar.bis = v],
  ['erreichbarkeit_text', l => l.erreichbar.text, (l, v) => l.erreichbar.text = v], ['projektstart', l => l.projektstart, (l, v) => l.projektstart = v],
  ['notiz', () => null, (l, v) => l.notiz = [l.notiz, v].filter(Boolean).join(' · ')],
];
// nurLeere: bei Dubletten nichts Vorhandenes überschreiben
function felderAnwenden(l: Lead, i: any, nurLeere = false) {
  const g: string[] = [];
  for (const [k, get, set] of FELDER) {
    const v = i[k]; if (v === undefined || v === null || v === '') continue;
    const cur = get(l); if (nurLeere && cur !== undefined && cur !== null && cur !== '') continue;
    set(l, v); g.push(k);
  }
  return g;
}
const foerderKurz = (l: Lead) => { const F = foerderung(foerderEingabe(l)); const { _werte, ...rest } = F; return rest; };

function akte(S: State, l: Lead, voll = false) {
  const h = l.heizung, o = l.objekt;
  const r: any = {
    lead: nrS(l), name: fullName(l), anrede: l.anrede, adresse: `${l.strasse}, ${l.plz} ${l.ort}`, richtung: richtung(l.plz),
    telefon: l.tel, email: l.email, quelle: l.quelle, produkte: l.produkte.map(p => PROD[p]), status: STATUS[l.status] || l.status, prioritaet: l.prio,
    objekt: { art: o.typ, baujahr: o.baujahr, wohnflaeche_m2: o.flaeche, personen: o.personen, wohneinheiten: o.we, neubau: o.neubau },
    heizung: { art: HEIZ[h.art], einbaujahr: h.einbau, funktionstuechtig: h.funktion, verbrauch: h.verbrauch ? `${h.verbrauch} ${h.einheit}` : null, waerme_kwh: waermeKwh(l), heizlast_grob_kw: heizlastKw(l), standort: h.standort, verteilung: h.verteilung },
    eigentum: l.eigentum, strom_kwh: l.strom, zve_bekannt: l.zve != null, minderjaehriges_kind: l.kind, entscheider: l.entscheider,
    erreichbar: l.erreichbar, projektstart: l.projektstart, notiz: l.notiz, auffaelligkeiten: l.hinweise,
    fehlende_pflichtangaben: pflichtFehlt(l), anrufversuche_ohne_erfolg: failCount(l),
    naechster_schritt: l.next ? { was: l.next.text, wann: l.next.typ === 'mail' ? 'jetzt' : `${relDay(l.next.ts, S_now)} ${ft(l.next.ts)}` } : null,
    termin: l.termin ? `${fdl(l.termin.start)}, ${ft(l.termin.start)} Uhr` : null, verschiebungen: l.verschiebungen,
  };
  if (l.produkte.includes('WP')) r.foerderung = foerderKurz(l);
  if (voll) { r.fragen_fuers_telefonat = fragenFuersTelefonat(l); r.verlauf = l.timeline.slice(-12).map(t => `${fds2(t.ts)} ${ft(t.ts)} ${t.text}`); }
  return r;
}
let S_now = new Date();
const fds2 = (d: string) => fd(d);

function vcardKarte(ctx: Ctx, l: Lead) { ctx.cards.push({ type: 'vcard', name: fullName(l), nr: nrS(l), vcf: vcard(l) }); }
function mailKarte(ctx: Ctx, l: Lead, m: Mail) { ctx.cards.push({ type: 'mail', ...m }); addTL(l, `Mail-Entwurf: ${m.betreff}`); }

function regelText(r: Regeln) {
  const tage = [1, 2, 3, 4, 5, 6].filter(d => (d === 6 ? r.samstag : !r.freieTage.includes(d))).map(d => TAG[d]).join(', ');
  return `Termine ${tage}, ${r.terminStart}–${r.terminEnde} Uhr, ${r.terminDauer} Min. + ${r.puffer} Min. Puffer, Richtung: ${r.richtung}, keine Feiertage · Anrufe ${r.anrufStart}–${r.anrufBis} Uhr im ${r.anrufTakt}-Min.-Takt, Rückruf-Mail nach ${r.maxVersuche} Fehlversuchen · Mails ${r.grussformel ? 'mit' : 'ohne'} Grußformel · Angebote reserviert ${r.angebotGueltigStunden} h`;
}
export const regelnKurz = (S: State) => regelText(S.regeln);

function regelWert(k: keyof Regeln, v: any): any {
  const t = typeof DEFAULT_REGELN[k];
  if (k === 'freieTage') { const arr = Array.isArray(v) ? v : String(v).split(/[,\s]+/); const x = [...new Set(arr.map(Number).filter(d => d >= 1 && d <= 5))].sort(); return x; }
  if (k === 'richtung') return ['benachbart', 'streng', 'aus'].includes(v) ? v : undefined;
  if (t === 'boolean') return v === true || v === 'true' ? true : v === false || v === 'false' ? false : undefined;
  if (t === 'number') { const n = Number(v); return isFinite(n) && n > 0 && n <= 600 ? Math.round(n) : undefined; }
  if (t === 'string') { const m = String(v).match(/^(\d{1,2})(?::(\d{2}))?$/); if (!m || +m[1] > 23 || +(m[2] || 0) > 59) return undefined; return `${m[1].padStart(2, '0')}:${(m[2] || '00')}`; }
}

// ---------- Ausführung ----------
export function ausfuehren(name: string, i: any, ctx: Ctx): unknown {
  const { S, now } = ctx; S_now = now;
  const act = (t: string) => ctx.acts.push(t);
  switch (name) {
    case 'uebersicht': {
      const d = parseTag(i.datum, now), heute = sameDay(d, now);
      abgelaufeneAngeboteEntfernen(S, now);
      const termine = S.leads.filter(l => l.termin && sameDay(l.termin.start, d)).sort((a, b) => +new Date(a.termin!.start) - +new Date(b.termin!.start))
        .map(l => ({ zeit: ft(l.termin!.start), lead: nrS(l), name: fullName(l), ort: l.ort, richtung: richtung(l.plz) }));
      const res: any = { datum: fdl(d), feiertag: feiertag(d), termintag_laut_regeln: terminTagErlaubt(S, d), termine };
      const bisEnde = eod(d);
      res.anrufe = S.leads.filter(l => l.next?.typ === 'anruf' && new Date(l.next.ts) <= bisEnde && (heute || sameDay(l.next.ts, d)))
        .sort((a, b) => +new Date(a.next!.ts) - +new Date(b.next!.ts))
        .map(l => ({ zeit: ft(l.next!.ts), lead: nrS(l), name: fullName(l), ort: l.ort, grund: l.next!.text, zeitfenster: l.erreichbar.text || null, ueberfaellig: new Date(l.next!.ts) < now }));
      if (heute) {
        res.rueckruf_mails_faellig = S.leads.filter(l => l.next?.typ === 'mail').map(l => `${nrS(l)} ${fullName(l)}`);
        res.termin_ergebnis_fehlt = S.leads.filter(l => l.status === 'termin' && l.termin && new Date(l.termin.start) < now).map(l => `${nrS(l)} ${fullName(l)} (${fd(l.termin!.start)})`);
        res.aufgaben = S.leads.filter(l => l.next?.typ === 'aufgabe' && new Date(l.next.ts) <= eod(now)).map(l => `${nrS(l)} ${fullName(l)}: ${l.next!.text}`);
        res.angebotene_slots = angeboteUebersicht(S, now);
      }
      res.naechste_termine = S.leads.filter(l => l.termin && new Date(l.termin.start) >= now).sort((a, b) => +new Date(a.termin!.start) - +new Date(b.termin!.start)).slice(0, 5).map(l => `${fd(l.termin!.start)} ${ft(l.termin!.start)} ${fullName(l)} (${l.ort})`);
      act(`Kalender und Anrufliste für ${fd(d)} gelesen`);
      return res;
    }
    case 'leads_suchen': {
      const q = String(i.suche || '').toLowerCase(), st = i.status ? statusAlias(i.status) : null;
      const list = S.leads.filter(l => (!st || l.status === st) && (!q || `${fullName(l)} ${l.ort} ${l.plz} ${nrS(l)}`.toLowerCase().includes(q))).slice(0, 20);
      act(`${list.length} Lead${list.length === 1 ? '' : 's'} gefunden`);
      return list.map(l => ({ lead: nrS(l), name: fullName(l), ort: l.ort, status: STATUS[l.status], produkte: l.produkte.join('+'), prioritaet: l.prio, naechster_schritt: l.next?.text || null }));
    }
    case 'lead_akte': { const l = findLead(S, i.lead); act(`Akte ${nrS(l)} ${fullName(l)} geöffnet`); return akte(S, l, true); }
    case 'lead_anlegen': {
      const dup = findeDublette(S, i);
      if (dup && !i.trotzdem_anlegen) {
        const { quelle: _q, ...rest } = i; const geaendert = felderAnwenden(dup, rest, true);
        const h = `Doppelanfrage über ${i.quelle || 'weiteres Portal'} – holt aktiv Angebote ein, Tempo!`;
        dup.hinweise = [...new Set([h, ...auffaelligkeiten(dup, now.getFullYear())])];
        addTL(dup, h, now); dup.prio = prioritaet(dup, now.getFullYear());
        logP(S, `Dublette erkannt: Lead ${nrS(dup)} ergänzt`, 'Dublettenprüfung Telefon/E-Mail/Name+PLZ');
        act(`Dublette: Lead ${nrS(dup)} ${fullName(dup)} ergänzt – kein neuer Lead`);
        return { dublette: true, akte: akte(S, dup), ergaenzte_felder: geaendert, hinweis: 'Falls doch eine andere Person: lead_anlegen mit trotzdem_anlegen=true' };
      }
      const l = neuerLead(S, i, now);
      felderAnwenden(l, { zve: i.zve, minderjaehriges_kind: i.minderjaehriges_kind, entscheider: i.entscheider });
      const t = naechsterAnruf(S, l, now);
      l.next = { typ: 'anruf', ts: t.toISOString(), text: 'Erstanruf' };
      logP(S, `Lead ${nrS(l)} angelegt, Erstanruf ${relDay(t, now)} ${ft(t)}`, `Anruftakt ${S.regeln.anrufTakt} Min., Zeitfenster Kunde ${l.erreichbar.text || 'keins'}`);
      vcardKarte(ctx, l);
      act(`Lead ${nrS(l)} angelegt · Kontaktkarte erstellt · Erstanruf ${relDay(t, now)} ${ft(t)}`);
      return { ...akte(S, l, true), erstanruf: `${relDay(t, now)} ${ft(t)}`, kontaktkarte: 'im Chat angezeigt', termine: 'erst nach dem qualifizierenden Gespräch' };
    }
    case 'lead_aktualisieren': {
      const l = findLead(S, i.lead); const g = felderAnwenden(l, i);
      l.prio = prioritaet(l, now.getFullYear()); l.hinweise = auffaelligkeiten(l, now.getFullYear());
      addTL(l, `Akte ergänzt: ${g.join(', ')}`, now);
      act(`Akte ${nrS(l)} ergänzt: ${g.join(', ') || 'nichts'}${pflichtFehlt(l).length ? ' · fehlt: ' + pflichtFehlt(l).join(', ') : ''}`);
      return akte(S, l);
    }
    case 'anruf_ergebnis': {
      const l = findLead(S, i.lead); const e = String(i.ergebnis);
      const warn = !imZeitfenster(l, now) ? `Anruf außerhalb des Zeitfensters (${l.erreichbar.text || l.erreichbar.ab + '–' + l.erreichbar.bis}).` : null;
      if (e === 'erreicht') {
        l.versuche.push({ ts: now.toISOString(), ok: true, ergebnis: e });
        if (['neu', 'kontakt'].includes(l.status)) l.status = 'qualifiziert';
        addTL(l, `Telefonat ${ft(now)} – erreicht${i.notiz ? ': ' + i.notiz : ''}`, now);
        if (i.notiz) l.notiz = [l.notiz, i.notiz].filter(Boolean).join(' · ');
        l.next = { typ: 'aufgabe', ts: now.toISOString(), text: 'Termin vereinbaren' };
        act(`Gespräch mit ${fullName(l)} um ${ft(now)} erfasst${pflichtFehlt(l).length ? ' · fehlt noch: ' + pflichtFehlt(l).join(', ') : ''}`);
        return { notiert: ft(now), fehlende_pflichtangaben: pflichtFehlt(l), naechster_schritt: 'Daten mit lead_aktualisieren eintragen, dann termine_vorschlagen', warnung: warn };
      }
      if (e === 'rueckruf_vereinbart') {
        const t = parseStart(i.rueckruf_um, now); if (isNaN(+t)) throw new Error('Rückrufzeit fehlt (JJJJ-MM-TTTHH:MM)');
        l.versuche.push({ ts: now.toISOString(), ok: true, ergebnis: e });
        l.next = { typ: 'anruf', ts: t.toISOString(), text: 'Vereinbarter Rückruf – hohe Priorität' };
        addTL(l, `Rückruf vereinbart: ${fd(t)} ${ft(t)}`, now);
        act(`Rückruf ${fullName(l)} fest: ${relDay(t, now)} ${ft(t)}`);
        return { rueckruf: `${relDay(t, now)} ${ft(t)}` };
      }
      l.versuche.push({ ts: now.toISOString(), ok: false, ergebnis: e });
      const n = failCount(l); if (l.status === 'neu') l.status = 'kontakt';
      addTL(l, `Anruf ${n}. Versuch ${ft(now)} – ${e.replace('_', ' ')}`, now);
      if (n >= S.regeln.maxVersuche) {
        l.next = { typ: 'mail', ts: now.toISOString(), text: `${n} Versuche – Rückruf-Mail mit Kernfragen` };
        logP(S, `Lead ${nrS(l)}: Rückruf-Mail nach ${n} Versuchen`, `Regel: ${S.regeln.maxVersuche} Fehlversuche`);
        mailKarte(ctx, l, mailRueckruf(S, l));
        act(`${fullName(l)}: ${n}. Versuch ${ft(now)} notiert · Rückruf-Mail erstellt (ohne Terminvorschläge)`);
        return { notiert: ft(now), versuch: n, rueckruf_mail: 'Entwurf angezeigt', warnung: warn };
      }
      const t = naechsterAnruf(S, l, now);
      l.next = { typ: 'anruf', ts: t.toISOString(), text: `${n + 1}. Versuch` };
      logP(S, `Lead ${nrS(l)}: ${n + 1}. Versuch ${relDay(t, now)} ${ft(t)}`, `Takt ${S.regeln.anrufTakt} Min., bis ${S.regeln.anrufBis} Uhr`);
      act(`${fullName(l)}: ${n}. Versuch ${ft(now)} notiert · nächster ${relDay(t, now)} ${ft(t)}`);
      return { notiert: ft(now), versuch: n, naechster_versuch: `${relDay(t, now)} ${ft(t)}`, warnung: warn };
    }
    case 'termine_vorschlagen': {
      const l = findLead(S, i.lead);
      if (['neu', 'kontakt'].includes(l.status)) throw new Error(`${fullName(l)} ist noch nicht qualifiziert – erst Telefonat, dann Termine.`);
      const v = termineVorschlagen(S, l, now);
      if (!v.length) { act(`Keine passenden Slots für ${fullName(l)}`, ); return { vorschlaege: [], hinweis: 'In den nächsten 15 Tagen kein Slot nach den Regeln. Regel lockern oder Tag nennen.' }; }
      const ablauf = reservieren(S, l, v, now);
      logP(S, `2 Termine für ${nrS(l)} angeboten und reserviert`, regelText(S.regeln));
      act(`Terminvorschläge ${fullName(l)}: ${v.map(x => fd(x.start) + ' ' + ft(x.start)).join(' oder ')} · reserviert bis ${fd(ablauf)} ${ft(ablauf)}`);
      if (i.mail_entwurf) mailKarte(ctx, l, mailVorschlaege(S, l, v.map(x => x.start)));
      return { vorschlaege: v.map(x => ({ start: localIso(x.start), anzeige: `${fdl(x.start)}, ${ft(x.start)} Uhr`, grund: x.grund })), reserviert_bis: `${fd(ablauf)} ${ft(ablauf)}`, richtung: richtung(l.plz) };
    }
    case 'termin_buchen': {
      const l = findLead(S, i.lead); const s = parseStart(i.start, now);
      const { wechsel, warn } = terminBuchen(S, l, s, now);
      mailKarte(ctx, l, mailTermin(S, l));
      act(`Termin ${wechsel ? 'verschoben' : 'gebucht'}: ${fd(s)} ${ft(s)} · ${fullName(l)} · Bestätigung als Entwurf`);
      return { gebucht: `${fdl(s)}, ${ft(s)} Uhr`, ort: `${l.strasse}, ${l.plz} ${l.ort}`, warnungen: warn, hinweis: wechsel ? 'Verschiebung: Kunde bekommt eine Mail mit Entschuldigung – Text ggf. anpassen.' : null };
    }
    case 'termin_ergebnis':
    case 'status_setzen': {
      const l = findLead(S, i.lead);
      const st = name === 'termin_ergebnis' ? String(i.ergebnis) : statusAlias(i.status);
      if (!st || !STATUS[st]) throw new Error('Unbekannter Status: ' + (i.status || i.ergebnis));
      l.status = st; addTL(l, `Status: ${STATUS[st]}${i.grund ? ' – ' + i.grund : ''}`, now);
      if (ABSCHLUSS.includes(st) && !l.abschlussDatum) l.abschlussDatum = now.toISOString();
      if (i.provision_variabel != null) l.pvProvision = Number(i.provision_variabel);
      if (st === 'verloren' || st === 'storniert') { l.next = null; l.verlustgrund = i.grund || ''; S.slots = S.slots.filter(x => x.leadId !== l.id); }
      if (st === 'verkauft' || st === 'abgeschlossen') l.next = null;
      if (st === 'vorvertrag') l.next = { typ: 'aufgabe', ts: at(addWerktage(now, 1), 10, 0).toISOString(), text: 'TGA abstimmen, Unterlagen ans Backoffice' };
      if (st === 'tga') l.next = { typ: 'aufgabe', ts: at(addWerktage(now, 5), 10, 0).toISOString(), text: 'Nachfassen: Stand Technikprüfung' };
      if (st === 'angebot') l.next = { typ: 'aufgabe', ts: at(addWerktage(now, 3), 10, 0).toISOString(), text: 'Nachfassen Angebot' };
      if (st === 'wiedervorlage') { const d = parseTag(i.wiedervorlage, now); l.next = { typ: 'aufgabe', ts: at(d, 10, 0).toISOString(), text: `Wiedervorlage${i.grund ? ': ' + i.grund : ''}` }; }
      logP(S, `Lead ${nrS(l)} → ${STATUS[st]}`, 'Im Chat');
      const p = provision(S, now);
      const offen = ABSCHLUSS.includes(st) && l.produkte.some(x => S.provision.abfragen.includes(x)) && l.pvProvision == null;
      act(`${fullName(l)} → ${STATUS[st]}${l.next ? ' · nächster Schritt: ' + l.next.text : ''}`);
      return { status: STATUS[st], naechster_schritt: l.next?.text || null, provision: ABSCHLUSS.includes(st) ? p : undefined, frage_an_nutzer: offen ? 'Wie hoch ist die variable Provision (z. B. PV)? Nicht schätzen.' : null };
    }
    case 'foerderung_berechnen': {
      let e: any;
      if (i.lead) { const l = findLead(S, i.lead); e = { ...foerderEingabe(l) }; }
      else e = {};
      for (const k of ['heizung_einbaujahr', 'funktionstuechtig', 'eigentuemer', 'selbstgenutzt', 'wohneinheiten', 'zve', 'minderjaehriges_kind', 'neubau']) if (i[k] != null) e[k] = i[k];
      if (i.heizungsart) e.heizungsart = heizAlias(i.heizungsart);
      e.kosten = i.kosten; if (i.antragsdatum) e.antragsdatum = parseTag(i.antragsdatum, now);
      const F = foerderung(e, now); const { _werte, ...rest } = F;
      act(`Förderung berechnet (${REGELN.version}): ${F.foerdersatz} · ${F.status.startsWith('geprüft') ? 'geprüft' : 'vorläufig'}`);
      return rest;
    }
    case 'mail_entwurf': {
      const l = findLead(S, i.lead); const art = String(i.art);
      let m: Mail;
      if (art === 'terminbestaetigung') m = mailTermin(S, l);
      else if (art === 'rueckruf') m = mailRueckruf(S, l);
      else if (art === 'terminvorschlaege') { const sl = S.slots.filter(x => x.leadId === l.id).map(x => new Date(x.start)); if (!sl.length) throw new Error('Keine angebotenen Slots – zuerst termine_vorschlagen'); m = mailVorschlaege(S, l, sl); }
      else { if (!i.text) throw new Error('Für eine freie Mail fehlt der Text'); m = mailFrei(S, l, i.betreff || '', i.text); }
      mailKarte(ctx, l, m); act(`Mail-Entwurf an ${fullName(l)}`);
      return { angezeigt: true, betreff: m.betreff, hinweis: 'Nutzer kopiert und sendet selbst.' };
    }
    case 'kontaktkarte': { const l = findLead(S, i.lead); vcardKarte(ctx, l); act(`Kontaktkarte ${fullName(l)}`); return { angezeigt: true }; }
    case 'regel_setzen': {
      const k = i.schluessel as keyof Regeln; if (!(k in DEFAULT_REGELN)) throw new Error('Unbekannte Regel');
      const v = regelWert(k, i.wert); if (v === undefined) throw new Error(`Ungültiger Wert für ${k}: ${JSON.stringify(i.wert)}`);
      const alt = S.regeln[k]; (S.regeln as any)[k] = v;
      logP(S, `Regel ${k}: ${JSON.stringify(alt)} → ${JSON.stringify(v)}`, 'Von dir im Chat');
      act(`Gemerkt: ${k} = ${Array.isArray(v) ? v.map((d: number) => TAG[d]).join(', ') || 'keine' : v}`);
      return { gespeichert: true, regeln: regelText(S.regeln) };
    }
    case 'regel_merken': {
      const t = String(i.text).trim();
      if (i.loeschen) S.freieRegeln = S.freieRegeln.filter(r => !r.toLowerCase().includes(t.toLowerCase()));
      else if (!S.freieRegeln.includes(t)) S.freieRegeln.push(t);
      logP(S, `${i.loeschen ? 'Regel gelöscht' : 'Regel gemerkt'}: ${t}`, 'Von dir im Chat');
      act(i.loeschen ? `Regel gelöscht: ${t}` : `Gemerkt: ${t}`);
      return { freie_regeln: S.freieRegeln };
    }
    case 'regeln_anzeigen': { act('Regeln und Protokoll gelesen'); return { regeln: regelText(S.regeln), freie_regeln: S.freieRegeln, protokoll: S.log.slice(-15).map(x => `${fd(x.ts)} ${ft(x.ts)} ${x.text}${x.basis ? ' [' + x.basis + ']' : ''}`) }; }
    case 'provision_stand': { act('Provision berechnet'); return provision(S, now); }
    case 'lead_loeschen': {
      if (!i.bestaetigt) throw new Error('Löschung braucht die ausdrückliche Bestätigung des Nutzers');
      const l = findLead(S, i.lead); const nr = nrS(l);
      S.leads = S.leads.filter(x => x.id !== l.id); S.slots = S.slots.filter(x => x.leadId !== l.id);
      logP(S, `Lead ${nr} gelöscht (DSGVO), Nummer gesperrt`, 'Kundenwunsch');
      act(`Lead ${nr} gelöscht · Nummer bleibt gesperrt`);
      return { geloescht: nr };
    }
  }
  throw new Error('Unbekanntes Werkzeug: ' + name);
}
