// PLZ → Mittelpunkt-Koordinaten (OpenStreetMap/Nominatim). Es wird nur die PLZ übertragen, keine Kundendaten.
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const plz = new URL(req.url).searchParams.get('plz') || '';
  if (!/^\d{5}$/.test(plz)) return Response.json({ error: 'PLZ ungültig' }, { status: 400 });
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${plz}&country=de&format=json&limit=1`, {
      headers: { 'User-Agent': 'PAI-Assistent/0.1 (Testbetrieb)', 'Accept-Language': 'de' },
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    const d = await r.json();
    if (!Array.isArray(d) || !d[0]) return Response.json({ geo: null }, { headers: { 'Cache-Control': 'public, max-age=86400' } });
    return Response.json({ geo: { lat: +(+d[0].lat).toFixed(4), lon: +(+d[0].lon).toFixed(4) } }, { headers: { 'Cache-Control': 'public, max-age=2592000' } });
  } catch {
    return Response.json({ geo: null, error: 'Geodienst nicht erreichbar' }, { status: 502 });
  }
}
