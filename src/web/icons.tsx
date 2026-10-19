// Original SVG icons. No emoji (TV fonts vary), no third-party icon sets.
import React, { useMemo, useRef } from 'react';
import type { AnimalId, ShapeId } from '../core/games.ts';
import { AVATARS, type AvatarId } from '../core/avatars.ts';
import { useBigStrip, useFacePicture, useIntroStrip, useMoveStrip } from './snapshots.ts';
import { want3D } from './Milo3D.tsx';
import { Milo } from './Milo.tsx';
import { CharacterMachine } from '../core/character.ts';
import type { CharacterState } from '../core/types.ts';

const svg = (size: number, children: React.ReactNode, vb = '0 0 100 100') => (
  <svg width={size} height={size} viewBox={vb} aria-hidden="true">{children}</svg>
);

export const SHAPE_COLOR: Record<ShapeId, string> = {
  circle: '#4FA3D9', square: '#F2B33D', triangle: '#2BB3A3', star: '#F28C38', heart: '#E85D8A', diamond: '#8E6CC9',
};

export function ShapeIcon({ shape, size = 160, color }: { shape: ShapeId; size?: number; color?: string }) {
  const c = color ?? SHAPE_COLOR[shape];
  const stroke = { stroke: 'rgba(0,0,0,0.15)', strokeWidth: 3, strokeLinejoin: 'round' as const };
  const el = {
    circle: <circle cx="50" cy="50" r="40" fill={c} {...stroke} />,
    square: <rect x="12" y="12" width="76" height="76" rx="8" fill={c} {...stroke} />,
    triangle: <path d="M50 10 L 92 86 L 8 86 Z" fill={c} {...stroke} />,
    star: <path d="M50 6 L 62 37 L 95 38 L 69 58 L 78 91 L 50 72 L 22 91 L 31 58 L 5 38 L 38 37 Z" fill={c} {...stroke} />,
    heart: <path d="M50 88 C 18 66, 6 46, 10 30 C 14 14, 36 8, 50 26 C 64 8, 86 14, 90 30 C 94 46, 82 66, 50 88 Z" fill={c} {...stroke} />,
    diamond: <path d="M50 6 L 90 50 L 50 94 L 10 50 Z" fill={c} {...stroke} />,
  }[shape];
  return svg(size, el);
}

