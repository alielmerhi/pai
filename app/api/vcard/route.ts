// Liefert die Kontaktkarte als echte .vcf-Antwort. iOS öffnet daraufhin „Neuer Kontakt“.
// Formular-POST statt URL-Parameter: Kontaktdaten landen nicht in Adressen/Logs.
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const f = await req.formData();
  const vcf = String(f.get('vcf') || '');
  const name = String(f.get('name') || 'Kontakt').replace(/[^\wäöüÄÖÜß -]/g, '').trim() || 'Kontakt';
  if (!vcf.startsWith('BEGIN:VCARD') || vcf.length > 8000) return new Response('Ungültige Kontaktkarte', { status: 400 });
  return new Response(vcf, {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `inline; filename="${encodeURIComponent(name)}.vcf"; filename*=UTF-8''${encodeURIComponent(name)}.vcf`,
      'Cache-Control': 'no-store',
    },
  });
}
