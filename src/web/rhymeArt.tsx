// One illustration per Rhyme Room song (the owner's five songs), drawn as simple 3D-shaded SVG.
import React from 'react';

const svg = (size: number, children: React.ReactNode) => <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">{children}</svg>;

export function RhymeArt({ id, size = 110 }: { id: string; size?: number }) {
  switch (id) {
    case 'lullaby': // crescent moon with stars
      return svg(size, <g>
        <defs><radialGradient id="ra-moon" cx=".35" cy=".3" r=".85"><stop offset="0" stopColor="#FFF3B0" /><stop offset="1" stopColor="#F2B63C" /></radialGradient></defs>
        <path d="M62 10 A 40 40 0 1 0 90 62 A 32 32 0 1 1 62 10 Z" fill="url(#ra-moon)" />
        <path d="M70 18 l 3 7 7 1 -5 5 2 8 -7 -4 -7 4 2 -8 -5 -5 7 -1 z" fill="#fff" opacity=".95" transform="translate(-8 4) scale(.8)" />
        <circle cx="82" cy="30" r="3.5" fill="#fff" /><circle cx="22" cy="20" r="3" fill="#fff" /><circle cx="86" cy="84" r="3" fill="#fff" />
      </g>);
    case 'robot': // smiling robot head
      return svg(size, <g>
        <defs><linearGradient id="ra-bot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8EDFD3" /><stop offset="1" stopColor="#2BB3A3" /></linearGradient></defs>
        <rect x="47" y="6" width="6" height="14" fill="#8A5C3B" /><circle cx="50" cy="8" r="6" fill="#E5533D" />
        <rect x="14" y="20" width="72" height="62" rx="16" fill="url(#ra-bot)" stroke="#1E8F82" strokeWidth="3" />
        <rect x="6" y="40" width="9" height="20" rx="4" fill="#1E8F82" /><rect x="85" y="40" width="9" height="20" rx="4" fill="#1E8F82" />
        <circle cx="35" cy="46" r="9" fill="#fff" /><circle cx="65" cy="46" r="9" fill="#fff" /><circle cx="36" cy="47" r="4.5" fill="#2A1B12" /><circle cx="66" cy="47" r="4.5" fill="#2A1B12" />
        <path d="M32 64 Q 50 80 68 64" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
        <ellipse cx="30" cy="30" rx="12" ry="5" fill="#fff" opacity=".35" />
      </g>);
    case 'march': // marching drum with sticks
      return svg(size, <g>
        <defs><linearGradient id="ra-drum" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#F2874A" /><stop offset=".5" stopColor="#FFB070" /><stop offset="1" stopColor="#D9531E" /></linearGradient></defs>
        <rect x="16" y="40" width="68" height="40" fill="url(#ra-drum)" /><ellipse cx="50" cy="80" rx="34" ry="10" fill="#D9531E" />
        <ellipse cx="50" cy="40" rx="34" ry="11" fill="#FFF3DA" stroke="#C9A36A" strokeWidth="3" />
        <path d="M22 46 L 38 78 L 50 48 L 62 78 L 78 46" stroke="#fff" strokeWidth="3" fill="none" opacity=".85" />
        <path d="M20 8 L 44 36 M 80 8 L 56 36" stroke="#8A5C3B" strokeWidth="5" strokeLinecap="round" /><circle cx="19" cy="7" r="5" fill="#FFD23F" /><circle cx="81" cy="7" r="5" fill="#FFD23F" />
      </g>);
    case 'feather': // soft drifting feather
      return svg(size, <g>
        <defs><linearGradient id="ra-fea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#BDE3FA" /><stop offset="1" stopColor="#4FA3D9" /></linearGradient></defs>
        <path d="M82 10 C 40 14 14 44 18 84 C 54 80 84 52 82 10 Z" fill="url(#ra-fea)" stroke="#2F78AD" strokeWidth="3" />
        <path d="M80 12 C 56 36 34 58 16 90" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M56 30 L 74 36 M 46 44 L 66 50 M 36 58 L 56 64 M 28 70 L 44 76" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".7" />
      </g>);
    case 'tap': // clapping hands with sparks
      return svg(size, <g>
        <defs><radialGradient id="ra-hand" cx=".35" cy=".3" r=".85"><stop offset="0" stopColor="#FFD9A8" /><stop offset="1" stopColor="#F2A24A" /></radialGradient></defs>
        <path d="M26 82 C 14 66 16 44 26 30 L 32 34 L 30 52 L 40 22 L 48 26 L 46 50 L 54 20 L 62 24 L 58 52 L 68 28 L 76 32 L 66 66 C 62 80 44 92 26 82 Z" fill="url(#ra-hand)" stroke="#C9751E" strokeWidth="3" strokeLinejoin="round" />
        <path d="M78 14 L 82 24 M 90 28 L 80 32 M 70 8 L 70 18" stroke="#FFD23F" strokeWidth="5" strokeLinecap="round" />
      </g>);
    default: return svg(size, <circle cx="50" cy="50" r="30" fill="#ccc" />);
  }
}
