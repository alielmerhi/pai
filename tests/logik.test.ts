import { describe, it, expect } from 'vitest';
import { foerderung, klimaSatz, hoechstkosten1 } from '../lib/foerderung';
import { richtung, vertraeglich } from '../lib/region';
import { leererState } from '../lib/state';
import { ausfuehren, Ctx } from '../lib/tools';
import { feiertag } from '../lib/zeit';

const ctx = (S = leererState(), now = new Date(2026, 9, 23, 10, 0)): Ctx => ({ S, acts: [], cards: [], now });
const lead = (c: Ctx, o: any = {}) => ausfuehren('lead_anlegen', { anrede: 'Herr', vorname: 'Test', nachname: 'Muster', strasse: 'Weg 1', plz: '16816', ort: 'Neuruppin', telefon: '0151 00000001', email: 'test.muster@example.com', heizungsart: 'oel', produkte: ['WP'], ...o }, c) as any;

describe('Förderung BEG EM', () => {
  const voll = { heizungsart: 'oel', funktionstuechtig: true, eigentuemer: true, selbstgenutzt: true, wohneinheiten: 1, minderjaehriges_kind: false, kosten: 30000 };
  const now = new Date(2026, 9, 23);
  it('Öl, zvE 25k: 30+16+40=86 → Deckel 80 %', () => { const f = foerderung({ ...voll, zve: 25000 }, now); expect(f.foerdersatz).toBe('80 %'); expect(f._werte.maxZuschuss).toBe(28000 * 0.8); });
  it('Öl, zvE 35k: 76 → Deckel 70 %', () => expect(foerderung({ ...voll, zve: 35000 }, now).foerdersatz).toBe('70 %'));
  it('Öl, zvE 60k: 30+16 = 46 %', () => expect(foerderung({ ...voll, zve: 60000 }, now).foerdersatz).toBe('46 %'));
  it('Kind: 45k - 10k = 35k → 30 %-Stufe', () => expect(foerderung({ ...voll, zve: 45000, minderjaehriges_kind: true }, now).begruendung.join()).toContain('Einkommensbonus 30 %'));
  it('Gas 15 Jahre: kein Klimabonus', () => expect(foerderung({ ...voll, heizungsart: 'gas', heizung_einbaujahr: 2011, zve: 60000 }, now).foerdersatz).toBe('30 %'));
  it('Gas 22 Jahre: Klimabonus', () => expect(foerderung({ ...voll, heizungsart: 'gas', heizung_einbaujahr: 2004, zve: 60000 }, now).foerdersatz).toBe('46 %'));
  it('Vermieter: nur Grund', () => expect(foerderung({ ...voll, selbstgenutzt: false, zve: 20000 }, now).foerdersatz).toBe('30 %'));
  it('Defekte Heizung: kein Klimabonus', () => expect(foerderung({ ...voll, funktionstuechtig: false, zve: 60000 }, now).foerdersatz).toBe('30 %'));
  it('Neubau: 0', () => expect(foerderung({ ...voll, neubau: true, zve: 20000 }, now).foerdersatz).toBe('0 %'));
  it('Offene Angaben → Spanne, vorläufig', () => { const f = foerderung({ heizungsart: 'oel' }, now); expect(f.status).toContain('vorläufig'); expect(f.foerdersatz).toBe('30–80 %'); });
  it('Absenkung', () => {
    expect(klimaSatz(new Date(2027, 0, 31))).toBe(16); expect(klimaSatz(new Date(2027, 1, 1))).toBe(12); expect(klimaSatz(new Date(2027, 7, 1))).toBe(8);
    expect(klimaSatz(new Date(2028, 1, 1))).toBe(4); expect(klimaSatz(new Date(2028, 7, 1))).toBe(0);
    expect(hoechstkosten1(new Date(2027, 1, 1))).toBe(27250);
  });
  it('Zeitargument vor 01.02.2027', () => expect(foerderung({ ...voll, zve: 60000 }, now).zeitargument).toContain('01.02.2027'));
  it('2 WE: Boni nur auf 1. Einheit', () => { const f = foerderung({ ...voll, zve: 60000, wohneinheiten: 2, kosten: 40000 }, now); expect(f._werte.maxZuschuss).toBe(28000 * 0.46 + 12000 * 0.3); });
});

describe('Richtung', () => {
  it('Berlin inkl. 141xx', () => { expect(richtung('14163')).toBe('Berlin'); expect(richtung('12524')).toBe('Berlin'); });
  it('Brandenburg', () => {
    expect(richtung('16816')).toBe('Nordwest'); expect(richtung('16909')).toBe('Nordwest'); expect(richtung('16515')).toBe('Nord');
    expect(richtung('14770')).toBe('West'); expect(richtung('14469')).toBe('Südwest'); expect(richtung('15831')).toBe('Süd');
    expect(richtung('15344')).toBe('Ost'); expect(richtung('03046')).toBe('Südost'); expect(richtung('19348')).toBe('Nordwest');
  });
  it('Verträglichkeit', () => { expect(vertraeglich('Nord', 'Nordwest')).toBe(true); expect(vertraeglich('Nord', 'Süd')).toBe(false); expect(vertraeglich('Nord', 'Nordwest', true)).toBe(false); });
  it('Feiertage', () => { expect(feiertag(new Date(2026, 9, 31))).toContain('Reformation'); expect(feiertag(new Date(2026, 3, 3))).toBe('Karfreitag'); });
});

