// Förderrechner BEG EM Wärmepumpe. Regeln versioniert – jede Rechnung nennt ihre Regelversion.
// Quelle der Regeln: Übergabedokument (Reform 21.07.2026). Vor Echtbetrieb gegen BAFA/KfW-Merkblatt prüfen.
import { eur } from './zeit';

export const REGELN = {
  version: 'BEG-EM-2026-07-21',
  grund: 30,
  klima: { start: 16, schritt: 4, ersteAbsenkung: new Date(2027, 1, 1), entfaelltAb: new Date(2028, 7, 1) },
  klimaHeizungenImmer: ['oel', 'kohle', 'nachtspeicher', 'gasetage'],
  klimaHeizungenAb20: ['gas', 'biomasse'],
  einkommen: [{ bis: 30000, satz: 40 }, { bis: 40000, satz: 30 }, { bis: 50000, satz: 10 }],
  kindAbzug: 10000,
  deckel: 70, deckelHoechsteStufe: 80,
  kosten1: { start: 28000, schritt: 750, minimum: 22000 }, // Absenkung halbjährlich ab 01.02.2027
  kosten2bis6: 15000, kostenAb7: 8000,
  baugenehmigungMinJahre: 5,
};

// Halbjahres-Stufe ab 01.02.2027: 0 vorher, 1 ab 01.02.2027, 2 ab 01.08.2027 ...
function stufe(d: Date) {
  const a = REGELN.klima.ersteAbsenkung;
  if (d < a) return 0;
  const monate = (d.getFullYear() - a.getFullYear()) * 12 + (d.getMonth() - a.getMonth());
  return Math.floor(monate / 6) + 1;
}
export function klimaSatz(antrag: Date) {
  if (antrag >= REGELN.klima.entfaelltAb) return 0;
  return Math.max(0, REGELN.klima.start - stufe(antrag) * REGELN.klima.schritt);
}
export function hoechstkosten1(antrag: Date) {
  const k = REGELN.kosten1;
  return Math.max(k.minimum, k.start - stufe(antrag) * k.schritt);
}
export function naechsteAbsenkung(nach: Date): Date | null {
  const a = REGELN.klima.ersteAbsenkung;
  if (nach < a) return a;
  const d = new Date(a); while (d <= nach) d.setMonth(d.getMonth() + 6);
  return d > REGELN.klima.entfaelltAb ? null : d;
}
export const zveJahre = (antragsjahr: number) => [antragsjahr - 3, antragsjahr - 2];

export type FoerderEingabe = {
  heizungsart?: string | null;          // oel | gas | gasetage | nachtspeicher | biomasse | kohle | fernwaerme | wp | sonstige | unbekannt
  heizung_einbaujahr?: number | null;
  funktionstuechtig?: boolean | null;
  eigentuemer?: boolean | null;
  selbstgenutzt?: boolean | null;
  wohneinheiten?: number | null;
  zve?: number | null;                  // Durchschnitt zvE der maßgeblichen Jahre
  minderjaehriges_kind?: boolean | null;
  neubau?: boolean | null;
  baugenehmigung_jahr?: number | null;
  kosten?: number | null;
  antragsdatum?: Date;
};

type Szenario = { satz: number; klima: number; eink: number; zuschuss: number };

