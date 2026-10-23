// Datenmodell + Speicherung im Gerät (Version für Dienstag: nur Testdaten, localStorage).
export type Versuch = { ts: string; ok: boolean; ergebnis?: string };
export type Lead = {
  id: string; nr: number; anrede: string; vorname: string; nachname: string;
  strasse: string; plz: string; ort: string; tel: string; tel2?: string; email: string;
  quelle: string; anfrageId?: string; eingang: string; produkte: string[]; status: string; prio: string;
  objekt: { typ?: string; baujahr?: number | null; flaeche?: number | null; personen?: number | null; we?: number | null; neubau?: boolean | null; baugenehmigung?: number | null };
  heizung: { art: string; einbau?: number | null; funktion?: boolean | null; verbrauch?: number | null; einheit?: string; standort?: string; verteilung?: string };
  eigentum: { eigentuemer?: boolean | null; selbst?: boolean | null; mieter?: boolean | null };
  strom?: number | null; zve?: number | null; kind?: boolean | null; entscheider?: string;
  erreichbar: { ab?: string | null; bis?: string | null; text?: string | null };
  projektstart?: string; notiz?: string; hinweise: string[];
  versuche: Versuch[]; next: { typ: 'anruf' | 'mail' | 'termin' | 'aufgabe'; ts: string; text: string } | null;
  termin: { start: string; dauer: number; typ: string } | null; verschiebungen: number;
  abschlussDatum?: string | null; pvProvision?: number | null; verlustgrund?: string;
  timeline: { ts: string; text: string }[];
};
export type Slot = { start: string; leadId: string; ablauf: string };
export type Regeln = {
  terminStart: string; terminEnde: string; terminDauer: number; puffer: number; samstag: boolean; freieTage: number[];
  richtung: 'benachbart' | 'streng' | 'aus'; anrufStart: string; anrufTakt: number; maxVersuche: number; anrufBis: string;
  grussformel: boolean; unterlagen: boolean; steuerbescheide: boolean; angebotGueltigStunden: number;
};
export type Provisionsmodell = {
  wp: { staffel: { ab: number; betrag: number }[]; rueckwirkend: boolean };
  fest: Record<string, number>; // z. B. GF: 250
  abfragen: string[];           // nie schätzen, z. B. PV
};
export type State = {
  v: 1; nextNr: number; leads: Lead[]; slots: Slot[]; regeln: Regeln; freieRegeln: string[];
  log: { ts: string; text: string; basis: string }[];
  berater: { name: string; firma: string; heimat: string }; provision: Provisionsmodell;
};

export const DEFAULT_REGELN: Regeln = {
  terminStart: '11:00', terminEnde: '19:00', terminDauer: 90, puffer: 60, samstag: false, freieTage: [],
  richtung: 'benachbart', anrufStart: '09:00', anrufTakt: 15, maxVersuche: 3, anrufBis: '19:00',
  grussformel: false, unterlagen: true, steuerbescheide: true, angebotGueltigStunden: 48,
};
// Beispielmodell – im Chat änderbar, nicht fest in der Logik.
export const DEFAULT_PROVISION: Provisionsmodell = {
  wp: { staffel: [{ ab: 1, betrag: 1500 }, { ab: 5, betrag: 2000 }], rueckwirkend: true },
  fest: { GF: 250 }, abfragen: ['PV'],
};

export function leererState(): State {
  return { v: 1, nextNr: 1, leads: [], slots: [], regeln: { ...DEFAULT_REGELN }, freieRegeln: [], log: [],
    berater: { name: 'Ali', firma: 'Solarmeisterei', heimat: '' }, provision: structuredClone(DEFAULT_PROVISION) };
}

export function logP(S: State, text: string, basis = '') {
  S.log.push({ ts: new Date().toISOString(), text, basis });
  if (S.log.length > 300) S.log.splice(0, S.log.length - 300);
}
export const nrS = (l: Pick<Lead, 'nr'>) => String(l.nr).padStart(4, '0');
export const fullName = (l: Pick<Lead, 'vorname' | 'nachname'>) => [l.vorname, l.nachname].filter(Boolean).join(' ') || 'Ohne Namen';
export const anredeName = (l: Lead) => (l.anrede === 'Frau' ? 'Frau ' : l.anrede === 'Herr' ? 'Herr ' : '') + (l.nachname || fullName(l));
export const failCount = (l: Lead) => l.versuche.filter(v => !v.ok).length;
export const addTL = (l: Lead, text: string, ts = new Date()) => l.timeline.push({ ts: ts.toISOString(), text });

const KEY = 'pai-state-v1';
export function laden(): State | null {
  try { const s = localStorage.getItem(KEY); if (!s) return null; const o = JSON.parse(s); if (o?.v === 1) { o.regeln = { ...DEFAULT_REGELN, ...o.regeln }; return o; } } catch {}
  return null;
}
export function speichern(S: State) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
