'use client';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

// Branchenwissen Punkt für Punkt bearbeiten: ändern, löschen, ergänzen.
type Abschnitt = { titel: string; punkte: string[] };
export function zerlegen(text: string): Abschnitt[] {
  const r: Abschnitt[] = [];
  for (const z of text.split('\n')) {
    const t = z.trim(); if (!t) continue;
    const h = t.match(/^#{1,4}\s+(.*)$/);
    if (h) { r.push({ titel: h[1].trim(), punkte: [] }); continue; }
    if (!r.length) r.push({ titel: 'Allgemein', punkte: [] });
    r[r.length - 1].punkte.push(t.replace(/^[-*•]\s+/, ''));
  }
  return r;
}
export const zusammensetzen = (a: Abschnitt[]) => a.filter(x => x.punkte.some(p => p.trim())).map(x => `### ${x.titel}\n${x.punkte.filter(p => p.trim()).map(p => '- ' + p.trim()).join('\n')}`).join('\n\n');

export function WissenEditor({ text, speichern }: { text: string; speichern: (t: string) => void }) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [ab, setAb] = useState<Abschnitt[]>(() => zerlegen(text));
  const aendern = (i: number, j: number, v: string) => setAb(a => a.map((x, k) => (k === i ? { ...x, punkte: x.punkte.map((p, l) => (l === j ? v : p)) } : x)));
  const loeschen = (i: number, j: number) => setAb(a => a.map((x, k) => (k === i ? { ...x, punkte: x.punkte.filter((_, l) => l !== j) } : x)));
  const neu = (i: number) => setAb(a => a.map((x, k) => (k === i ? { ...x, punkte: [...x.punkte, ''] } : x)));

  if (!bearbeiten) return (
    <div className="wissen-box">
      <div className="wissen md"><ReactMarkdown components={{ a: ({ node, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}>{text}</ReactMarkdown></div>
      <button type="button" className="btn" onClick={() => { setAb(zerlegen(text)); setBearbeiten(true); }}>Bearbeiten</button>
    </div>
  );
  return (
    <div className="wissen-box">
      <div className="wissen edit">
        {ab.map((x, i) => (
          <div key={i} className="w-abschnitt">
            <div className="w-titel">{x.titel}</div>
            {x.punkte.map((p, j) => (
              <div key={j} className="w-punkt">
                <textarea rows={Math.max(1, Math.ceil(p.length / 38))} value={p} onChange={e => aendern(i, j, e.target.value)} aria-label={`${x.titel}, Punkt ${j + 1}`} />
                <button type="button" className="w-weg" onClick={() => loeschen(i, j)} aria-label="Punkt löschen" title="Punkt löschen">×</button>
              </div>
            ))}
            <button type="button" className="w-neu" onClick={() => neu(i)}>+ Punkt hinzufügen</button>
          </div>
        ))}
      </div>
      <div className="row">
        <button type="button" className="btn primary" onClick={() => { speichern(zusammensetzen(ab)); setBearbeiten(false); }}>Speichern</button>
        <button type="button" className="btn ghost" onClick={() => setBearbeiten(false)}>Abbrechen</button>
      </div>
    </div>
  );
}
