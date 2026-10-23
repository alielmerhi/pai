import { NextResponse, type NextRequest } from 'next/server';

// Passcode-Sperre: ohne gültiges Cookie nur Login-Seite, Manifest und Icons.
async function token(p: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pai:' + p));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function middleware(req: NextRequest) {
  const soll = process.env.PAI_PASSCODE;
  const ok = soll && req.cookies.get('pai')?.value === (await token(soll));
  if (ok) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', req.url));
}
export const config = { matcher: ['/((?!login|api/login|manifest.webmanifest|icon|apple-icon|favicon|_next).*)'] };
