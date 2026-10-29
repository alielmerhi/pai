import { describe, it, expect } from 'vitest';
import { leererState, State } from '../lib/state';
import { ausfuehren, Ctx, BEISPIEL_GEO } from '../lib/tools';
import { freieZeiten, tagesroute, besteReihenfolge } from '../lib/planung';
import { feiertag } from '../lib/zeit';
import { kontext } from '../lib/prompt';

const NOW = new Date(2026, 9, 29, 10, 0); // Do 29.10.2026
const ctx = (S: State = leererState(), zug = 1): Ctx => ({ S, acts: [], cards: [], now: NOW, zug, geo: { ...BEISPIEL_GEO, '10115': { lat: 52.532, lon: 13.384 } } });
const run = (c: Ctx, n: string, i: any = {}) => ausfuehren(n, i, c) as any;
const eingerichtet = () => { const c = ctx(); run(c, 'profil_einrichten', { name: 'Ali', beruf: 'Berater', start_plz: '10115', start_ort: 'Berlin', arbeitsbeginn: '08:00', arbeitsende: '18:00', freie_tage: ['Samstag', 'Sonntag'] }); return c; };

describe('Einstieg und Profil', () => {
  it('Kontext verlangt Einstiegsgespräch', () => expect(kontext(leererState(), NOW)).toContain('noch nicht eingerichtet'));
  it('profil_einrichten nur einmal', () => { const c = eingerichtet(); expect(c.S.profil.eingerichtet).toBe(true); expect(c.S.profil.start.geo).toBeTruthy(); expect(() => run(c, 'profil_einrichten', { name: 'X' })).toThrow(); });
  it('Änderung erst nach Ja in neuer Nachricht', () => {
    const c = eingerichtet(); const v = run(c, 'profil_aendern', { feld: 'freie_tage', wert: ['Freitag', 'Samstag', 'Sonntag'], beschreibung: 'freitags frei' });
    expect(() => run(c, 'profil_bestaetigen', { id: v.id })).toThrow();
    c.zug = 2; run(c, 'profil_bestaetigen', { id: v.id }); expect(c.S.profil.freieTage).toEqual([5, 6, 0]);
    run(c, 'profil_zuruecknehmen', { id: v.id }); expect(c.S.profil.freieTage).toEqual([6, 0]);
  });
});

describe('Kontakte und Gedächtnis', () => {
  it('anlegen, Dublette, Karte', () => {
    const c = eingerichtet(); run(c, 'kontakt_anlegen', { vorname: 'Eva', nachname: 'Test', plz: '10405', ort: 'Berlin', email: 'e@example.com' });
    expect(c.cards[0].type).toBe('vcard');
    const d = run(c, 'kontakt_anlegen', { vorname: 'Eva', nachname: 'Test', telefon: '0151 1' , email: 'E@example.com' });
    expect(d.dublette).toBe(true); expect(c.S.kontakte).toHaveLength(1); expect(c.S.kontakte[0].tel).toBe('0151 1');
  });
  it('Notiz mit Persönlichem und Aufgabe', () => {
    const c = eingerichtet(); run(c, 'kontakt_anlegen', { vorname: 'Eva', nachname: 'Test' });
    const r = run(c, 'notiz_speichern', { kontakt: 'Test', zusammenfassung: 'Gutes Gespräch.', offen: ['Preis'], persoenliches: ['Katze Mia'], aufgaben: [{ text: 'Angebot schicken', faellig: 'morgen' }] });
    expect(r.gespeichert).toBe(true); expect(c.S.kontakte[0].persoenliches).toContain('Katze Mia'); expect(c.S.aufgaben[0].faellig).toBe('2026-10-30');
    const s = run(c, 'spickzettel', { kontakt: '1' }); expect(s.offene_punkte).toContain('Preis');
  });
  it('Gesundheitsangaben erst nach Rückfrage', () => {
    const c = eingerichtet(); run(c, 'kontakt_anlegen', { vorname: 'Eva', nachname: 'Test' });
    const r = run(c, 'notiz_speichern', { kontakt: '1', zusammenfassung: 'Hat Rückenprobleme.' });
    expect(r.gespeichert).toBe(false); expect(c.S.kontakte[0].notizen).toHaveLength(0);
    expect(run(c, 'notiz_speichern', { kontakt: '1', zusammenfassung: 'Hat Rückenprobleme.', sensibel_bestaetigt: true }).gespeichert).toBe(true);
  });
});

describe('Disponent', () => {
  it('Beispieldaten: Konflikt erkannt, bessere Reihenfolge', () => {
    const c = eingerichtet(); run(c, 'beispieldaten_laden');
    expect(c.S.kontakte).toHaveLength(4); expect(c.S.termine).toHaveLength(4);
    const tag = new Date(c.S.termine[0].start);
    const r = tagesroute(c.S, tag); expect(r.stationen.some(s => s.konflikt)).toBe(true);
    const b = besteReihenfolge(c.S, tag)!; expect(b.ersparnis_min).toBeGreaterThan(10);
  });
  it('freie Zeiten respektieren Arbeitszeit, freie Tage und Fahrzeit', () => {
    const c = eingerichtet(); run(c, 'beispieldaten_laden');
    const v = freieZeiten(c.S, { geo: BEISPIEL_GEO['13467'] }, { anzahl: 5 }, NOW);
    expect(v.length).toBeGreaterThan(0);
    for (const x of v) { const d = new Date(x.start); expect([0, 6]).not.toContain(d.getDay()); expect(d.getHours()).toBeGreaterThanOrEqual(8); }
  });
  it('Termin eintragen warnt bei Überschneidung', () => {
    const c = eingerichtet(); run(c, 'beispieldaten_laden'); const t = c.S.termine[0];
    const r = run(c, 'termin_eintragen', { titel: 'Test', start: t.start, plz: '10405' });
    expect(r.warnungen.join()).toContain('Überschneidet');
  });
  it('Navigation braucht Adresse', () => {
    const c = eingerichtet(); run(c, 'beispieldaten_laden'); run(c, 'navigation', { kontakt: 'Berger' });
    expect(c.cards.at(-1)!.type).toBe('navi');
  });
});

it('Feiertage', () => { expect(feiertag(new Date(2026, 9, 31))).toContain('Reformation'); expect(feiertag(new Date(2026, 9, 30))).toBeNull(); });
