// PAI-Zeichen (Entwurf 29): großes P, im Kreis steht AI. Alles als Formen, keine Schrift nötig.
type P = { fg?: string; ai?: string };
export function LogoForm({ fg = '#000000', ai }: P) {
  const a = ai || fg;
  return (
    <g transform="translate(-4 0)">
      <g fill={fg}>
        <rect x="52" y="36" width="34" height="148" />
        <rect x="52" y="36" width="68" height="22" />
        <rect x="52" y="126" width="68" height="22" />
        <path fillRule="evenodd" d="M64 92A56 56 0 1 0 176 92A56 56 0 1 0 64 92Z M86 92A34 34 0 1 0 154 92A34 34 0 1 0 86 92Z" />
      </g>
      <g fill={a}>
        <path transform="translate(99 77) scale(0.32 0.3)" fillRule="evenodd" d="M0 100L33 0H61L94 100H71L63.7 78H30.3L23 100Z M36.2 60L47 27.3L57.8 60Z" />
        <rect x="133.5" y="77" width="7.5" height="30" />
      </g>
    </g>
  );
}
// Nur das Zeichen, ohne Fläche (für Kopfzeile, Login)
export function Logo({ height = 32, fg = '#000000', ai, title = 'PAI' }: P & { height?: number; title?: string }) {
  return (
    <svg viewBox="44 32 132 156" height={height} width={(height * 132) / 156} role="img" aria-label={title}>
      <LogoForm fg={fg} ai={ai} />
    </svg>
  );
}
