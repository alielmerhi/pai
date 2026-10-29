// PAI denkt mit: passende nächste Schritte als Knöpfe – nach jeder Aktion und zum richtigen Zeitpunkt.
// Feste Regeln, keine KI. Höchstens zwei Knöpfe; was nie genutzt wird, verschwindet.
import { State, Kontakt, fullName, nrS } from './state';
import { termineAm, ende, besteReihenfolge, tagesroute } from './planung';
import { fd, ft, relDay, sameDay } from './zeit';

export type Knopf = { key: string; label: string; text: string; diktat?: boolean };
export type Hinweis = { id: string; text: string; knoepfe: Knopf[] };

const kName = (S: State, x: unknown): string | null => {
  const s = String(x ?? '').trim(); if (!s) return null;
  const k = /^\d{1,4}$/.test(s) ? S.kontakte.find(k => k.nr === +s) : S.kontakte.find(k => fullName(k).toLowerCase().includes(s.toLowerCase()) || k.nachname.toLowerCase() === s.toLowerCase());
  return k ? fullName(k) : null;
};

// Nach einem Werkzeug-Aufruf: was liegt als Nächstes nahe?
export function nachAktion(S: State, name: string, i: any, out: any): Knopf[] {
  const n = kName(S, out?.kontakt ?? out?.name ?? i?.kontakt) || (out?.name as string) || '';
  switch (name) {
    case 'profil_einrichten': return [
      { key: 'beispiele', label: 'Beispieldaten laden', text: 'Beispieldaten laden' },
      { key: 'erster-kontakt', label: 'Ersten Kontakt anlegen', text: 'Ich möchte einen neuen Kontakt anlegen.' }];
    case 'beispieldaten_laden': return [
      { key: 'route-morgen', label: 'Wie fahre ich morgen?', text: 'Wie fahre ich morgen?' },
      { key: 'spickzettel', label: 'Was weiß ich über Thomas Berger?', text: 'Was weiß ich über Thomas Berger?' }];
    case 'kontakt_anlegen': return out?.dublette || !n ? [] : [
      { key: 'termin-finden', label: 'Termin finden', text: `Ich ruf ${n} gleich an – gib mir 2 Terminvorschläge.` },
      { key: 'notiz-erzaehlen', label: 'Notiz erzählen', text: `Notiz zu ${n}: `, diktat: true }];
    case 'kontakt_akte': return n ? [
      { key: 'termin-finden', label: 'Termin finden', text: `Wann passt ein Termin mit ${n}?` },
      { key: 'notiz-erzaehlen', label: 'Notiz ergänzen', text: `Notiz zu ${n}: `, diktat: true }] : [];
    case 'notiz_speichern': {
      if (!out?.gespeichert || !n) return [];
      const k: Knopf[] = [];
      if (!out.aufgaben_neu?.length) k.push({ key: 'wiedervorlage', label: 'Wiedervorlage in 1 Woche', text: `Erinner mich in einer Woche an ${n}.` });
      k.push({ key: 'danke-mail', label: 'Danke-Mail entwerfen', text: `Schreib ${n} eine kurze Danke-Mail zum Gespräch.` });
      return k;
    }
    case 'spickzettel': return n ? [{ key: 'navi', label: 'Navi starten', text: `Starte die Navigation zu ${n}.` }] : [];
    case 'zeiten_vorschlagen': return out?.vorschlaege?.length ? [
      { key: 'vorschlag-eintragen', label: `${out.vorschlaege[0].anzeige} eintragen`, text: `Trag den Termin am ${out.vorschlaege[0].anzeige} ein.` },
      { key: 'andere-tage', label: 'Andere Tage', text: 'Zeig mir Zeiten an anderen Tagen.' }] : [];
    case 'termin_eintragen': case 'termin_verschieben': {
      const t = S.termine.find(x => x.id === out?.termin); if (!t) return [];
      return [{ key: 'route-tag', label: `Route ${fd(t.start)} prüfen`, text: `Wie fahre ich am ${fd(t.start)}?` },
        ...(t.kontaktId ? [{ key: 'bestaetigung', label: 'Bestätigung schreiben', text: `Schreib ${t.titel.split(' – ')[0]} eine kurze Terminbestätigung.` }] : [])];
    }
    case 'tagesroute': {
      const b = out?.bessere_reihenfolge;
      return [
        ...(b?.ersparnis_min > 0 ? [{ key: 'reihenfolge', label: `Reihenfolge tauschen (−${b.ersparnis_min} Min.)`, text: 'Ja, tausch die Termine wie vorgeschlagen.' }] : []),
        ...(out?.stationen?.length ? [{ key: 'navi-erster', label: 'Navi zum ersten Termin', text: 'Starte die Navigation zum ersten Termin.' }] : [])];
    }
    case 'uebersicht': return out?.termine?.length ? [
      { key: 'route-tag', label: 'Route prüfen', text: `Wie fahre ich am ${out.tag}?` },
      ...(out.termine[0].kontakt ? [{ key: 'spickzettel', label: 'Spickzettel erster Termin', text: `Bereite mich auf ${String(out.termine[0].kontakt).replace(/^\d{4} /, '')} vor.` }] : [])] : [];
  }
  return [];
}

