import Anthropic from '@anthropic-ai/sdk';
import { TOOLS } from '@/lib/tools';
import { SYSTEM_FEST } from '@/lib/prompt';

export const runtime = 'nodejs';
export const maxDuration = 60;

const client = new Anthropic(); // liest ANTHROPIC_API_KEY – Schlüssel bleibt auf dem Server
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY fehlt in Vercel.' }, { status: 500 });
  const raw = await req.text();
  if (raw.length > 3_000_000) return Response.json({ error: 'Verlauf zu lang – bitte „Neu starten“.' }, { status: 413 });
  let body: { messages?: unknown; kontext?: unknown };
  try { body = JSON.parse(raw); } catch { return Response.json({ error: 'Ungültige Anfrage' }, { status: 400 }); }
  if (!Array.isArray(body.messages) || typeof body.kontext !== 'string') return Response.json({ error: 'Ungültige Anfrage' }, { status: 400 });

  const eigene = TOOLS.map((t, i) => (i === TOOLS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' as const } } : t));
  // Websuche läuft bei Anthropic (Server-Werkzeug), nicht im Gerät. Abschaltbar mit PAI_WEBSUCHE=aus.
  const websuche = process.env.PAI_WEBSUCHE === 'aus' ? [] : [{
    type: 'web_search_20250305', name: 'web_search', max_uses: 3,
    user_location: { type: 'approximate', city: 'Berlin', region: 'Berlin', country: 'DE', timezone: 'Europe/Berlin' },
  }];
  const tools = [...websuche, ...eigene];
  try {
    const r = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: [
        { type: 'text', text: SYSTEM_FEST, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: body.kontext.slice(0, 20000) },
      ],
      tools: tools as any,
      messages: body.messages as any,
    });
    return Response.json({ content: r.content, stop_reason: r.stop_reason, usage: r.usage });
  } catch (e: any) {
    const status = e?.status || 500;
    if (status === 400 && /web search/i.test(e?.message || '')) return Response.json({ error: 'Websuche ist in der Anthropic Console deaktiviert (Settings → Capabilities).' }, { status });
    const msg = status === 401 ? 'API-Schlüssel ungültig.' : status === 429 ? 'Zu viele Anfragen oder Guthaben/Limit erreicht.' : status === 529 ? 'KI gerade überlastet – gleich nochmal.' : (e?.message || 'Fehler bei der KI');
    return Response.json({ error: msg }, { status });
  }
}
