import { ImageResponse } from 'next/og';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';
export default function AppleIcon() {
  return new ImageResponse(
    <svg viewBox="0 0 220 220" width="180" height="180">
      <rect width="220" height="220" fill="#000000" />
      <g transform="translate(-4 0)">
        <g fill="#FFFFFF"><rect x="52" y="36" width="34" height="148" /><rect x="52" y="36" width="68" height="22" /><rect x="52" y="126" width="68" height="22" /><path fillRule="evenodd" d="M64 92A56 56 0 1 0 176 92A56 56 0 1 0 64 92Z M86 92A34 34 0 1 0 154 92A34 34 0 1 0 86 92Z" /></g>
        <g fill="#FFFFFF"><path transform="translate(99 77) scale(0.32 0.3)" fillRule="evenodd" d="M0 100L33 0H61L94 100H71L63.7 78H30.3L23 100Z M36.2 60L47 27.3L57.8 60Z" /><rect x="133.5" y="77" width="7.5" height="30" /></g>
      </g>
    </svg>,
    size,
  );
}
