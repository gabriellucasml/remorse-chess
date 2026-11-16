export const FILES = 'abcdefgh';

export function fileOf(sq: number): number {
  return sq & 7;
}

export function rankOf(sq: number): number {
  return sq >> 3;
}

export function makeSquare(file: number, rank: number): number {
  return rank * 8 + file;
}

export function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

export function squareName(sq: number): string {
  return FILES[fileOf(sq)] + String(rankOf(sq) + 1);
}

export function parseSquare(name: string): number {
  const file = FILES.indexOf(name[0] ?? '');
  const rank = Number(name[1]) - 1;
  if (file < 0 || !onBoard(file, rank) || name.length !== 2) {
    throw new Error(`Casa inválida: ${name}`);
  }
  return makeSquare(file, rank);
}

export const KNIGHT_DELTAS: readonly (readonly [number, number])[] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];

export const KING_DELTAS: readonly (readonly [number, number])[] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

export const BISHOP_DELTAS: readonly (readonly [number, number])[] = [
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export const ROOK_DELTAS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

export function neighborSquares(sq: number): number[] {
  const file = fileOf(sq);
  const rank = rankOf(sq);
  const out: number[] = [];
  for (const [df, dr] of KING_DELTAS) {
    const nf = file + df;
    const nr = rank + dr;
    if (onBoard(nf, nr)) out.push(makeSquare(nf, nr));
  }
  return out;
}

export function moveKey(from: number, to: number, absolve: readonly number[]): string {
  return `${from}-${to}-${[...absolve].sort((a, b) => a - b).join('.')}`;
}