export function AnimalIcon({ animal, size = 170 }: { animal: AnimalId; size?: number }) {
  const eye = (x: number, y: number, r = 6) => <g><circle cx={x} cy={y} r={r} fill="#2A1B12" /><circle cx={x + r * 0.35} cy={y - r * 0.35} r={r * 0.35} fill="#fff" /></g>;
  const faces: Record<AnimalId, React.ReactNode> = {
    cow: <g>
      <ellipse cx="22" cy="34" rx="12" ry="7" fill="#E8D5C4" transform="rotate(-25 22 34)" /><ellipse cx="78" cy="34" rx="12" ry="7" fill="#E8D5C4" transform="rotate(25 78 34)" />
      <path d="M32 22 Q 28 10 34 8 M 68 22 Q 72 10 66 8" stroke="#D9C27A" strokeWidth="6" strokeLinecap="round" fill="none" />
      <ellipse cx="50" cy="50" rx="30" ry="32" fill="#fff" stroke="#3A2A20" strokeWidth="2" />
      <path d="M28 40 Q 36 28 46 36 Q 42 48 30 48 Z" fill="#3A2A20" />
      {eye(40, 46)}{eye(60, 46)}
      <ellipse cx="50" cy="68" rx="20" ry="13" fill="#F6B5C1" /><circle cx="43" cy="68" r="3" fill="#B0606E" /><circle cx="57" cy="68" r="3" fill="#B0606E" />
    </g>,
    duck: <g>
      <circle cx="50" cy="48" r="32" fill="#FFD64A" />
      <path d="M40 18 Q 46 8 52 18" stroke="#FFD64A" strokeWidth="6" fill="none" strokeLinecap="round" />
      {eye(39, 42)}{eye(61, 42)}
      <ellipse cx="50" cy="62" rx="20" ry="9" fill="#F28C38" /><path d="M32 62 Q 50 70 68 62" stroke="#C9631C" strokeWidth="2" fill="none" />
    </g>,
    cat: <g>
      <path d="M22 40 L 26 10 L 44 28 Z" fill="#9AA3B5" /><path d="M78 40 L 74 10 L 56 28 Z" fill="#9AA3B5" />
      <path d="M26 34 L 28 18 L 38 28 Z" fill="#F6B5C1" /><path d="M74 34 L 72 18 L 62 28 Z" fill="#F6B5C1" />
      <ellipse cx="50" cy="54" rx="32" ry="30" fill="#9AA3B5" />
      <ellipse cx="39" cy="50" rx="6" ry="8" fill="#6BC27A" /><ellipse cx="39" cy="50" rx="2" ry="7" fill="#2A1B12" />
      <ellipse cx="61" cy="50" rx="6" ry="8" fill="#6BC27A" /><ellipse cx="61" cy="50" rx="2" ry="7" fill="#2A1B12" />
      <path d="M46 62 L 54 62 L 50 67 Z" fill="#E85D8A" />
      <path d="M50 67 Q 44 73 40 70 M 50 67 Q 56 73 60 70" stroke="#3A2A20" strokeWidth="2" fill="none" />
      <path d="M14 60 L 32 63 M 14 68 L 32 66 M 86 60 L 68 63 M 86 68 L 68 66" stroke="#3A2A20" strokeWidth="1.6" />
    </g>,
    dog: <g>
      <ellipse cx="20" cy="46" rx="11" ry="22" fill="#8B5A3C" transform="rotate(15 20 46)" /><ellipse cx="80" cy="46" rx="11" ry="22" fill="#8B5A3C" transform="rotate(-15 80 46)" />
      <ellipse cx="50" cy="50" rx="30" ry="32" fill="#D9A06B" />
      <ellipse cx="60" cy="44" rx="10" ry="9" fill="#8B5A3C" />
      {eye(40, 44)}{eye(60, 44)}
      <ellipse cx="50" cy="66" rx="16" ry="12" fill="#F2D3B0" /><ellipse cx="50" cy="60" rx="7" ry="5" fill="#2A1B12" />
      <path d="M50 65 L 50 70 M 44 72 Q 50 76 56 72" stroke="#2A1B12" strokeWidth="2" fill="none" />
      <ellipse cx="50" cy="80" rx="6" ry="5" fill="#E85D8A" />
    </g>,
    owl: <g>
      <path d="M22 26 L 30 10 L 40 24 Z M 78 26 L 70 10 L 60 24 Z" fill="#7A5A44" />
      <ellipse cx="50" cy="54" rx="34" ry="36" fill="#9C7A5E" />
      <ellipse cx="50" cy="68" rx="20" ry="20" fill="#E8D5B8" />
      <circle cx="36" cy="44" r="14" fill="#fff" /><circle cx="64" cy="44" r="14" fill="#fff" />
      {eye(36, 44, 7)}{eye(64, 44, 7)}
      <path d="M45 54 L 55 54 L 50 64 Z" fill="#F2B33D" />
    </g>,
    frog: <g>
      <circle cx="32" cy="28" r="14" fill="#6BC27A" /><circle cx="68" cy="28" r="14" fill="#6BC27A" />
      <circle cx="32" cy="28" r="8" fill="#fff" /><circle cx="68" cy="28" r="8" fill="#fff" />
      {eye(32, 29, 5)}{eye(68, 29, 5)}
      <ellipse cx="50" cy="58" rx="38" ry="28" fill="#6BC27A" />
      <path d="M26 60 Q 50 80 74 60" stroke="#2F7A3B" strokeWidth="4" fill="none" strokeLinecap="round" />
      <ellipse cx="26" cy="54" rx="6" ry="4" fill="#FF8FA3" opacity="0.6" /><ellipse cx="74" cy="54" rx="6" ry="4" fill="#FF8FA3" opacity="0.6" />
    </g>,
    sheep: <g>
      <circle cx="26" cy="36" r="15" fill="#F4F1EA" /><circle cx="50" cy="26" r="17" fill="#F4F1EA" /><circle cx="74" cy="36" r="15" fill="#F4F1EA" />
      <circle cx="22" cy="58" r="14" fill="#F4F1EA" /><circle cx="78" cy="58" r="14" fill="#F4F1EA" />
      <ellipse cx="50" cy="58" rx="22" ry="26" fill="#3A2A20" />
      <ellipse cx="22" cy="52" rx="9" ry="6" fill="#3A2A20" transform="rotate(25 22 52)" /><ellipse cx="78" cy="52" rx="9" ry="6" fill="#3A2A20" transform="rotate(-25 78 52)" />
      {eye(41, 52, 5)}{eye(59, 52, 5)}
      <ellipse cx="50" cy="70" rx="7" ry="5" fill="#E8A5A5" /><path d="M46 74 Q 50 78 54 74" stroke="#F4F1EA" strokeWidth="2" fill="none" />
    </g>,
    goat: <g>
      <path d="M34 24 Q 30 6 40 4 M 66 24 Q 70 6 60 4" stroke="#C9B38A" strokeWidth="6" strokeLinecap="round" fill="none" />
      <ellipse cx="18" cy="42" rx="14" ry="7" fill="#E8DCC8" transform="rotate(-20 18 42)" /><ellipse cx="82" cy="42" rx="14" ry="7" fill="#E8DCC8" transform="rotate(20 82 42)" />
      <ellipse cx="50" cy="48" rx="26" ry="30" fill="#F2ECE0" />
      {eye(40, 42, 5)}{eye(60, 42, 5)}
      <ellipse cx="50" cy="64" rx="13" ry="10" fill="#E8C9B0" /><circle cx="45" cy="63" r="2" fill="#7A5A44" /><circle cx="55" cy="63" r="2" fill="#7A5A44" />
      <path d="M50 74 L 50 88 L 46 86 Z" fill="#F2ECE0" stroke="#C9B38A" strokeWidth="1.5" />
    </g>,
    horse: <g>
      <path d="M34 22 L 30 4 L 44 16 Z M 66 22 L 70 4 L 56 16 Z" fill="#A86B3C" />
      <path d="M44 14 Q 50 2 56 14 L 56 30 L 44 30 Z" fill="#5A3A22" />
      <ellipse cx="50" cy="46" rx="24" ry="30" fill="#B97A45" />
      <ellipse cx="50" cy="68" rx="19" ry="17" fill="#E8C9A0" />
      {eye(39, 40, 5)}{eye(61, 40, 5)}
      <circle cx="43" cy="68" r="2.5" fill="#5A3A22" /><circle cx="57" cy="68" r="2.5" fill="#5A3A22" />
      <path d="M44 78 Q 50 82 56 78" stroke="#5A3A22" strokeWidth="2" fill="none" />
    </g>,
    rooster: <g>
      <path d="M36 22 Q 32 6 42 12 Q 44 0 52 10 Q 60 2 62 14 Q 70 8 64 24 Z" fill="#E8483C" />
      <circle cx="50" cy="52" r="32" fill="#FFF4E0" />
      <path d="M44 62 L 56 62 L 50 76 Z" fill="#F2B33D" />
      <path d="M46 76 Q 50 90 54 76 Z" fill="#E8483C" />
      {eye(38, 46)}{eye(62, 46)}
      <ellipse cx="26" cy="56" rx="6" ry="4" fill="#FF8FA3" opacity="0.5" /><ellipse cx="74" cy="56" rx="6" ry="4" fill="#FF8FA3" opacity="0.5" />
    </g>,
    hen: <g>
      <path d="M42 22 Q 46 10 50 20 Q 54 10 58 22 Z" fill="#E8483C" />
      <circle cx="50" cy="52" r="32" fill="#F4D9A8" />
      <path d="M44 60 L 56 60 L 50 72 Z" fill="#F2A33D" />
      <path d="M47 72 Q 50 82 53 72 Z" fill="#E8483C" />
      {eye(39, 46)}{eye(61, 46)}
      <ellipse cx="27" cy="58" rx="6" ry="4" fill="#FF8FA3" opacity="0.5" /><ellipse cx="73" cy="58" rx="6" ry="4" fill="#FF8FA3" opacity="0.5" />
    </g>,
    lion: <g>
      <circle cx="50" cy="50" r="44" fill="#C9772B" />
      <circle cx="50" cy="52" r="29" fill="#F2B661" />
      <circle cx="28" cy="30" r="9" fill="#F2B661" /><circle cx="72" cy="30" r="9" fill="#F2B661" />
      {eye(40, 46)}{eye(60, 46)}
      <ellipse cx="50" cy="62" rx="14" ry="10" fill="#FBE3BA" /><path d="M44 58 L 56 58 L 50 64 Z" fill="#7A3A22" />
      <path d="M50 64 L 50 70 M 42 72 Q 50 78 58 72" stroke="#7A3A22" strokeWidth="2" fill="none" />
    </g>,
    elephant: <g>
      <ellipse cx="18" cy="46" rx="18" ry="24" fill="#A9B4C4" /><ellipse cx="82" cy="46" rx="18" ry="24" fill="#A9B4C4" />
      <ellipse cx="50" cy="46" rx="26" ry="30" fill="#BCC6D4" />
      {eye(40, 40, 5)}{eye(60, 40, 5)}
      <path d="M44 54 Q 44 82 54 88 Q 62 90 60 82 Q 56 78 56 54 Z" fill="#BCC6D4" stroke="#8F9BAE" strokeWidth="2" />
      <ellipse cx="30" cy="54" rx="5" ry="3" fill="#FF8FA3" opacity="0.5" /><ellipse cx="70" cy="54" rx="5" ry="3" fill="#FF8FA3" opacity="0.5" />
    </g>,
    pig: <g>
      <path d="M24 30 L 30 8 L 44 22 Z M 76 30 L 70 8 L 56 22 Z" fill="#F29CB0" />
      <ellipse cx="50" cy="52" rx="34" ry="32" fill="#F7B1C2" />
      {eye(38, 44)}{eye(62, 44)}
      <ellipse cx="50" cy="62" rx="15" ry="11" fill="#F08AA3" /><circle cx="45" cy="62" r="3" fill="#B04A68" /><circle cx="55" cy="62" r="3" fill="#B04A68" />
    </g>,
    monkey: <g>
      <circle cx="16" cy="48" r="12" fill="#8B5A3C" /><circle cx="84" cy="48" r="12" fill="#8B5A3C" />
      <circle cx="50" cy="48" r="32" fill="#8B5A3C" />
      <ellipse cx="50" cy="58" rx="22" ry="20" fill="#E8C9A0" />
      {eye(40, 46)}{eye(60, 46)}
      <circle cx="46" cy="58" r="2" fill="#5A3A22" /><circle cx="54" cy="58" r="2" fill="#5A3A22" />
      <path d="M42 68 Q 50 76 58 68" stroke="#5A3A22" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </g>,
  };
  return svg(size, faces[animal]);
}

