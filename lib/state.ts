// Datenmodell des Second Brain. Alles liegt nur auf dem Gerät (localStorage).
import type { Geo } from './region';

export type Notiz = {
  id: number; ts: string; art: 'gespraech' | 'telefonat' | 'notiz' | 'mail';
  zusammenfassung: string; vereinbart: string[]; offen: string[];
};
export type Kontakt = {
  id: string; nr: number; anrede: string; vorname: string; nachname: string; firma: string;
  strasse: string; plz: string; ort: string; tel: string; email: string;
  quelle: string; status: string; tags: string[];
  persoenliches: string[];       // Smalltalk, Familie, Hobbys – was dem Kunden wichtig ist
  notizen: Notiz[];
  erstellt: string; geo?: Geo | null;
};
export type Termin = { id: number; kontaktId?: string; titel: string; start: string; dauer: number; ort: string; plz: string; geo?: Geo | null; notiz?: string };
export type Aufgabe = { id: number; kontaktId?: string; text: string; faellig?: string | null; erledigt: boolean; erstellt: string };

// Wie der Nutzer arbeitet – entsteht im Einstiegsgespräch, später nur mit Bestätigung änderbar.
export type Profil = {
  eingerichtet: boolean;
  name: string; beruf: string; branche: string; assistent: string;
  start: { strasse: string; plz: string; ort: string; geo?: Geo | null }; // Startpunkt der Touren
  arbeitsbeginn: string; arbeitsende: string; terminDauer: number; puffer: number;
  freieTage: number[];              // 0 = So … 6 = Sa
  arbeitsweise: string[];           // Abläufe in seinen Worten
  regeln: string[];                 // „frag immer nach …“, „Sie-Form in Mails“
  nervt: string[];                  // Was ihn heute am meisten Zeit kostet
};
export type Aenderung = { id: number; ts: string; feld: string; vorher: unknown; nachher: unknown; text: string; status: 'offen' | 'aktiv' | 'zurueckgenommen'; zug: number };
export type State = {
  v: 2; nextNr: number; nextId: number;
  profil: Profil; kontakte: Kontakt[]; termine: Termin[]; aufgaben: Aufgabe[];
  aenderungen: Aenderung[]; zug: number; log: { ts: string; text: string }[];
};

export const LEERES_PROFIL: Profil = {
  eingerichtet: false, name: '', beruf: '', branche: '', assistent: 'PAI',
  start: { strasse: '', plz: '', ort: '' },
  arbeitsbeginn: '09:00', arbeitsende: '18:00', terminDauer: 60, puffer: 15, freieTage: [0, 6],
  arbeitsweise: [], regeln: [], nervt: [],
};

export function leererState(): State {
  return { v: 2, nextNr: 1, nextId: 1, profil: structuredClone(LEERES_PROFIL), kontakte: [], termine: [], aufgaben: [], aenderungen: [], zug: 0, log: [] };
}

export function logP(S: State, text: string) {
  S.log.push({ ts: new Date().toISOString(), text });
  if (S.log.length > 300) S.log.splice(0, S.log.length - 300);
}
export const nrS = (k: Pick<Kontakt, 'nr'>) => String(k.nr).padStart(4, '0');
export const fullName = (k: Pick<Kontakt, 'vorname' | 'nachname'> & { firma?: string }) => [k.vorname, k.nachname].filter(Boolean).join(' ') || k.firma || 'Ohne Namen';
export const adresse = (x: { strasse?: string; plz?: string; ort?: string }) => [x.strasse, [x.plz, x.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
export const neueId = (S: State) => S.nextId++;

const KEY = 'pai-brain-v2';
export function laden(): State | null {
  try {
    const s = localStorage.getItem(KEY); if (!s) return null;
    const o = JSON.parse(s);
    if (o?.v === 2) { o.profil = { ...structuredClone(LEERES_PROFIL), ...o.profil }; o.aenderungen ||= []; o.zug ||= 0; return o; }
  } catch {}
  return null;
}
export function speichern(S: State) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