function rechne(i: FoerderEingabe & { heizungsart: string }, antrag: Date, kosten: number) {
  const begr: string[] = [];
  if (i.neubau || (i.baugenehmigung_jahr && antrag.getFullYear() - i.baugenehmigung_jahr < REGELN.baugenehmigungMinJahre)) {
    return { satz: 0, klima: 0, eink: 0, zuschuss: 0, cap: 0, begr: ['Neubau bzw. Baugenehmigung jünger als 5 Jahre: keine BEG-Einzelmaßnahme.'] };
  }
  if (i.eigentuemer === false) begr.push('Antragsteller ist nicht Eigentümer – Vertragspartner/Antrag über den Eigentümer.');
  const selbst = !!i.selbstgenutzt && i.eigentuemer !== false;
  const grund = REGELN.grund; begr.push(`Grundförderung ${grund} %.`);
  let klima = 0;
  const alter = i.heizung_einbaujahr ? antrag.getFullYear() - i.heizung_einbaujahr : null;
  const art = i.heizungsart;
  const berechtigt = REGELN.klimaHeizungenImmer.includes(art) || (REGELN.klimaHeizungenAb20.includes(art) && alter != null && alter >= 20);
  if (selbst && berechtigt && i.funktionstuechtig !== false) {
    klima = klimaSatz(antrag); begr.push(`Klimabonus ${klima} % (${art}${alter != null ? ', ' + alter + ' Jahre' : ''}, selbstgenutzt).`);
  }
  let eink = 0, z: number | null = null;
  if (selbst && i.zve != null) {
    z = i.zve - (i.minderjaehriges_kind ? REGELN.kindAbzug : 0);
    eink = REGELN.einkommen.find(s => z! <= s.bis)?.satz ?? 0;
    begr.push(`Einkommensbonus ${eink} % (anzusetzendes zvE ${eur(z)}${i.minderjaehriges_kind ? ' nach Kinderabzug' : ''}).`);
  }
  const hoechste = eink === REGELN.einkommen[0].satz;
  const deckel = hoechste ? REGELN.deckelHoechsteStufe : REGELN.deckel;
  const roh = grund + klima + eink, satz = Math.min(roh, deckel);
  if (roh > deckel) begr.push(`Gedeckelt auf ${deckel} % (rechnerisch ${roh} %).`);
  const we = Math.max(1, Math.round(i.wohneinheiten || 1));
  const cap1 = hoechstkosten1(antrag);
  let capRest = 0; for (let k = 2; k <= we; k++) capRest += k <= 6 ? REGELN.kosten2bis6 : REGELN.kostenAb7;
  // Boni nur für die selbstgenutzte Einheit (1. WE), weitere WE nur Grundförderung
  const t1 = Math.min(kosten, cap1), tr = Math.min(Math.max(kosten - cap1, 0), capRest);
  const zuschuss = t1 * satz / 100 + tr * grund / 100;
  if (we > 1) begr.push(`${we} Wohneinheiten: förderfähig ${eur(cap1 + capRest)}, Boni nur auf die selbstgenutzte Einheit.`);
  return { satz, klima, eink, zuschuss, cap: cap1 + capRest, begr, z, deckel, alter };
}