/** Little stick-dragon pictograms for moves (Milo Says / Dance Maker). */
export type IconMove = 'jump' | 'wave' | 'clap' | 'spin' | 'wiggle' | 'robot';
export function MoveIcon({ move, size = 110 }: { move: IconMove; size?: number }) {
  const body = (extra: React.ReactNode, armL: string, armR: string, dy = 0) => (
    <g transform={`translate(0 ${dy})`}>
      <circle cx="50" cy="30" r="15" fill="#F28C38" />
      <ellipse cx="50" cy="62" rx="17" ry="20" fill="#F28C38" /><ellipse cx="50" cy="66" rx="10" ry="12" fill="#FFE9C7" />
      <path d={armL} stroke="#E9802E" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d={armR} stroke="#E9802E" strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="45" cy="28" r="2.5" fill="#2A1B12" /><circle cx="55" cy="28" r="2.5" fill="#2A1B12" />
      {extra}
    </g>
  );
  const motion = (d: string) => <path d={d} stroke="#2BB3A3" strokeWidth="4" strokeLinecap="round" fill="none" strokeDasharray="1 7" />;
  const m: Record<IconMove, React.ReactNode> = {
    jump: <>{body(null, 'M35 55 L 24 38', 'M65 55 L 76 38', -10)}{motion('M30 94 L 70 94')}<path d="M50 96 L 50 84" stroke="#2BB3A3" strokeWidth="4" strokeLinecap="round" /></>,
    wave: body(<path d="M82 14 Q 90 22 82 30" stroke="#2BB3A3" strokeWidth="4" fill="none" strokeLinecap="round" />, 'M35 58 L 28 72', 'M65 55 L 78 28'),
    clap: body(<><path d="M50 40 L 44 34 M 50 40 L 56 34 M 50 40 L 50 32" stroke="#F2B33D" strokeWidth="3" strokeLinecap="round" /></>, 'M35 55 L 48 46', 'M65 55 L 52 46'),
    spin: <>{body(null, 'M35 55 L 22 52', 'M65 55 L 78 52')}{motion('M18 84 A 34 12 0 1 0 84 84')}</>,
    wiggle: <g transform="rotate(-10 50 60)">{body(<path d="M20 90 Q 30 80 40 90 Q 50 100 60 90 Q 70 80 80 90" stroke="#2BB3A3" strokeWidth="4" fill="none" strokeLinecap="round" />, 'M35 55 L 22 40', 'M65 55 L 80 66')}</g>,
    robot: body(<rect x="40" y="12" width="20" height="5" rx="2" fill="#2BB3A3" />, 'M35 55 L 24 55 L 24 42', 'M65 55 L 76 55 L 76 68'),
  };
  return svg(size, m[move]);
}

