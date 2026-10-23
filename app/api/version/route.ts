export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ v: (process.env.VERCEL_GIT_COMMIT_SHA || 'lokal').slice(0, 7) }, { headers: { 'Cache-Control': 'no-store' } });
}
