// Richtung ab Berlin nach PLZ. 8 Himmelsrichtungen; "gleiche Richtung" = gleiche oder benachbarte Richtung.
// Version für Dienstag. Später ersetzen durch Geokodierung + Winkel ab Heimatort.
export const RICHTUNGEN = ['Nord', 'Nordost', 'Ost', 'Südost', 'Süd', 'Südwest', 'West', 'Nordwest'] as const;
export type Richtung = typeof RICHTUNGEN[number] | 'Berlin' | 'Unbekannt';

// Reihenfolge wichtig: längster Präfix zuerst.
const TABELLE: [string, Richtung][] = [
  // Berlin (inkl. 140xx/141xx: Charlottenburg, Kladow, Wannsee, Zehlendorf, Dahlem)
  ['10', 'Berlin'], ['12', 'Berlin'], ['13', 'Berlin'], ['140', 'Berlin'], ['141', 'Berlin'],
  // 14: Potsdam/Teltow/Werder Südwest, Falkensee/Nauen/Rathenow/Brandenburg a.d.H. West, Luckenwalde/Jüterbog Süd
  ['146', 'West'], ['147', 'West'], ['148', 'Südwest'], ['149', 'Süd'], ['14', 'Südwest'],
  // 15: Strausberg/Frankfurt (Oder)/Fürstenwalde/Erkner Ost, Königs Wusterhausen Südost, Zossen/Mahlow Süd, Lübben Südost
  ['150', 'Ost'], ['151', 'Ost'], ['152', 'Ost'], ['153', 'Ost'], ['154', 'Ost'], ['155', 'Ost'],
  ['157', 'Südost'], ['158', 'Süd'], ['159', 'Südost'], ['15', 'Ost'],
  // 16: Eberswalde/Bernau/Schwedt Nordost, Oranienburg/Gransee Nord, Hennigsdorf/Neuruppin/Wittstock Nordwest
  ['161', 'Nordost'], ['162', 'Nordost'], ['163', 'Nordost'],
  ['165', 'Nord'], ['1677', 'Nord'], ['1679', 'Nord'], ['167', 'Nordwest'], ['168', 'Nordwest'], ['169', 'Nordwest'], ['16', 'Nord'],
  ['17', 'Nordost'], // Uckermark, Vorpommern
  ['19', 'Nordwest'], // Prignitz (Perleberg, Wittenberge), Westmecklenburg
  ['01', 'Süd'], ['02', 'Südost'], ['03', 'Südost'], ['04', 'Süd'], // Lausitz, Cottbus, Elbe-Elster
  ['06', 'Südwest'], ['39', 'West'],
];

export function richtung(plz: string | null | undefined): Richtung {
  const p = String(plz || '').replace(/\D/g, '');
  if (p.length !== 5) return 'Unbekannt';
  for (const [pre, r] of TABELLE) if (p.startsWith(pre)) return r;
  return 'Unbekannt';
}

// Darf ein Termin in Richtung b am selben Tag wie einer in Richtung a liegen?
export function vertraeglich(a: Richtung, b: Richtung, streng = false): boolean {
  if (a === 'Unbekannt' || b === 'Unbekannt') return false;
  if (a === 'Berlin' || b === 'Berlin') return true; // Berlin liegt auf jedem Weg
  if (a === b) return true;
  if (streng) return false;
  const i = RICHTUNGEN.indexOf(a as any), j = RICHTUNGEN.indexOf(b as any);
  const d = Math.abs(i - j);
  return d === 1 || d === RICHTUNGEN.length - 1;
}

// ---------- Mit Koordinaten (PLZ-Mittelpunkt, kein Straßenname) ----------
export type Geo = { lat: number; lon: number };
export const BERLIN_MITTE: Geo = { lat: 52.5200, lon: 13.4050 };
export function km(a: Geo, b: Geo) {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Grobe Fahrzeit: Luftlinie × 1,35 Straßenfaktor bei Ø 65 km/h + 5 Min. Parken/Ankommen
export const fahrMin = (a: Geo, b: Geo) => Math.round(km(a, b) * 1.35 / 65 * 60 + 5);
export function richtungAusGeo(g: Geo): Richtung {
  if (km(BERLIN_MITTE, g) < 15) return 'Berlin';
  const r = Math.PI / 180, y = Math.sin((g.lon - BERLIN_MITTE.lon) * r) * Math.cos(g.lat * r);
  const x = Math.cos(BERLIN_MITTE.lat * r) * Math.sin(g.lat * r) - Math.sin(BERLIN_MITTE.lat * r) * Math.cos(g.lat * r) * Math.cos((g.lon - BERLIN_MITTE.lon) * r);
  const grad = (Math.atan2(y, x) / r + 360) % 360;
  return RICHTUNGEN[Math.round(grad / 45) % 8];
}
// Bevorzugt Koordinaten, sonst PLZ-Tabelle
export const richtungVon = (x: { plz: string; geo?: Geo | null }) => (x.geo ? richtungAusGeo(x.geo) : richtung(x.plz));
// Am selben Tag möglich? Gleiche/benachbarte Richtung oder nah beieinander (≤ 30 Min.)
export function tagVertraeglich(a: { plz: string; geo?: Geo | null }, b: { plz: string; geo?: Geo | null }, streng = false) {
  if (a.geo && b.geo && fahrMin(a.geo, b.geo) <= 30) return true;
  return vertraeglich(richtungVon(a), richtungVon(b), streng);
}