export function TileIcon({ kind, size = 120 }: { kind: 'dance' | 'sing' | 'play' | 'talk' | 'help' | 'breathe' | 'maker' | 'alphabet' | 'avatar' | 'band'; size?: number }) {
  const w = '#fff';
  const icons: Record<string, React.ReactNode> = {
    dance: <g fill={w}><path d="M30 78 Q 22 60 38 52 L 52 46 L 60 20 L 70 22 L 64 54 L 46 62 Q 40 66 44 78 Z" /><circle cx="68" cy="12" r="8" /><path d="M14 30 Q 22 24 18 16 M 82 70 Q 90 64 86 56" stroke={w} strokeWidth="5" fill="none" strokeLinecap="round" /></g>,
    sing: <g fill={w}><path d="M38 20 L 78 12 L 78 64" stroke={w} strokeWidth="7" fill="none" strokeLinejoin="round" /><path d="M38 20 L 38 74" stroke={w} strokeWidth="7" /><ellipse cx="28" cy="76" rx="13" ry="10" /><ellipse cx="68" cy="66" rx="13" ry="10" /></g>,
    play: <g><rect x="10" y="30" width="80" height="44" rx="22" fill={w} /><path d="M28 44 L 28 60 M 20 52 L 36 52" stroke="#2BB3A3" strokeWidth="6" strokeLinecap="round" /><circle cx="66" cy="46" r="6" fill="#2BB3A3" /><circle cx="76" cy="58" r="6" fill="#2BB3A3" /></g>,
    talk: <g><path d="M12 22 Q 12 12 24 12 L 76 12 Q 88 12 88 22 L 88 58 Q 88 68 76 68 L 40 68 L 24 84 L 26 68 Q 12 68 12 58 Z" fill={w} /><circle cx="34" cy="40" r="6" fill="#E85D8A" /><circle cx="50" cy="40" r="6" fill="#E85D8A" /><circle cx="66" cy="40" r="6" fill="#E85D8A" /></g>,
    help: <g><circle cx="50" cy="50" r="40" fill={w} /><path d="M38 38 Q 38 24 50 24 Q 63 24 63 36 Q 63 46 52 50 L 52 60" stroke="#4FA3D9" strokeWidth="8" fill="none" strokeLinecap="round" /><circle cx="52" cy="74" r="6" fill="#4FA3D9" /></g>,
    breathe: <g fill="none" stroke={w} strokeWidth="6" strokeLinecap="round"><path d="M14 40 Q 40 30 60 40 Q 76 48 84 36" /><path d="M14 58 Q 44 48 66 58 Q 80 64 88 54" /><path d="M20 76 Q 40 70 56 76" /></g>,
    alphabet: <g><rect x="8" y="22" width="84" height="56" rx="12" fill={w} /><text x="50" y="62" textAnchor="middle" fontSize="38" fontWeight="900" fill="#4FA3D9" fontFamily="Arial, sans-serif">ABC</text></g>,
    band: <g><ellipse cx="50" cy="62" rx="34" ry="14" fill={w} /><rect x="16" y="40" width="68" height="22" fill={w} /><ellipse cx="50" cy="40" rx="34" ry="14" fill={w} stroke="#E5533D" strokeWidth="4" /><path d="M22 18 L 46 38 M 78 18 L 54 38" stroke={w} strokeWidth="7" strokeLinecap="round" /></g>,
    avatar: <g><circle cx="50" cy="38" r="22" fill={w} /><path d="M12 88 Q 14 58 50 58 Q 86 58 88 88 Z" fill={w} /></g>,
    maker: <g><rect x="10" y="34" width="18" height="32" rx="5" fill={w} /><rect x="32" y="34" width="18" height="32" rx="5" fill={w} /><rect x="54" y="34" width="18" height="32" rx="5" fill={w} opacity="0.6" /><path d="M78 50 L 92 50 M 85 43 L 85 57" stroke={w} strokeWidth="6" strokeLinecap="round" /></g>,
  };
  return svg(size, icons[kind]);
}