describe('Leads, Anrufe, Termine', () => {
  it('Nummern fortlaufend, Dublette ergänzt statt neu', () => {
    const c = ctx(); lead(c); const r = lead(c, { quelle: 'WattFox', wohnflaeche: 140 });
    expect(r.dublette).toBe(true); expect(c.S.leads.length).toBe(1); expect(c.S.leads[0].objekt.flaeche).toBe(140);
    const r2 = lead(c, { vorname: 'Anna', nachname: 'Andere', telefon: '0151 00000002', email: 'a@example.com', plz: '16515' });
    expect(r2.lead).toBe('0002');
  });
  it('Erstanruf im 15-Minuten-Takt, ohne Doppelbelegung', () => {
    const c = ctx(); const a = lead(c); const b = lead(c, { nachname: 'Zwei', telefon: '0151 00000002', email: 'zwei@example.com' });
    expect(a.erstanruf).toBe('heute 10:15'); expect(b.erstanruf).toBe('heute 10:30');
  });
  it('Zeitfenster des Kunden', () => { const c = ctx(); expect(lead(c, { erreichbar_ab: '15:00' }).erstanruf).toBe('heute 15:00'); });
  it('3 Fehlversuche → Rückruf-Mail', () => {
    const c = ctx(); lead(c);
    ausfuehren('anruf_ergebnis', { lead: '1', ergebnis: 'mailbox' }, c); ausfuehren('anruf_ergebnis', { lead: '1', ergebnis: 'mailbox' }, c);
    const r: any = ausfuehren('anruf_ergebnis', { lead: '1', ergebnis: 'nicht_rangegangen' }, c);
    expect(r.rueckruf_mail).toBeTruthy(); expect(c.cards.some(k => k.type === 'mail')).toBe(true);
  });
  it('Termine erst nach Qualifizierung, genau 2, nie doppelt angeboten, nicht Sa', () => {
    const c = ctx(); lead(c); lead(c, { nachname: 'Zwei', telefon: '0151 00000002', email: 'zwei@example.com', plz: '16515', ort: 'Oranienburg' });
    expect(() => ausfuehren('termine_vorschlagen', { lead: '1' }, c)).toThrow(/qualifiziert/);
    ausfuehren('anruf_ergebnis', { lead: '1', ergebnis: 'erreicht' }, c); ausfuehren('anruf_ergebnis', { lead: '2', ergebnis: 'erreicht' }, c);
    const v1: any = ausfuehren('termine_vorschlagen', { lead: '1' }, c);
    const v2: any = ausfuehren('termine_vorschlagen', { lead: '2' }, c);
    expect(v1.vorschlaege.length).toBe(2); expect(v2.vorschlaege.length).toBe(2);
    const s1 = v1.vorschlaege.map((x: any) => x.start), s2 = v2.vorschlaege.map((x: any) => x.start);
    expect(s1.filter((x: string) => s2.includes(x))).toEqual([]);
    for (const s of [...s1, ...s2]) { const d = new Date(s); expect([0, 6]).not.toContain(d.getDay()); expect(d.getHours()).toBeGreaterThanOrEqual(11); }
  });
  it('Gegenrichtung wird nicht auf denselben Tag gelegt', () => {
    const c = ctx(); lead(c); lead(c, { nachname: 'Sued', telefon: '0151 00000002', email: 'sued@example.com', plz: '15831', ort: 'Mahlow' });
    ausfuehren('anruf_ergebnis', { lead: '1', ergebnis: 'erreicht' }, c); ausfuehren('anruf_ergebnis', { lead: '2', ergebnis: 'erreicht' }, c);
    ausfuehren('termin_buchen', { lead: '1', start: '2026-10-26T11:00' }, c);
    const v: any = ausfuehren('termine_vorschlagen', { lead: '2' }, c);
    for (const x of v.vorschlaege) expect(x.start.startsWith('2026-10-26')).toBe(false);
  });
  it('Buchung erzeugt Terminbestätigung mit Firma, ohne Grußformel', () => {
    const c = ctx(); lead(c); ausfuehren('anruf_ergebnis', { lead: '1', ergebnis: 'erreicht' }, c);
    ausfuehren('termin_buchen', { lead: '1', start: '2026-10-27T11:00' }, c);
    const m: any = c.cards.find(k => k.type === 'mail'); expect(m.betreff).toContain('Solarmeisterei'); expect(m.text).not.toContain('Viele Grüße');
    expect(() => ausfuehren('termin_buchen', { lead: '1', start: '2026-10-31T11:00' }, c)).toThrow();
  });
  it('Provision rückwirkend ab 5. WP', () => {
    const c = ctx();
    for (let k = 1; k <= 5; k++) { lead(c, { nachname: 'P' + k, telefon: '0151 0000010' + k, email: `p${k}@example.com` }); ausfuehren('status_setzen', { lead: String(k), status: 'vorvertrag' }, c); }
    const p: any = ausfuehren('provision_stand', {}, c); expect(p.wp.summe).toBe('10.000 €');
  });
  it('vCard mit +49 und Leadnummer', () => {
    const c = ctx(); lead(c); const k: any = c.cards.find(x => x.type === 'vcard');
    expect(k.vcf).toContain('TEL;TYPE=CELL:+4915100000001'); expect(k.vcf).toContain('Lead 0001');
  });
  it('Regel merken: dienstags keine Termine', () => {
    const c = ctx(); ausfuehren('regel_setzen', { schluessel: 'freieTage', wert: [2] }, c); expect(c.S.regeln.freieTage).toEqual([2]);
  });
  it('DSGVO: Nummer bleibt gesperrt', () => {
    const c = ctx(); lead(c); ausfuehren('lead_loeschen', { lead: '1', bestaetigt: true }, c);
    const r = lead(c, { nachname: 'Neu', telefon: '0151 00000009', email: 'neu@example.com' }); expect(r.lead).toBe('0002');
  });
});