export function foerderung(e: FoerderEingabe, now = new Date()) {
  const antrag = e.antragsdatum || now;
  const kosten = e.kosten && e.kosten > 0 ? e.kosten : 30000;
  const art = (e.heizungsart || 'unbekannt').toLowerCase();
  const fehlend: string[] = [], warnungen: string[] = [], nachweise: string[] = [];

  if (e.eigentuemer == null) fehlend.push('Eigentümer ja/nein');
  if (e.selbstgenutzt == null) fehlend.push('Selbstnutzung');
  if (e.wohneinheiten == null) fehlend.push('Wohneinheiten laut Grundbuch');
  if (art === 'unbekannt') fehlend.push('Heizungsart');
  if (REGELN.klimaHeizungenAb20.includes(art) && !e.heizung_einbaujahr) fehlend.push('Einbaujahr Heizung (Typenschild)');
  if (e.funktionstuechtig == null) fehlend.push('Heizung funktionstüchtig?');
  if (e.zve == null && e.selbstgenutzt !== false) fehlend.push(`zvE ${zveJahre(antrag.getFullYear()).join('/')} (Einkommensteuerbescheide)`);
  if (e.minderjaehriges_kind == null && e.selbstgenutzt !== false) fehlend.push('minderjährige Kinder');

  // Spanne: ungünstigste und günstigste Annahme für jede offene Angabe
  const schlecht = { ...e, heizungsart: art, eigentuemer: e.eigentuemer ?? false, selbstgenutzt: e.selbstgenutzt ?? false,
    funktionstuechtig: e.funktionstuechtig ?? false, zve: e.zve ?? null, minderjaehriges_kind: e.minderjaehriges_kind ?? false,
    heizung_einbaujahr: e.heizung_einbaujahr ?? null, wohneinheiten: e.wohneinheiten ?? 1 };
  const gut = { ...e, heizungsart: art, eigentuemer: e.eigentuemer ?? true, selbstgenutzt: e.selbstgenutzt ?? true,
    funktionstuechtig: e.funktionstuechtig ?? true, zve: e.zve ?? 0, minderjaehriges_kind: e.minderjaehriges_kind ?? true,
    heizung_einbaujahr: e.heizung_einbaujahr ?? (REGELN.klimaHeizungenAb20.includes(art) ? antrag.getFullYear() - 25 : null), wohneinheiten: e.wohneinheiten ?? 1 };
  const min = rechne(schlecht, antrag, kosten), max = rechne(gut, antrag, kosten);
  const geprueft = fehlend.length === 0;

  // Warnungen
  if (art === 'fernwaerme') warnungen.push('Fernwärme: nicht auf der Klimabonus-Liste, Quellenlage widersprüchlich – Sonderfall, nicht zusagen.');
  if (REGELN.klimaHeizungenAb20.includes(art) && e.heizung_einbaujahr) {
    const alter = antrag.getFullYear() - e.heizung_einbaujahr;
    if (alter < 20) warnungen.push(`Heizung erst ${alter} Jahre alt – kein Klimabonus (frühestens ${e.heizung_einbaujahr + 20}). Zuerst klären: Warum jetzt wechseln?`);
    else if (alter < 22) warnungen.push('Heizung knapp über 20 Jahre – Einbaujahr per Foto vom Typenschild belegen.');
  }
  if (e.funktionstuechtig === false) warnungen.push('Heizung defekt: Klimabonus setzt den Austausch einer funktionstüchtigen Heizung voraus.');
  if (e.selbstgenutzt === false) warnungen.push('Nicht selbstgenutzt: nur Grundförderung, keine Boni.');
  if (min.z != null) {
    const stufeObergrenze = REGELN.einkommen.find(s => min.z! <= s.bis);
    if (stufeObergrenze) { const luft = stufeObergrenze.bis - min.z!; if (luft <= 2000) warnungen.push(`Einkommensstufe kippt bei +${eur(luft + 1)} zvE.`); }
  }
  warnungen.push('Antrag vor Vorhabenbeginn – kein Einbau vor Antrag.');
  if (e.selbstgenutzt !== false) nachweise.push(`Einkommensteuerbescheide ${zveJahre(antrag.getFullYear()).join(' und ')} (Lohnsteuerbescheinigung reicht nicht)`);
  nachweise.push('Grundbuchauszug (Eigentum, Wohneinheiten)');
  if (REGELN.klimaHeizungenAb20.includes(art)) nachweise.push('Foto Typenschild Heizung (Einbaujahr)');

  // Zeitargument: Antrag vor nächster Absenkung
  let zeitargument: string | null = null;
  const naechste = naechsteAbsenkung(antrag);
  if (naechste && max.klima > 0) {
    const spaeter = rechne(gut, naechste, kosten);
    const diff = max.zuschuss - spaeter.zuschuss;
    if (diff > 0) {
      const tage = Math.ceil((+naechste - +antrag) / 864e5);
      zeitargument = `Antrag vor dem ${naechste.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} (noch ${tage} Tage) sichert bis zu ${eur(diff)} mehr. Vertrag/Antrag jetzt, Einbau später ist möglich. Ab dann gelten zvE ${zveJahre(naechste.getFullYear()).join('/')}.`;
    }
  }

  return {
    regelversion: REGELN.version,
    status: geprueft ? 'geprüft' : 'vorläufig – Voraussetzungen offen, KEINE Zahl an den Kunden',
    kosten_angenommen: eur(kosten) + (e.kosten ? '' : ' (Annahme)'),
    foerdersatz: geprueft ? `${max.satz} %` : `${min.satz}–${max.satz} %`,
    zuschuss: geprueft ? eur(max.zuschuss) : `${eur(min.zuschuss)} – ${eur(max.zuschuss)}`,
    eigenanteil: geprueft ? eur(kosten - max.zuschuss) : `${eur(kosten - max.zuschuss)} – ${eur(kosten - min.zuschuss)}`,
    foerderfaehige_kosten: eur(max.cap),
    begruendung: max.begr,
    fehlende_angaben: fehlend,
    fehlende_nachweise: nachweise,
    warnungen,
    zeitargument,
    _werte: { minSatz: min.satz, maxSatz: max.satz, minZuschuss: min.zuschuss, maxZuschuss: max.zuschuss, klima: max.klima },
  };
}