export type CtlKind = 'play' | 'pause' | 'stop' | 'replay' | 'prev' | 'next' | 'back' | 'home' | 'undo' | 'clear' | 'hear';

/** Media-style control glyph for chip buttons. Drawn in currentColor so it matches the chip's text. */
export function CtlIcon({ kind, size = 34 }: { kind: CtlKind; size?: number }) {
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 3.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  const icons: Record<CtlKind, React.ReactNode> = {
    play: <path d="M7 4.6v14.8a1.2 1.2 0 0 0 1.8 1l11.6-7.4a1.2 1.2 0 0 0 0-2L8.8 3.6A1.2 1.2 0 0 0 7 4.6z" fill="currentColor" />,
    pause: <g fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1.6" /><rect x="14" y="4" width="5" height="16" rx="1.6" /></g>,
    stop: <rect x="5" y="5" width="14" height="14" rx="2.6" fill="currentColor" />,
    replay: <g {...line}><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4 3.5v4.5h4.5" /></g>,
    prev: <g fill="currentColor"><path d="M20 5.2v13.6a1 1 0 0 1-1.6.8L9 12.8a1 1 0 0 1 0-1.6l9.4-6.8a1 1 0 0 1 1.6.8z" /><rect x="4" y="4.5" width="3.5" height="15" rx="1.4" /></g>,
    next: <g fill="currentColor"><path d="M4 5.2v13.6a1 1 0 0 0 1.6.8l9.4-6.8a1 1 0 0 0 0-1.6L5.6 4.4a1 1 0 0 0-1.6.8z" /><rect x="16.5" y="4.5" width="3.5" height="15" rx="1.4" /></g>,
    home: <g {...line}><path d="M4 11 12 4.5l8 6.5" /><path d="M6.5 9.5V19h11V9.5" /><path d="M10 19v-5h4v5" /></g>,
    back: <g {...line}><path d="M19 12H5.5" /><path d="M11 5.5 4.5 12l6.5 6.5" /></g>,
    undo: <g {...line}><path d="M8.5 14 4 9.5 8.5 5" /><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3" /></g>,
    clear: <g {...line}><path d="M6 6l12 12M18 6 6 18" /></g>,
    hear: <g><path d="M3.5 9.2v5.6h3.8L12 19V5L7.3 9.2z" fill="currentColor" /><g {...line} strokeWidth={2.6}><path d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4" /><path d="M18.2 6a8.4 8.4 0 0 1 0 12" /></g></g>,
  };
  return <svg className="ctl-ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{icons[kind]}</svg>;
}

