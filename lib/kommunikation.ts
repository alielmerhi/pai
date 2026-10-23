import { State, Lead, anredeName, fullName, nrS } from './state';
import { PROD, HEIZ, ABSCHLUSS } from './leads';
import { fdl, ft, fds, sameMonth, eur } from './zeit';
import { foerderung } from './foerderung';

// ---------- Mails (Entwürfe – PAI versendet nie selbst) ----------
export type Mail = { an: string; betreff: string; text: string; art: string };
const gruss = (S: State) => (S.regeln.grussformel ? `\n\nViele Grüße\n${S.berater.name}` : '');
const betreff = (S: State, rest: string) => `${S.berater.firma} – ${rest}`;
// Platzhalter für eigene Vorlagen des Nutzers
export const PLATZHALTER = ['anrede_name', 'datum', 'uhrzeit', 'adresse', 'unterlagen', 'fragen', 'vorschlaege', 'firma', 'produkt'];
function mitVorlage(S: State, l: Lead, art: string, std: { betreff: string; text: string }, vars: Record<string, string>): Mail {
  const v = S.schema?.vorlagen?.[art];
  const fill = (t: string) => t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  const bt = v?.betreff ? fill(v.betreff) : std.betreff;
  const tx = v?.text ? fill(v.text) : std.text;
  return { an: l.email, betreff: bt.toLowerCase().startsWith(S.berater.firma.toLowerCase()) ? bt : betreff(S, bt), text: tx + gruss(S), art };
}
const basisVars = (S: State, l: Lead) => ({ anrede_name: anredeName(l), adresse: `${l.strasse}, ${l.plz} ${l.ort}`, firma: S.berater.firma, produkt: PROD[l.produkte[0]] || 'Wärmepumpe' });
const liste = (xs: string[]) => xs.map(x => '- ' + x).join('\n');

export function mailTermin(S: State, l: Lead): Mail {
  if (!l.termin) throw new Error(`Für ${fullName(l)} ist noch kein Termin gebucht`);
  const t = new Date(l.termin.start), typ = l.termin.typ;
  const brennstoff = l.heizung.art === 'oel' ? 'Ölrechnungen bzw. Tankbelege' : ['gas', 'gasetage'].includes(l.heizung.art) ? 'Gasrechnungen' : 'Rechnungen der bisherigen Heizung';
  const docs = ['Grundrisse des Hauses', 'Grundbuchauszug', 'Stromrechnungen (letzte 1–2 Jahre)'];
  if (typ === 'WP') docs.push(`${brennstoff} (letzte 1–2 Jahre)`);
  docs.push('Pläne oder Unterlagen zum Haus');
  if (typ === 'WP' && S.regeln.steuerbescheide) docs.push('Einkommensteuerbescheide 2023 und 2024 (für die genaue Förderberechnung)');
  const vars = { ...basisVars(S, l), datum: fdl(t), uhrzeit: ft(t), unterlagen: liste(docs) };
  const text = `Hallo ${vars.anrede_name},\n\nwie besprochen bestätige ich Ihnen hiermit unseren Termin:\n\n${vars.datum}, ${vars.uhrzeit} Uhr\n${vars.adresse}` +
    (S.regeln.unterlagen ? `\n\nBitte legen Sie, soweit vorhanden, folgende Unterlagen bereit:\n\n${vars.unterlagen}` : '') +
    `\n\nFalls Ihnen etwas dazwischenkommt, geben Sie mir gerne kurz Bescheid.`;
  return mitVorlage(S, l, 'terminbestaetigung', { betreff: `Terminbestätigung Hausbesuch ${PROD[typ] || ''} am ${fds(t)} um ${ft(t)} Uhr`, text }, vars);
}
export function mailRueckruf(S: State, l: Lead): Mail {
  const q = [
    `Wie hoch ist Ihr jährlicher Verbrauch an ${l.heizung.art === 'oel' ? 'Heizöl (Liter)' : ['gas', 'gasetage'].includes(l.heizung.art) ? 'Gas (kWh oder m³)' : 'Heizenergie'}?`,
    'In welchem Jahr wurde Ihre Heizung eingebaut?', 'Heizen Sie über Heizkörper, Fußbodenheizung oder beides?', 'Wie hoch ist Ihr Stromverbrauch pro Jahr?',
  ];
  const vars = { ...basisVars(S, l), fragen: liste(q) };
  const text = `Hallo ${vars.anrede_name},\n\nvielen Dank für Ihre Anfrage. Ich habe mehrfach versucht, Sie telefonisch zu erreichen, leider ohne Erfolg.\n\nDamit ich Ihnen eine erste Einschätzung geben kann, beantworten Sie mir gerne kurz diese Fragen:\n\n${vars.fragen}\n\nOder rufen Sie mich einfach zurück – dann besprechen wir alles direkt.`;
  return mitVorlage(S, l, 'rueckruf', { betreff: `Ihre Anfrage zur ${vars.produkt}`, text }, vars);
}
export function mailVorschlaege(S: State, l: Lead, starts: Date[], anlass: 'neu' | 'kunde_verschiebt' | 'berater_verschiebt' = 'neu'): Mail {
  const vars = { ...basisVars(S, l), vorschlaege: liste(starts.map(s => `${fdl(s)}, ${ft(s)} Uhr`)) };
  const einstieg = anlass === 'berater_verschiebt'
    ? 'leider muss ich unseren vereinbarten Termin verschieben – das tut mir sehr leid. Als Ersatz kann ich Ihnen anbieten:'
    : anlass === 'kunde_verschiebt' ? 'kein Problem, wir finden einen neuen Termin. Ich kann Ihnen anbieten:'
    : 'vielen Dank für das nette Gespräch. Für den Termin vor Ort kann ich Ihnen anbieten:';
  const text = `Hallo ${vars.anrede_name},\n\n${einstieg}\n\n${vars.vorschlaege}\n\nGeben Sie mir gerne kurz Bescheid, welcher Termin Ihnen passt. Der Besuch dauert etwa 1,5 Stunden.`;
  const art = anlass === 'neu' ? 'terminvorschlaege' : 'verschiebung';
  return mitVorlage(S, l, art, { betreff: anlass === 'neu' ? 'Terminvorschläge für Ihren Vor-Ort-Termin' : 'Neuer Termin für Ihren Vor-Ort-Termin', text }, vars);
}
export function mailFrei(S: State, l: Lead, b: string, t: string): Mail {
  const ohneNr = (x: string) => x.replace(new RegExp(`\\b(Lead\\s*)?${nrS(l)}\\b`, 'gi'), '').replace(/\s{2,}/g, ' ').trim(); // keine internen Nummern nach außen
  b = ohneNr(b || 'Ihre Anfrage');
  return { an: l.email, betreff: b.toLowerCase().includes(S.berater.firma.toLowerCase()) ? b : betreff(S, b), text: t.trim().replace(new RegExp(`\\bLead\\s*${nrS(l)}\\b`, 'gi'), '') + gruss(S), art: 'frei' };
}

