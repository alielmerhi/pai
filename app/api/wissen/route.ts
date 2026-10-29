import Anthropic from '@anthropic-ai/sdk';

// PAI liest sich vor dem ersten Chat in die Branche des Nutzers ein (Websuche).
// Übertragen werden nur Beruf, Branche und Arbeitsweise – keine Kundendaten.
export const runtime = 'nodejs';
export const maxDuration = 120;

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const AUFTRAG = `Du bist PAI, ein persönlicher Assistent für Menschen, die mit Kunden arbeiten. Bevor du mit deinem neuen Nutzer startest, bildest du dich zu seinem Beruf und seiner Branche – so, wie sich eine gute neue Assistenz vor dem ersten Arbeitstag einliest.

Recherchiere mit der Websuche (Deutschland, aktueller Stand) und schreibe danach ein kompaktes Briefing für dich selbst, auf Deutsch, höchstens 350 Wörter, genau mit diesen Abschnitten als "### "-Überschriften:
### So läuft ein Kundenkontakt typisch ab
### Was Kunden typischerweise fragen und wovor sie zögern
### Was ich mir nach jedem Gespräch merken sollte
### Wichtige Begriffe
### Aktuelles in der Branche
Unter jeder Überschrift 2–5 kurze Punkte mit "- ". Konkret und praxisnah, keine Floskeln. Zahlen, Fristen und Programme nur, wenn eine Quelle sie belegt – mit Stand (Monat/Jahr). Was du nicht sicher weißt, lässt du weg. Keine Einleitung, kein Schluss.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY fehlt in Vercel.' }, { status: 500 });
  let b: any; try { b = await req.json(); } catch { return Response.json({ error: 'Ungültige Anfrage' }, { status: 400 }); }
  const s = (x: unknown, n = 200) => String(x ?? '').slice(0, n);
  const liste = (x: unknown) => (Array.isArray(x) ? x : []).slice(0, 12).map(v => '- ' + s(v, 160)).join('\n');
  const nutzer = `Beruf: ${s(b.beruf)}\nBranche: ${s(b.branche)}\nArbeitet von: ${s(b.ort, 80) || 'Deutschland'}\nSein typischer Ablauf:\n${liste(b.arbeitsweise) || '- (nicht angegeben)'}\nWas ihn am meisten Zeit kostet:\n${liste(b.nervt) || '- (nicht angegeben)'}`;
  if (!s(b.beruf).trim() && !s(b.branche).trim()) return Response.json({ error: 'Beruf oder Branche fehlt' }, { status: 400 });

  const tools: any[] = process.env.PAI_WEBSUCHE === 'aus' ? [] : [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5, user_location: { type: 'approximate', country: 'DE', timezone: 'Europe/Berlin' } }];
  let messages: any[] = [{ role: 'user', content: `${nutzer}\n\nBilde dich jetzt zu diesem Beruf und dieser Branche und schreib dein Briefing.` }];
  try {
    let r: any;
    for (let i = 0; i < 4; i++) {
      r = await client.messages.create({ model: MODEL, max_tokens: 2500, system: AUFTRAG, tools, messages });
      if (r.stop_reason !== 'pause_turn') break;
      messages = [...messages, { role: 'assistant', content: r.content }];
    }
    const blocks = r.content as any[];
    // Nur der Text nach der letzten Suche ist das Briefing
    const letzteSuche = blocks.map(x => x.type).lastIndexOf('web_search_tool_result');
    const text = blocks.slice(letzteSuche + 1).filter(x => x.type === 'text').map(x => x.text).join('').trim();
    const quellen: { url: string; titel: string }[] = [];
    for (const x of blocks) if (x.type === 'text' && Array.isArray(x.citations)) for (const c of x.citations) if (c.url && !quellen.some(q => q.url === c.url)) quellen.push({ url: c.url, titel: c.title || c.url });
    const suchen = blocks.filter(x => x.type === 'server_tool_use').map(x => x.input?.query).filter(Boolean);
    if (!text) return Response.json({ error: 'Kein Briefing erhalten' }, { status: 502 });
    return Response.json({ text, quellen: quellen.slice(0, 8), suchen });
  } catch (e: any) {
    const status = e?.status || 500;
    return Response.json({ error: status === 429 ? 'Zu viele Anfragen – gleich nochmal.' : status === 529 ? 'KI gerade überlastet – gleich nochmal.' : 'Einlesen hat nicht geklappt.' }, { status });
  }
}