/** A shiny dragon scale sticker (earned by finishing a game). */
export function Scale({ color, size = 40 }: { color: string; size?: number }) {
  return svg(size, <g>
    <path d="M50 8 Q 86 30 82 62 Q 76 90 50 94 Q 24 90 18 62 Q 14 30 50 8 Z" fill={color} stroke="rgba(0,0,0,0.15)" strokeWidth="4" />
    <path d="M36 34 Q 42 24 52 22" stroke="#fff" strokeWidth="7" strokeLinecap="round" fill="none" opacity="0.75" />
    <path d="M30 60 Q 50 76 70 60" stroke="rgba(255,255,255,0.4)" strokeWidth="5" fill="none" strokeLinecap="round" />
  </g>);
}

export function Flame({ lit, size = 46 }: { lit: boolean; size?: number }) {
  return svg(size, <path d="M50 92 Q 18 88 20 58 Q 22 36 40 22 Q 38 42 50 46 Q 46 22 62 8 Q 64 30 76 44 Q 86 58 80 74 Q 74 92 50 92 Z"
    fill={lit ? '#F28C38' : 'rgba(255,255,255,0.35)'} stroke={lit ? '#D9531E' : 'rgba(0,0,0,0.12)'} strokeWidth="4" />);
}

/** Static face of an avatar for pickers and previews (drawn from the same registry skin as the animated character). */
export function AvatarFace2D({ avatar, size = 200 }: { avatar: AvatarId; size?: number }) {
  const k = AVATARS[avatar].skin;
  const ear = (side: 1 | -1) => {
    const m = (v: number) => (side === 1 ? v : 100 - v);
    if (k.ears === 'pointy') return <g><path d={`M${m(18)} 40 L ${m(22)} 8 L ${m(44)} 24 Z`} fill={k.crest} /><path d={`M${m(24)} 34 L ${m(26)} 18 L ${m(37)} 26 Z`} fill={k.inner} /></g>;
    if (k.ears === 'floppy') return <ellipse cx={m(14)} cy="44" rx="11" ry="22" fill={k.crest} transform={`rotate(${side === 1 ? 14 : -14} ${m(14)} 44)`} />;
    if (k.ears === 'round') return <g><circle cx={m(22)} cy="22" r="14" fill={k.crest} /><circle cx={m(22)} cy="22" r="7" fill={k.inner} /></g>;
    return null;
  };
  return svg(size, <g>
    {k.horns && <g><circle cx="42" cy="12" r="5" fill={k.crest} /><circle cx="50" cy="9" r="6" fill={k.crest} /><circle cx="58" cy="12" r="5" fill={k.crest} /><ellipse cx="26" cy="20" rx="7" ry="13" fill="#FFD48A" transform="rotate(-28 26 20)" /><ellipse cx="74" cy="20" rx="7" ry="13" fill="#FFD48A" transform="rotate(28 74 20)" /></g>}
    {ear(1)}{ear(-1)}
    <ellipse cx="50" cy="52" rx="38" ry="34" fill={k.bodyMid} />
    <ellipse cx="50" cy="40" rx="30" ry="18" fill={k.bodyLight} opacity="0.45" />
    <ellipse cx="34" cy="48" rx="8" ry="9.5" fill="#fff" /><ellipse cx="66" cy="48" rx="8" ry="9.5" fill="#fff" />
    <circle cx="35" cy="50" r="5" fill="#2A1B12" /><circle cx="65" cy="50" r="5" fill="#2A1B12" /><circle cx="37" cy="47" r="1.8" fill="#fff" /><circle cx="67" cy="47" r="1.8" fill="#fff" />
    <ellipse cx="50" cy="66" rx={k.face === 'bear' ? 18 : 15} ry={k.face === 'bear' ? 12 : 10} fill={k.muzzle} />
    {k.face === 'dino' && <><circle cx="46" cy="62" r="1.6" fill={k.nose} /><circle cx="54" cy="62" r="1.6" fill={k.nose} /></>}
    {k.face === 'cat' && <path d="M46 61 L 54 61 L 50 66 Z" fill={k.nose} />}
    {(k.face === 'dog' || k.face === 'bear') && <ellipse cx="50" cy="61" rx="5.5" ry="3.8" fill={k.nose} />}
    <path d="M42 70 Q 50 77 58 70" stroke="#5B2410" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    <ellipse cx="25" cy="63" rx="5" ry="3" fill={k.cheek} opacity="0.55" /><ellipse cx="75" cy="63" rx="5" ry="3" fill={k.cheek} opacity="0.55" />
  </g>);
}

/**
 * A little full-body figure of the selected buddy doing the move (a pose, like an action emoji). The pose is static;
 * the move's animation plays when the card is hovered / focused with the remote (see styles.css, .demo-*).
 */
