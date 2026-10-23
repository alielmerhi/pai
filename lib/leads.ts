import { Lead, State, nrS, fullName, addTL } from './state';
import { richtung } from './region';

export const PROD: Record<string, string> = { WP: 'Wärmepumpe', PV: 'Photovoltaik', SP: 'Speicher', GF: 'Glasfaser' };
export const HEIZ: Record<string, string> = {
  oel: 'Öl', gas: 'Gas (zentral)', gasetage: 'Gas-Etagenheizung', nachtspeicher: 'Nachtspeicher', kohle: 'Kohle',
  biomasse: 'Biomasse/Pellets', fernwaerme: 'Fernwärme', wp: 'Wärmepumpe (vorhanden)', sonstige: 'Sonstige', unbekannt: 'Unbekannt',
};
export const STATUS: Record<string, string> = {
  neu: 'Neu', kontakt: 'Kontaktversuch', qualifiziert: 'Telefonat geführt', termin: 'Termin', angebot: 'Angebot',
  vorvertrag: 'Vorvertrag', tga: 'Technische Prüfung', verkauft: 'Leistungsvertrag', abgeschlossen: 'Abgeschlossen',
  wiedervorlage: 'Wiedervorlage', verloren: 'Verloren', storniert: 'Storniert',
};
export const ABSCHLUSS = ['vorvertrag', 'tga', 'verkauft', 'abgeschlossen'];

export function heizAlias(x: unknown): string {
  const s = String(x || '').toLowerCase();
  if (HEIZ[s]) return s;
  return /öl|oel/.test(s) ? 'oel' : /etage/.test(s) ? 'gasetage' : /gas/.test(s) ? 'gas' : /nachtspeicher|elektro|strom/.test(s) ? 'nachtspeicher'
    : /kohle/.test(s) ? 'kohle' : /pellet|holz|biomasse/.test(s) ? 'biomasse' : /fern/.test(s) ? 'fernwaerme' : /wärmepumpe|waermepumpe/.test(s) ? 'wp' : s ? 'sonstige' : 'unbekannt';
}
export function statusAlias(x: unknown): string | null {
  const s = String(x || '').toLowerCase().trim();
  if (STATUS[s]) return s;
  const a: Record<string, string> = { telefonat: 'qualifiziert', vv: 'vorvertrag', 'technische prüfung': 'tga', leistungsvertrag: 'verkauft', verkauf: 'verkauft', abgesagt: 'verloren', wv: 'wiedervorlage' };
  return a[s] || null;
}
const digits = (s: unknown) => String(s || '').replace(/\D/g, '');
export const normTel = (s: unknown) => { const d = digits(s); return d.startsWith('49') ? '0' + d.slice(2) : d; };

export function prioritaet(l: Lead, jahr = new Date().getFullYear()): string {
  const art = l.heizung.art, alter = l.heizung.einbau ? jahr - l.heizung.einbau : null;
  if (l.objekt.neubau) return 'niedrig (Neubau – keine Förderung)';
  if (l.eigentum.selbst === false || l.eigentum.mieter || /gewerbe/i.test(l.objekt.typ || '')) return 'prüfen (Förderung/Vertragspartner klären)';
  if (/empfehlung/i.test(l.quelle)) return 'hoch (Empfehlung)';
  if (['oel', 'gasetage', 'nachtspeicher', 'kohle'].includes(art)) return 'hoch (Klimabonus)';
  if (['gas', 'biomasse'].includes(art)) {
    if (alter == null) return 'offen (Einbaujahr klären)';
    return alter >= 20 ? 'hoch (Klimabonus)' : 'niedrig (Gas unter 20 Jahren – Preisvergleich)';
  }
  return 'normal';
}

