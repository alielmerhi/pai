import { ImageResponse } from 'next/og';
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';
export default function Icon() {
  return new ImageResponse(<div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#13201A', color: '#F1F4F2', fontSize: 220, fontWeight: 900, letterSpacing: -8 }}>PA<span style={{ color: '#8199FF' }}>I</span></div>, size);
}
