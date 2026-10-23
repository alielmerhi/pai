// Liefert den Termin als .ics – iOS öffnet daraufhin „Zum Kalender hinzufügen“.
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const f = await req.formData();
  const ics = String(f.get('ics') || '');
  const name = String(f.get('name') || 'Termin').replace(/[^\wäöüÄÖÜß -]/g, '').trim() || 'Termin';
  if (!ics.startsWith('BEGIN:VCALENDAR') || ics.length > 10000) return new Response('Ungültiger Kalendereintrag', { status: 400 });
  return new Response(ics, { headers: {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `inline; filename="${encodeURIComponent(name)}.ics"; filename*=UTF-8''${encodeURIComponent(name)}.ics`,
    'Cache-Control': 'no-store',
  } });
}