// Plausibilitätsprüfungen – feste Regeln, keine Vermutungen der KI
export function auffaelligkeiten(l: Lead, jahr = new Date().getFullYear()): string[] {
  const h: string[] = [];
  const tel = digits(l.tel);
  if (!tel) h.push('Keine Telefonnummer.');
  else if (tel.length < 10) h.push('Telefonnummer wirkt zu kurz – prüfen.');
  if (l.vorname && l.nachname && l.vorname.toLowerCase().replace(/\W/g, '') === l.nachname.toLowerCase().replace(/\W/g, '')) h.push('Vor- und Nachname identisch – Fake-Verdacht.');
  if (l.email && /^(info|kontakt|office|buero|büro|mail)@/i.test(l.email)) h.push('E-Mail wirkt wie Firmenadresse.');
  if (l.email) {
    const norm = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z]/g, '');
    const lokal = norm(l.email.split('@')[0]);
    const keys = [l.nachname, l.vorname].filter(x => x && x.length >= 3).map(x => norm(x).slice(0, 4));
    if (keys.length && !keys.some(k => lokal.includes(k))) h.push('E-Mail passt nicht zum Namen – evtl. andere Person.');
  }
  if (l.eigentum.mieter) h.push('Mieter fragt an – Vertragspartner ist der Eigentümer.');
  if (l.eigentum.selbst === false) h.push('Eigentümer wohnt nicht selbst – nur Grundförderung.');
  if (/gewerbe/i.test(l.objekt.typ || '')) h.push('Gewerbeobjekt – andere Förderregeln, Leistungsumfang prüfen.');
  if (l.objekt.neubau) h.push('Neubau – keine BEG-Einzelmaßnahme.');
  if (l.objekt.baujahr && l.heizung.einbau && l.heizung.einbau < l.objekt.baujahr) h.push(`Heizung (${l.heizung.einbau}) älter als das Haus (${l.objekt.baujahr}) – Widerspruch klären.`);
  if (l.objekt.baujahr && jahr - l.objekt.baujahr < 5) h.push('Haus jünger als 5 Jahre – BEG ausgeschlossen.');
  if (['gas', 'biomasse'].includes(l.heizung.art) && l.heizung.einbau && jahr - l.heizung.einbau < 20) h.push(`Gasheizung erst ${jahr - l.heizung.einbau} Jahre – kein Klimabonus. Zuerst: Warum jetzt wechseln?`);
  const kwh = waermeKwh(l);
  if (kwh && l.objekt.flaeche) {
    const spez = kwh / l.objekt.flaeche;
    if (spez > 200) h.push(`Verbrauch ${Math.round(spez)} kWh/m² – über 200, Fläche oder Gebäude prüfen.`);
    if (spez < 60) h.push(`Verbrauch nur ${Math.round(spez)} kWh/m² – auffällig niedrig, Angabe prüfen.`);
  }
  if (richtung(l.plz) === 'Unbekannt') h.push('PLZ keiner Richtung zuzuordnen – Region nachfragen.');
  return h;
}
export function waermeKwh(l: Lead): number | null {
  const v = l.heizung.verbrauch; if (!v) return null;
  const e = (l.heizung.einheit || 'kWh').toLowerCase();
  if (e === 'l') return v * 10;            // 1 l Öl ≈ 10 kWh
  if (e === 'm3') return v * 10;           // 1 m³ Erdgas ≈ 10 kWh (H-Gas grob)
  return v;
}
export function heizlastKw(l: Lead) { const k = waermeKwh(l); return k ? Math.round((k * 0.85 / 2000) * 10) / 10 : null; } // Nutzwärme ≈ 85 % · ÷ 2.000 h

export function pflichtFehlt(l: Lead): string[] {
  const m: string[] = []; if (!l.produkte.includes('WP')) return m;
  if (!l.heizung.verbrauch) m.push('Wärmeverbrauch');
  if (!l.strom) m.push('Stromverbrauch');
  if (!l.heizung.standort) m.push('Standort Heizung');
  if (!l.heizung.verteilung) m.push('Wärmeverteilung');
  if (['gas', 'biomasse'].includes(l.heizung.art) && !l.heizung.einbau) m.push('Einbaujahr Heizung');
  return m;
}
// Fragen aus dem Schema des Nutzers – nur, was noch nicht bekannt ist.
const NUR_WP = ['heizung', 'verbrauch', 'verteilung', 'einkommen'];
export function frageBekannt(l: Lead, key: string): boolean {
  switch (key) {
    case 'heizung': return l.heizung.art !== 'unbekannt' && !!l.heizung.einbau && !!l.heizung.standort;
    case 'verbrauch': return !!l.heizung.verbrauch;
    case 'verteilung': return !!l.heizung.verteilung;
    case 'gebaeude': return !!l.objekt.flaeche && !!l.objekt.baujahr && l.objekt.baujahr >= 2002;
    case 'strom': return !!l.strom;
    case 'eigentum': return l.eigentum.selbst != null && l.objekt.we != null;
    case 'einkommen': return l.zve != null && l.kind != null;
    case 'entscheider': return !!l.entscheider;
    default: return false; // motivation und eigene Fragen immer
  }
}
export function fragenFuersTelefonat(l: Lead, fragen: { key: string; text: string }[]): string[] {
  const wp = l.produkte.includes('WP');
  return fragen.filter(f => (wp || !NUR_WP.includes(f.key)) && !frageBekannt(l, f.key)).map(f => f.text);
}

