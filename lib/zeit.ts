// Alle Zeitangaben basieren auf der Systemzeit des Geräts (nie auf gespeicherten Werten).
export const pad = (n: number) => String(n).padStart(2, '0');
export const TAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const TAG_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export const D = (x: string | number | Date) => new Date(x);
export const at = (b: Date | string, h: number, m: number) => { const d = new Date(b); d.setHours(h, m, 0, 0); return d; };
export const sod = (b: Date | string) => at(b, 0, 0);
export const eod = (b: Date | string) => { const d = new Date(b); d.setHours(23, 59, 59, 999); return d; };
export const sameDay = (a: Date | string | number, b: Date | string | number) => D(a).toDateString() === D(b).toDateString();
export const sameMonth = (a: Date | string | number, b: Date | string | number) => { const x = D(a), y = D(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth(); };
export const roundUp = (d: Date, min: number) => { const ms = min * 60000; return new Date(Math.ceil(d.getTime() / ms) * ms); };
export const hm = (s: string): [number, number] => { const m = String(s).match(/^(\d{1,2}):?(\d{2})?/); return m ? [+m[1], +(m[2] || 0)] : [0, 0]; };
export const minOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

export const fd = (d: Date | string | number) => { const x = D(d); return `${TAG[x.getDay()]} ${pad(x.getDate())}.${pad(x.getMonth() + 1)}.`; };
export const ft = (d: Date | string | number) => { const x = D(d); return `${pad(x.getHours())}:${pad(x.getMinutes())}`; };
export const fdl = (d: Date | string | number) => { const x = D(d); return `${TAG_LANG[x.getDay()]}, ${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}`; };
export const fds = (d: Date | string | number) => { const x = D(d); return `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.`; };
export const localIso = (d: Date | string | number) => { const x = D(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`; };
export const eur = (n: number) => Math.round(n).toLocaleString('de-DE') + ' €';

export function relDay(d: Date | string | number, now = new Date()) {
  if (sameDay(d, now)) return 'heute';
  if (sameDay(d, new Date(+now + 864e5))) return 'morgen';
  return fd(d);
}

// ---------- Feiertage Berlin + Brandenburg (Vereinigung: Kunden sitzen in beiden Ländern) ----------
function ostersonntag(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}
const plusTage = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function feiertag(d: Date): string | null {
  const y = d.getFullYear(), o = ostersonntag(y);
  const fix: [number, number, string][] = [
    [1, 1, 'Neujahr'], [3, 8, 'Frauentag (Berlin)'], [5, 1, 'Tag der Arbeit'], [10, 3, 'Tag der Deutschen Einheit'],
    [10, 31, 'Reformationstag (Brandenburg)'], [12, 25, '1. Weihnachtstag'], [12, 26, '2. Weihnachtstag'],
  ];
  for (const [mo, da, n] of fix) if (d.getMonth() + 1 === mo && d.getDate() === da) return n;
  const bew: [number, string][] = [[-2, 'Karfreitag'], [0, 'Ostersonntag'], [1, 'Ostermontag'], [39, 'Christi Himmelfahrt'], [49, 'Pfingstsonntag'], [50, 'Pfingstmontag']];
  for (const [off, n] of bew) if (sameDay(plusTage(o, off), d)) return n;
  return null;
}
export const isWerktag = (d: Date) => { const w = d.getDay(); return w > 0 && w < 6 && !feiertag(d); };
export function addWerktage(b: Date, n: number) { const d = sod(b); let c = 0; while (c < n) { d.setDate(d.getDate() + 1); if (isWerktag(d)) c++; } return d; }

// Tagesangaben aus dem Chat ("morgen", "Dienstag", "27.10.") – immer relativ zu jetzt
export function parseTag(x: unknown, now = new Date()): Date {
  if (!x) return now;
  const s = String(x).trim().toLowerCase();
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const m2 = s.match(/(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?/);
  if (m2) { const y = m2[3] ? (m2[3].length === 2 ? 2000 + +m2[3] : +m2[3]) : now.getFullYear(); return new Date(y, +m2[2] - 1, +m2[1]); }
  if (/heute/.test(s)) return now;
  if (/übermorgen|uebermorgen/.test(s)) return new Date(+now + 2 * 864e5);
  if (/morgen/.test(s)) return new Date(+now + 864e5);
  const wi = TAG_LANG.map(t => t.toLowerCase()).findIndex(n => s.includes(n));
  if (wi >= 0) { const d = sod(now); do { d.setDate(d.getDate() + 1); } while (d.getDay() !== wi); return d; }
  const d = new Date(String(x)); return isNaN(+d) ? now : d;
}
export function parseStart(x: unknown, now = new Date()): Date {
  const s = String(x || '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5]); // immer als lokale Zeit lesen
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?\D+(\d{1,2})[:.](\d{2})/);
  if (m) { const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear(); return new Date(y, +m[2] - 1, +m[1], +m[4], +m[5]); }
  return new Date(NaN);
}