export function MoveDemo2D({ move, avatar, size = 120 }: { move: string; avatar: AvatarId; size?: number }) {
  const k = AVATARS[avatar].skin;
  const mark = (c: string) => ({ stroke: c, strokeWidth: 3.2, strokeLinecap: 'round' as const, fill: 'none' });
  const marks: Record<string, React.ReactNode> = {
    wave: <g className="fx-mark"><path d="M84 18 Q 92 26 84 34" {...mark('#2BB3A3')} /><path d="M90 12 Q 100 26 90 40" {...mark('#2BB3A3')} /></g>,
    jump: <g className="fx-mark"><path d="M38 104 L 38 110 M 50 104 L 50 112 M 62 104 L 62 110" {...mark('#2BB3A3')} /><path d="M14 40 l 0 8 M 10 44 l 8 0 M 88 30 l 0 8 M 84 34 l 8 0" {...mark('#F2B33D')} /></g>,
    sidestep: <g className="fx-mark"><path d="M4 70 L 20 70 M 2 80 L 18 80 M 6 90 L 20 90" {...mark('#2BB3A3')} /></g>,
    turn: <g className="fx-mark"><path d="M14 20 Q 50 -8 86 20" {...mark('#2BB3A3')} /><path d="M80 10 L 88 21 L 75 22" {...mark('#2BB3A3')} /></g>,
    handsup: <g className="fx-mark"><path d="M14 18 l 0 8 M 10 22 l 8 0 M 88 12 l 0 8 M 84 16 l 8 0" {...mark('#F2B33D')} /><path d="M50 4 l 0 6" {...mark('#F2B33D')} /></g>,
    bounce: <g className="fx-mark"><path d="M24 106 Q 50 112 76 106" {...mark('#2BB3A3')} /><path d="M32 100 Q 50 105 68 100" {...mark('#2BB3A3')} /></g>,
  };
  return (
    <div className={`demo demo-${move}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 100 112" width={size} height={size}>
        {marks[move]}
        <g className="fg">
          <g className="f-legL"><rect x="38" y="88" width="9" height="16" rx="4.5" fill={k.arm} /><ellipse cx="42" cy="105" rx="7.5" ry="4" fill={k.feet} /></g>
          <g className="f-legR"><rect x="53" y="88" width="9" height="16" rx="4.5" fill={k.arm} /><ellipse cx="58" cy="105" rx="7.5" ry="4" fill={k.feet} /></g>
          <g className="f-armL"><rect x="28" y="60" width="8" height="25" rx="4" fill={k.arm} /><circle cx="32" cy="86" r="5" fill={k.hand} /></g>
          <g className="f-armR"><rect x="64" y="60" width="8" height="25" rx="4" fill={k.arm} /><circle cx="68" cy="86" r="5" fill={k.hand} /></g>
          <ellipse cx="50" cy="75" rx="19" ry="21" fill={k.bodyMid} /><ellipse cx="50" cy="79" rx="11" ry="14" fill={k.belly} />
          <g transform="translate(17 0) scale(.66)"><AvatarFace2D avatar={avatar} size={100} /></g>
        </g>
      </svg>
    </div>
  );
}

/**
 * Tiny looping party scene for the logo: three balloons float and sway while a party popper bursts confetti.
 * Pure CSS (transform + opacity), so it stays light on TV sticks. Paused in gentle-motion mode.
 */
export function PartyBalloons() {
  const conf = [
    ['#E5533D', -22, -26], ['#FFD23F', -6, -34], ['#4FA3D9', 14, -30], ['#7DB955', 26, -14],
    ['#E85D8A', -26, -8], ['#8E6CC9', 4, -22], ['#F28C38', 22, -28], ['#2BB3A3', -14, -18],
  ] as const;
  return (
    <span className="party" aria-hidden="true">
      <svg viewBox="0 0 78 66" width="78" height="66">
        <g className="pb pb1"><line x1="18" y1="34" x2="20" y2="62" stroke="#fff" strokeOpacity=".8" strokeWidth="1.4" /><ellipse cx="18" cy="22" rx="10" ry="12.5" fill="#E5533D" /><ellipse cx="14.5" cy="17" rx="2.6" ry="3.8" fill="#fff" opacity=".5" /><path d="M16 34 L 20 34 L 18 37 Z" fill="#C23E2A" /></g>
        <g className="pb pb2"><line x1="36" y1="30" x2="34" y2="62" stroke="#fff" strokeOpacity=".8" strokeWidth="1.4" /><ellipse cx="36" cy="18" rx="10" ry="12.5" fill="#FFD23F" /><ellipse cx="32.5" cy="13" rx="2.6" ry="3.8" fill="#fff" opacity=".55" /><path d="M34 30 L 38 30 L 36 33 Z" fill="#E0A800" /></g>
        <g className="pb pb3"><line x1="54" y1="34" x2="50" y2="62" stroke="#fff" strokeOpacity=".8" strokeWidth="1.4" /><ellipse cx="54" cy="22" rx="10" ry="12.5" fill="#4FA3D9" /><ellipse cx="50.5" cy="17" rx="2.6" ry="3.8" fill="#fff" opacity=".5" /><path d="M52 34 L 56 34 L 54 37 Z" fill="#3584BA" /></g>
        <g transform="translate(66 52)">
          <path d="M-5 8 L 0 -10 L 5 8 Z" fill="#F28C38" stroke="#D96E22" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M-3 0 L 3 0 M -4 4 L 4 4" stroke="#fff" strokeWidth="1.5" />
          <g className="burst">
            {conf.map(([c, x, y], i) => (
              <rect key={i} className={`cf cf${i}`} x="-2" y="-12" width={i % 2 ? 3.4 : 4.4} height={i % 2 ? 3.4 : 2.2} rx="1" fill={c} style={{ ['--x' as string]: `${x}px`, ['--y' as string]: `${y}px`, ['--r' as string]: `${(i * 67) % 360}deg` }} />
            ))}
            <circle className="spark" cx="0" cy="-12" r="3" fill="#FFF3A8" />
          </g>
        </g>
      </svg>
    </span>
  );
}

/** The buddy's face: a 3D picture drawn from the 3D model (the flat drawing when 3D is not available). */
export function AvatarFace({ avatar, size = 200 }: { avatar: AvatarId; size?: number }) {
  const url = useFacePicture(avatar);
  if (!url) return <AvatarFace2D avatar={avatar} size={size} />;
  return <img className="face3d" src={url} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}

/**
 * A 3D picture of the selected buddy doing a move. Standing still it shows the move's best pose; when the card is
 * hovered or focused with the remote, the frames play (see styles.css, .mv3d). Falls back to the flat figure.
 */
export function MoveDemo({ move, avatar, size = 120 }: { move: string; avatar: AvatarId; size?: number }) {
  const strip = useMoveStrip(avatar, move);
  if (!strip) return <MoveDemo2D move={move} avatar={avatar} size={size} />;
  const w = size * strip.frames;
  return (
    <div className={`demo demo-${move} mv3d`} aria-hidden="true"
      style={{ width: size, height: size, backgroundImage: `url(${strip.url})`, backgroundSize: `${w}px ${size}px`, backgroundPosition: `${-size * strip.still}px 0`,
        ['--mv-n' as string]: strip.frames, ['--mv-w' as string]: `${w}px`, ['--mv-dur' as string]: `${strip.ms}ms` }} />
  );
}

/** Opening scene: all four buddies in a row, each doing a different move, evenly spaced. */
export function IntroCast() {
  const cast: [AvatarId, string][] = [['dino', 'wave'], ['cat', 'jump'], ['dog', 'turn'], ['bear', 'handsup']];
  return (
    <div className="intro-cast">
      {cast.map(([id, move], i) => <CastMember key={id} avatar={id} move={move} delay={0.15 + i * 0.07} />)}
    </div>
  );
}

const CAST_STATE: Record<string, CharacterState> = { wave: 'WAVING', jump: 'JUMPING', turn: 'SPINNING', handsup: 'HANDSUP' };

/** No 3D on this device: the same flat buddy the app uses (Milo.tsx), so the opening matches the screens after it. */
function CastFlat({ avatar, move, size }: { avatar: AvatarId; move: string; size: number }) {
  const machine = useMemo(() => {
    const m = new CharacterMachine(performance.now());
    m.enter(CAST_STATE[move] ?? 'WAVING', performance.now(), { durationMs: null });
    return m;
  }, [move]);
  const talkingUntil = useRef(0);
  const breathStart = useRef(0);
  // Milo draws its own 660 px wide box; this one is centred in the cast slot and scaled so its feet sit where the 3D buddies' feet do.
  return (
    <div className="cast-flat" style={{ width: size, height: size }}>
      <Milo machine={machine} mood="happy" talkingUntil={talkingUntil} reduced={false} breathStart={breathStart} avatar={avatar} lowFps />
    </div>
  );
}

function CastMember({ avatar, move, delay }: { avatar: AvatarId; move: string; delay: number }) {
  const pre = useIntroStrip(avatar, move); // pre-drawn pictures show at once; only if one is missing is it drawn live
  const live = useBigStrip(avatar, move, pre.failed);
  const strip = want3D() ? pre.strip ?? live : null;
  const size = 430;
  return (
    <div className="cast-member" style={{ animationDelay: `${delay}s` }}>
      {strip
        ? <div className="mv3d cast-anim" style={{ width: size, height: size, backgroundImage: `url(${strip.url})`, backgroundSize: `${size * strip.frames}px ${size}px`, ['--mv-n' as string]: strip.frames, ['--mv-w' as string]: `${size * strip.frames}px`, ['--mv-dur' as string]: `${strip.ms}ms` }} />
        : want3D()
          ? <div style={{ width: size, height: size }} /> /* 3D picture still being drawn: leave the spot empty rather than flash a different-looking drawing */
          : <CastFlat avatar={avatar} move={move} size={size} />}
      <span className="cast-name">{AVATARS[avatar].name}</span>
    </div>
  );
}