// Zum richtigen Zeitpunkt (beim Öffnen und solange die App offen ist).
export function hinweise(S: State, now = new Date()): Hinweis[] {
  if (!S.profil.eingerichtet) return [];
  const h: Hinweis[] = [];
  const kOf = (id?: string): Kontakt | undefined => (id ? S.kontakte.find(k => k.id === id) : undefined);
  const heute = termineAm(S, now);
  for (const t of S.termine) {
    const bis = (+new Date(t.start) - +now) / 60000, seit = (+now - +ende(t)) / 60000, k = kOf(t.kontaktId);
    if (bis > 0 && bis <= 60) h.push({ id: `vor-${t.id}-${t.start}`, text: `In ${Math.round(bis)} Min.: **${t.titel}**${t.ort ? ` (${t.ort})` : ''}.`, knoepfe: [
      ...(k ? [{ key: 'spickzettel', label: 'Spickzettel', text: `Ich fahr gleich zu ${fullName(k)} – was muss ich wissen?` }] : []),
      { key: 'navi', label: 'Navi starten', text: `Starte die Navigation zum Termin um ${ft(t.start)}.` }] });
    if (k && seit > 0 && seit <= 6 * 60 && !k.notizen.some(n => +new Date(n.ts) > +new Date(t.start)))
      h.push({ id: `nach-${t.id}-${t.start}`, text: `Wie war's bei **${fullName(k)}**? Erzähl kurz, ich lege es in der Akte ab.`, knoepfe: [
        { key: 'nach-termin', label: 'Erzählen', text: `Termin bei ${fullName(k)} (${nrS(k)}): `, diktat: true }] });
  }
  // Morgens: Route optimierbar oder zu knapp?
  const ersterHeute = heute.find(t => +new Date(t.start) > +now);
  if (heute.length >= 2 && ersterHeute && +new Date(ersterHeute.start) === +new Date(heute[0].start)) {
    const b = besteReihenfolge(S, now), r = tagesroute(S, now), knapp = r.stationen.filter(s => s.konflikt).length;
    if ((b && b.ersparnis_min > 0) || knapp) h.push({ id: `route-${now.toDateString()}`, text: `Heute ${heute.length} Termine.${knapp ? ` ${knapp}× wird es knapp mit der Fahrzeit.` : ''}${b && b.ersparnis_min > 0 ? ` Eine andere Reihenfolge spart ca. ${b.ersparnis_min} Min. Fahrt.` : ''}`, knoepfe: [
      { key: 'route-tag', label: 'Route zeigen', text: 'Wie fahre ich heute?' }] });
  }
  // Morgen zu knapp? (ab Nachmittag)
  if (now.getHours() >= 14) {
    const m = new Date(+now + 864e5), r = tagesroute(S, m), knapp = r.stationen.filter(s => s.konflikt);
    if (knapp.length) h.push({ id: `knapp-${m.toDateString()}`, text: `Morgen wird es knapp: ${knapp[0].konflikt}`, knoepfe: [{ key: 'route-morgen', label: 'Route morgen prüfen', text: 'Wie fahre ich morgen?' }] });
  }
  // Fällige Zusagen und Aufgaben
  const faellig = S.aufgaben.filter(a => !a.erledigt && a.faellig && (+new Date(a.faellig) < +now || sameDay(a.faellig, now)));
  if (faellig.length) h.push({ id: `aufg-${now.toDateString()}-${faellig.length}`, text: `${faellig.length === 1 ? 'Fällig' : faellig.length + ' Aufgaben fällig'}: ${faellig[0].text}${faellig[0].faellig ? ` (${relDay(faellig[0].faellig, now)})` : ''}.`, knoepfe: [
    { key: 'aufgaben', label: faellig.length === 1 ? 'Erledigen' : 'Alle zeigen', text: faellig.length === 1 ? `Hilf mir bei: ${faellig[0].text}` : 'Was ist heute fällig?' }] });
  return [...h.filter(x => x.id.startsWith('vor-')), ...h.filter(x => !x.id.startsWith('vor-'))];
}

// Lernen: Knöpfe, die oft gezeigt, aber nie genutzt werden, fallen weg.
export type Statistik = Record<string, { gezeigt: number; genutzt: number }>;
export const nuetzlich = (st: Statistik, k: Knopf) => { const s = st[k.key]; return !s || s.genutzt > 0 || s.gezeigt < 6; };
export function auswaehlen(st: Statistik, knoepfe: Knopf[], max = 2): Knopf[] {
  const seen = new Set<string>(); const r: Knopf[] = [];
  for (const k of knoepfe) { if (seen.has(k.text) || !nuetzlich(st, k)) continue; seen.add(k.text); r.push(k); if (r.length >= max) break; }
  return r;
}
