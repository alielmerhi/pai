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
