// Testdaten für die Demo – frei erfunden, Telefonnummern im 0151-000-Bereich, Mails @example.com.
import { State, leererState } from './state';
import { ausfuehren, Ctx } from './tools';
import { addWerktage, localIso, at } from './zeit';

export function demoState(now = new Date()): State {
  const S = leererState();
  // PLZ-Mittelpunkte der Demo-Orte, damit die Demo auch ohne Geodienst Fahrzeiten kennt
  const geo = { '16540': { lat: 52.6745, lon: 13.2876 }, '16816': { lat: 52.9258, lon: 12.8043 }, '16515': { lat: 52.7545, lon: 13.2369 }, '14469': { lat: 52.4256, lon: 13.0347 } };
  const c: Ctx = { S, acts: [], cards: [], now, geo };
  const run = (n: string, i: any) => { try { ausfuehren(n, i, c); } catch { /* Demo darf nie am Start scheitern */ } };
  run('lead_anlegen', { anrede: 'Herr', vorname: 'Matthias', nachname: 'Brenner', strasse: 'Birkenallee 7', plz: '16540', ort: 'Hohen Neuendorf', telefon: '0151 000 01 01', email: 'm.brenner@example.com', quelle: 'WattFox', produkte: ['WP'], gebaeude: 'EFH', baujahr_haus: 1978, wohnflaeche: 145, heizungsart: 'oel', heizung_einbaujahr: 1998, eigentuemer: true, selbstgenutzt: true, wohneinheiten: 1 });
  run('anruf_ergebnis', { lead: '1', ergebnis: 'erreicht', notiz: 'Frau entscheidet mit' });
  run('lead_aktualisieren', { lead: '1', verbrauch: 2800, verbrauch_einheit: 'l', strom_kwh: 3900, standort_heizung: 'Keller', verteilung: 'Heizkörper', heizung_funktionstuechtig: true, minderjaehriges_kind: false });
  const t1 = at(addWerktage(now, 1), 11, 0);
  run('termin_buchen', { lead: '1', start: localIso(t1) });

  run('lead_anlegen', { anrede: 'Frau', vorname: 'Sabine', nachname: 'Kranz', strasse: 'Seeufer 3', plz: '16816', ort: 'Neuruppin', telefon: '0151 000 01 02', email: 'sabine.kranz@example.com', quelle: 'betterbusiness', produkte: ['WP'], gebaeude: 'EFH', baujahr_haus: 1994, wohnflaeche: 128, heizungsart: 'gas', heizung_einbaujahr: 2003, erreichbar_ab: '16:00', erreichbarkeit_text: 'ab 16 Uhr' });
  run('anruf_ergebnis', { lead: '2', ergebnis: 'mailbox' });
  run('anruf_ergebnis', { lead: '2', ergebnis: 'nicht_rangegangen' });

  run('lead_anlegen', { anrede: 'Herr', vorname: 'Jens', nachname: 'Wolter', strasse: 'Lindenring 21', plz: '16515', ort: 'Oranienburg', telefon: '0151 000 01 03', email: 'jens.wolter@example.com', quelle: 'musterhaus.net', produkte: ['WP'], gebaeude: 'DHH', baujahr_haus: 2002, wohnflaeche: 118, heizungsart: 'gas', heizung_einbaujahr: 2015 });

  run('lead_anlegen', { anrede: 'Frau', vorname: 'Petra', nachname: 'Lindner', strasse: 'Am Hang 5', plz: '14469', ort: 'Potsdam', telefon: '0151 000 01 04', email: 'p.lindner@example.com', quelle: 'Empfehlung', produkte: ['WP', 'PV'], gebaeude: 'EFH', baujahr_haus: 1968, wohnflaeche: 160, heizungsart: 'nachtspeicher', erreichbar_ab: '15:00', erreichbarkeit_text: 'ab 15 Uhr' });
  S.log = [];
  return S;
}

export const BEISPIEL_MAIL = `Neue Anfrage – Wärmepumpen-Kosten-Vergleich

Anrede: Herr
Vorname: Thomas
Nachname: Berger
Straße: Kiefernweg 12
PLZ / Ort: 16909 Wittstock/Dosse
Telefon: 0151 000 01 99
E-Mail: t.berger@example.com
Gebäudeart: Einfamilienhaus
Baujahr Haus: 1985
Wohnfläche: 130 m²
Personen im Haushalt: 3
Aktuelle Heizung: Öl
Alter der Heizung: über 20 Jahre
Standort Heizung: Keller
Eigentümer: ja, selbst bewohnt
Interesse: Wärmepumpe, eventuell Photovoltaik
Projektstart: in 6–12 Monaten
Erreichbarkeit: ab 14 Uhr`;