// ---------- Kontaktkarte ----------
const vEsc = (x: unknown) => String(x ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
export const telIntl = (t: string) => { const d = String(t || '').replace(/[^\d+]/g, ''); return d.startsWith('+') ? d : d.startsWith('00') ? '+' + d.slice(2) : d.startsWith('0') ? '+49' + d.slice(1) : d; };
export const NOTIZ_FELDER = ['lead', 'quelle', 'produkte', 'objekt', 'heizung', 'foerderung', 'erreichbar', 'hinweise', 'termin', 'status'];
export function vcard(l: Lead, felder: string[] = NOTIZ_FELDER.slice(0, 8)): string {
  const o = l.objekt, h = l.heizung;
  const teil: Record<string, () => string> = {
    lead: () => `Lead ${nrS(l)}`,
    quelle: () => (l.quelle ? `Quelle: ${l.quelle}` : ''),
    produkte: () => l.produkte.map(p => PROD[p]).join(' + '),
    objekt: () => [o.typ, o.baujahr, o.flaeche ? o.flaeche + ' m²' : '', o.personen ? o.personen + ' Pers.' : ''].filter(Boolean).join(', '),
    heizung: () => (h.art !== 'unbekannt' ? `Heizung: ${HEIZ[h.art]}${h.einbau ? ' ' + h.einbau : ''}${h.standort ? ', ' + h.standort : ''}` : ''),
    foerderung: () => (l.produkte.includes('WP') ? `Förderung: ${foerderung(foerderEingabe(l)).einschaetzung}` : ''),
    erreichbar: () => (l.erreichbar.text ? `Erreichbar: ${l.erreichbar.text}` : ''),
    hinweise: () => (l.hinweise.length ? 'Hinweise: ' + l.hinweise.slice(0, 3).join('; ') : ''),
    termin: () => (l.termin ? `Termin: ${fdl(l.termin.start)} ${ft(l.termin.start)}` : ''),
    status: () => l.status,
  };
  const note = felder.map(f => teil[f]?.() || '').filter(Boolean).join('\n');
  return ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEsc(l.nachname)};${vEsc(l.vorname)};;${vEsc(l.anrede)};`, `FN:${vEsc(fullName(l))}`,
    `ADR;TYPE=HOME:;;${vEsc(l.strasse)};${vEsc(l.ort)};;${vEsc(l.plz)};Deutschland`,
    l.tel ? `TEL;TYPE=CELL:${telIntl(l.tel)}` : '', l.tel2 ? `TEL;TYPE=VOICE:${telIntl(l.tel2)}` : '',
    l.email ? `EMAIL;TYPE=INTERNET:${l.email}` : '', `NOTE:${vEsc(note)}`, 'END:VCARD'].filter(Boolean).join('\r\n');
}

// ---------- Kalendereintrag (.ics) ----------
const icsZeit = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEsc = (x: string) => String(x).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
export function ics(S: State, l: Lead): string {
  if (!l.termin) throw new Error('Kein Termin gebucht');
  const a = new Date(l.termin.start), e = new Date(+a + l.termin.dauer * 60000);
  const typ = l.termin.typ === 'TGA' ? 'TGA' : l.termin.typ;
  const besch = [`Lead ${nrS(l)} · ${l.produkte.map(p => PROD[p]).join(' + ')}`, l.tel ? `Tel: ${l.tel}` : '',
    l.heizung.art !== 'unbekannt' ? `Heizung: ${HEIZ[l.heizung.art]}${l.heizung.einbau ? ' ' + l.heizung.einbau : ''}` : '',
    l.produkte.includes('WP') ? `Förderung: ${foerderung(foerderEingabe(l)).einschaetzung}` : '',
    l.entscheider ? `Entscheider: ${l.entscheider}` : '', l.notiz ? `Notiz: ${l.notiz}` : ''].filter(Boolean).join('\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PAI//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:pai-${l.id}-${+a}@pai`, `DTSTAMP:${icsZeit(new Date())}`, `DTSTART:${icsZeit(a)}`, `DTEND:${icsZeit(e)}`,
    `SUMMARY:${icsEsc(`${typ} – ${l.nachname}, ${l.ort}`)}`, `LOCATION:${icsEsc(`${l.strasse}, ${l.plz} ${l.ort}`)}`,
    `DESCRIPTION:${icsEsc(besch)}`, `CATEGORIES:${typ}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Hausbesuch', 'TRIGGER:-PT60M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
export function foerderEingabe(l: Lead) {
  return { heizungsart: l.heizung.art, heizung_einbaujahr: l.heizung.einbau ?? null, funktionstuechtig: l.heizung.funktion ?? null,
    eigentuemer: l.eigentum.eigentuemer ?? null, selbstgenutzt: l.eigentum.selbst ?? null, wohneinheiten: l.objekt.we ?? null,
    zve: l.zve ?? null, minderjaehriges_kind: l.kind ?? null, neubau: l.objekt.neubau ?? null, baugenehmigung_jahr: l.objekt.baugenehmigung ?? null };
}

// ---------- Provision ----------
export function provision(S: State, now = new Date()) {
  const m = S.provision;
  const imMonat = S.leads.filter(l => l.abschlussDatum && sameMonth(l.abschlussDatum, now) && ABSCHLUSS.includes(l.status));
  const wp = imMonat.filter(l => l.produkte.includes('WP'));
  const staffel = [...m.wp.staffel].sort((a, b) => a.ab - b.ab);
  const stufeFuer = (n: number) => staffel.filter(s => n >= s.ab).pop()?.betrag ?? 0;
  let wpSumme = 0;
  if (m.wp.rueckwirkend) wpSumme = wp.length * stufeFuer(wp.length);
  else for (let i = 1; i <= wp.length; i++) wpSumme += stufeFuer(i);
  const fest = Object.entries(m.fest).map(([p, betrag]) => { const n = imMonat.filter(l => l.produkte.includes(p)).length; return { produkt: p, anzahl: n, summe: n * betrag }; });
  const offen = imMonat.filter(l => l.produkte.some(p => m.abfragen.includes(p)) && (l.pvProvision == null));
  const bekannt = imMonat.reduce((s, l) => s + (l.pvProvision || 0), 0);
  const naechste = staffel.find(s => s.ab > wp.length);
  const monatsende = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const tage = Math.ceil((+monatsende - +now) / 864e5);
  let hinweis = '';
  if (naechste) {
    const fehlt = naechste.ab - wp.length;
    const plus = m.wp.rueckwirkend ? wp.length * (naechste.betrag - stufeFuer(wp.length)) : 0;
    hinweis = `Noch ${fehlt} WP-Abschluss${fehlt === 1 ? '' : 'e'} bis ${eur(naechste.betrag)}-Stufe – Monat endet in ${tage} Tagen.${plus > 0 ? ` Rückwirkend +${eur(plus)} auf die bisherigen.` : ''}`;
  }
  return {
    monat: now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
    wp: { anzahl: wp.length, satz: eur(stufeFuer(wp.length)), summe: eur(wpSumme) },
    fest: fest.map(f => ({ ...f, summe: eur(f.summe) })),
    variabel_erfasst: eur(bekannt),
    variabel_offen: offen.map(l => `${nrS(l)} ${fullName(l)} – Provision nachfragen, nie schätzen`),
    gesamt_bekannt: eur(wpSumme + fest.reduce((s, f) => s + f.summe, 0) + bekannt),
    hinweis, offene_frage: 'Zählt ein geteilter Abschluss für die Staffel? Mit Vertrieb klären.',
  };
}
