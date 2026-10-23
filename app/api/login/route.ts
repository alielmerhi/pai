import { cookies } from 'next/headers';
import { createHash } from 'crypto';

export const runtime = 'nodejs';
const token = (p: string) => createHash('sha256').update('pai:' + p).digest('hex');

export async function POST(req: Request) {
  const { code } = await req.json().catch(() => ({ code: '' }));
  const soll = process.env.PAI_PASSCODE;
  if (!soll) return Response.json({ error: 'PAI_PASSCODE fehlt in Vercel.' }, { status: 500 });
  await new Promise(r => setTimeout(r, 400)); // bremst Durchprobieren
  if (String(code) !== soll) return Response.json({ error: 'Falscher Code' }, { status: 401 });
  (await cookies()).set('pai', token(soll), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return Response.json({ ok: true });
}
