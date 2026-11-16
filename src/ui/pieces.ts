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
  p: `<circle cx="40" cy="21" r="8.5"/>
      <rect x="29" y="30" width="22" height="4" rx="2"/>
      <path d="M32 34c-1 9-5 15-8 21h32c-3-6-7-12-8-21H32z"/>
      <rect x="21" y="55" width="38" height="7" rx="3.5"/>`,

  r: `<path d="M22 14h6v5h7v-5h10v5h7v-5h6v11l-4 4v26l4 4v3H22v-3l4-4V29l-4-4V14z"/>
      <line x1="26" y1="29" x2="54" y2="29" fill="none"/>
      <line x1="26" y1="55" x2="54" y2="55" fill="none"/>`,

  n: `<path d="M23 62v-4l4-4c0-7 2-12 6-16-4 0-8 2-12 2-3 0-5-2-5-5 0-4 4-8 8-12 2-2 3-5 3-8l4 3c3-2 7-3 11-2 7 2 13 8 14 17 1 8-2 15-6 21l4 4v4H23z"/>
      <circle class="eye" cx="35" cy="22" r="2.2"/>
      <path d="M25 54h30" fill="none"/>`,

  b: `<circle cx="40" cy="11" r="4"/>
      <path d="M40 16c-9 5-13 13-11 22 1 4 3 7 4 10h14c1-3 3-6 4-10 2-9-2-17-11-22z"/>
      <path d="M36 27h8M40 23v9" fill="none"/>
      <rect x="28" y="48" width="24" height="4" rx="2"/>
      <path d="M23 55h34l3 7H20l3-7z"/>`,

  q: `<circle cx="19" cy="18" r="3.5"/>
      <circle cx="29" cy="13" r="3.5"/>
      <circle cx="40" cy="11" r="3.5"/>
      <circle cx="51" cy="13" r="3.5"/>
      <circle cx="61" cy="18" r="3.5"/>
      <path d="M20 22l6 26h28l6-26-10 13-10-19-10 19-10-13z"/>
      <rect x="25" y="48" width="30" height="4" rx="2"/>
      <path d="M22 55h36l2 7H20l2-7z"/>`,

  k: `<path d="M38 6h4v5h5v4h-5v5h-4v-5h-5v-4h5V6z"/>
      <path d="M26 23c4-3 10-3 14 0 4-3 10-3 14 0l-4 25H30l-4-25z"/>
      <path d="M40 23v25" fill="none"/>
      <rect x="25" y="48" width="30" height="4" rx="2"/>
      <path d="M22 55h36l2 7H20l2-7z"/>`,
};

export function pieceMarkup(type: PieceType, color: Color): string {
  return svg(color, BODIES[type]);
}
