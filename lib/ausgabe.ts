// Ausgaben fürs Gerät: Kontaktkarte (vCard), Kalendereintrag (.ics).
import { Kontakt, Termin, fullName, nrS } from './state';

const vEsc = (x: unknown) => String(x ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
export const telIntl = (t: string) => { const d = String(t || '').replace(/[^\d+]/g, ''); return d.startsWith('+') ? d : d.startsWith('00') ? '+' + d.slice(2) : d.startsWith('0') ? '+49' + d.slice(1) : d; };

export function vcard(k: Kontakt): string {
  const note = [`PAI ${nrS(k)}`, k.quelle ? `Quelle: ${k.quelle}` : '', k.persoenliches.length ? 'Persönlich: ' + k.persoenliches.slice(0, 3).join('; ') : ''].filter(Boolean).join('\n');
  return ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEsc(k.nachname)};${vEsc(k.vorname)};;${vEsc(k.anrede)};`, `FN:${vEsc(fullName(k))}`,
    k.firma ? `ORG:${vEsc(k.firma)}` : '',
    k.strasse || k.ort ? `ADR;TYPE=WORK:;;${vEsc(k.strasse)};${vEsc(k.ort)};;${vEsc(k.plz)};Deutschland` : '',
    k.tel ? `TEL;TYPE=CELL:${telIntl(k.tel)}` : '', k.email ? `EMAIL;TYPE=INTERNET:${k.email}` : '',
    `NOTE:${vEsc(note)}`, 'END:VCARD'].filter(Boolean).join('\r\n');
}

const icsZeit = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEsc = (x: string) => String(x).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
export function ics(t: Termin, k?: Kontakt | null, beschreibung = ''): string {
  const a = new Date(t.start), e = new Date(+a + t.dauer * 60000);
  const besch = [k?.tel ? `Tel: ${k.tel}` : '', t.notiz || '', beschreibung].filter(Boolean).join('\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PAI//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:pai-${t.id}-${+a}@pai`, `DTSTAMP:${icsZeit(new Date())}`, `DTSTART:${icsZeit(a)}`, `DTEND:${icsZeit(e)}`,
    `SUMMARY:${icsEsc(t.titel)}`, t.ort ? `LOCATION:${icsEsc(t.ort)}` : '', besch ? `DESCRIPTION:${icsEsc(besch)}` : '',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(t.titel)}`, 'TRIGGER:-PT30M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}