export function findeDublette(S: State, i: { telefon?: string; email?: string; nachname?: string; plz?: string; strasse?: string }): Lead | null {
  const tel = normTel(i.telefon), mail = String(i.email || '').toLowerCase().trim();
  const nn = String(i.nachname || '').toLowerCase().trim(), plz = digits(i.plz);
  return S.leads.find(l =>
    (tel.length >= 8 && normTel(l.tel) === tel) ||
    (mail && l.email.toLowerCase() === mail) ||
    (nn && plz && l.nachname.toLowerCase() === nn && digits(l.plz) === plz)
  ) || null;
}

export function findLead(S: State, q: unknown): Lead {
  const s = String(q ?? '').trim(); if (!s) throw new Error('Kein Lead angegeben');
  const num = s.match(/^\D{0,6}(\d{1,4})\D*$/);
  if (num) { const l = S.leads.find(x => x.nr === Number(num[1])); if (l) return l; }
  const low = s.toLowerCase();
  const hits = S.leads.filter(l => (fullName(l) + ' ' + l.ort).toLowerCase().includes(low) || (l.nachname.length > 2 && low.includes(l.nachname.toLowerCase())));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw new Error('Mehrere Leads passen: ' + hits.map(l => nrS(l) + ' ' + fullName(l)).join(', '));
  throw new Error('Lead nicht gefunden: ' + s);
}

export function neuerLead(S: State, i: any, now = new Date()): Lead {
  const nr = S.nextNr++; // nie wiederverwendet
  let produkte = (Array.isArray(i.produkte) ? i.produkte : String(i.produkte || 'WP').split(/[,\s+]+/))
    .map((p: string) => { p = String(p).toUpperCase(); return p.startsWith('W') ? 'WP' : p.startsWith('PV') || p.startsWith('PH') ? 'PV' : p.startsWith('S') ? 'SP' : p.startsWith('G') ? 'GF' : p; })
    .filter((p: string) => PROD[p]);
  if (!produkte.length) produkte = ['WP'];
  const art = heizAlias(i.heizungsart);
  const n = (x: unknown) => { const v = Number(String(x ?? '').replace(/[^\d.]/g, '')); return isFinite(v) && v > 0 ? v : null; };
  const b = (x: unknown) => (x === true || x === false ? x : null);
  const l: Lead = {
    id: 'L' + nr, nr, anrede: i.anrede || '', vorname: i.vorname || '', nachname: i.nachname || '',
    strasse: i.strasse || '', plz: digits(i.plz), ort: i.ort || '', tel: i.telefon || '', tel2: i.telefon2 || '', email: i.email || '',
    quelle: i.quelle || 'E-Mail', anfrageId: i.anfrage_id || '', eingang: now.toISOString(), produkte: [...new Set<string>(produkte)], status: 'neu', prio: '',
    objekt: { typ: i.gebaeude || '', baujahr: n(i.baujahr_haus), flaeche: n(i.wohnflaeche), personen: n(i.personen), we: n(i.wohneinheiten), neubau: b(i.neubau), baugenehmigung: n(i.baugenehmigung_jahr) },
    heizung: { art, einbau: n(i.heizung_einbaujahr), funktion: b(i.heizung_funktionstuechtig), verbrauch: n(i.verbrauch), einheit: i.verbrauch_einheit || (art === 'oel' ? 'l' : 'kWh'), standort: i.standort_heizung || '', verteilung: i.verteilung || '' },
    eigentum: { eigentuemer: b(i.eigentuemer), selbst: b(i.selbstgenutzt), mieter: b(i.mieter) },
    strom: n(i.strom_kwh), zve: null, kind: null,
    erreichbar: { ab: i.erreichbar_ab || null, bis: i.erreichbar_bis || null, text: i.erreichbarkeit_text || null },
    projektstart: i.projektstart || '', notiz: i.notiz || '', hinweise: [], versuche: [], next: null, termin: null, verschiebungen: 0,
    timeline: [],
  };
  l.prio = prioritaet(l, now.getFullYear());
  l.hinweise = auffaelligkeiten(l, now.getFullYear());
  addTL(l, `Lead erstellt (${l.quelle})`, now);
  S.leads.push(l);
  return l;
}
