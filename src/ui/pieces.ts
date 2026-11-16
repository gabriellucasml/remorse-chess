import type { Color, PieceType } from '../engine';

function svg(color: Color, body: string): string {
  const fill = color === 'w' ? '#f7f2e8' : '#241c16';
  const ink = color === 'w' ? '#2b221a' : '#f4eadc';
  return `<svg class="piece-svg ${color}" viewBox="0 0 80 80" aria-hidden="true">
    <g fill="${fill}" stroke="${ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke fill">
      ${body}
      <ellipse cx="40" cy="67" rx="20" ry="5"/>
    </g>
  </svg>`;
}

const BODIES: Record<PieceType, string> = {
  p: `<circle cx="40" cy="22" r="9"/>
      <path d="M30 60h20l-3.5-18c-1.5-8-11.5-8-13 0z"/>`,
  r: `<path d="M18 24h9V12h8v12h10V12h8v12h9v36H18z"/>
      <path d="M32 38h16v22H32z" fill="none"/>`,
  n: `<path d="M26 62 24 48 18 42 22 32 16 24 22 14 18 6 30 14 42 12 54 18 64 26 56 34 48 38 54 48 48 62Z"/>
      <circle class="eye" cx="46" cy="20" r="2.2"/>`,
  b: `<circle cx="40" cy="11" r="4.5"/>
      <path d="M33 16c-2 8-6 12-8 18h8l-8 26h30L47 34h8c-2-6-6-10-8-18-2 2-4 3-7 3s-5-1-7-3z"/>
      <path d="M40 20v12" fill="none"/>`,
  q: `<circle cx="24" cy="16" r="5"/>
      <circle cx="40" cy="10" r="5"/>
      <circle cx="56" cy="16" r="5"/>
      <path d="M24 16 18 34h44L56 16 48 28 40 10 32 28z"/>
      <path d="M20 36h40l-4 24H24z"/>`,
  k: `<path d="M36 2h8v7h7v8h-7v7h-8v-7h-7V9h7z"/>
      <path d="M22 32h36l-2 8H24z"/>
      <path d="M26 42h28l-4 18H30z"/>`,
};

export function pieceMarkup(type: PieceType, color: Color): string {
  return svg(color, BODIES[type]);
}
