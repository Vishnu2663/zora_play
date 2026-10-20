// The ten Band instruments as pictures. Used on the Band buttons and, larger, in the buddy's hands while one is played.
import React from 'react';
import type { InstrumentId } from '../core/band.ts';

export /** Instrument pictures. Parts carry classes the press animation moves (keys, strings, bars, sound waves);
 *  `lit` is the key / bar that sounds on this press. */
function InstrumentArt({ id, lit }: { id: InstrumentId; lit: number }) {
  const art: Record<InstrumentId, React.ReactNode> = {
    piano: <g>
      <rect x="8" y="22" width="84" height="60" rx="10" fill="#3A2418" />
      {[0, 1, 2, 3, 4].map((k) => <rect key={k} className={`ik${lit % 5 === k ? ' lit' : ''}`} x={14 + k * 15} y="34" width="13" height="42" rx="3" fill="#fff" />)}
      {[0, 1, 3].map((k) => <rect key={k} x={24 + k * 15} y="34" width="8" height="24" rx="2" fill="#3A2418" />)}
      <rect x="14" y="26" width="72" height="5" rx="2.5" fill="#E5533D" />
    </g>,
    guitar: <g>
      <rect x="46" y="4" width="10" height="44" rx="4" fill="#8A5C3B" />
      <rect x="43" y="2" width="16" height="10" rx="4" fill="#5B3A22" />
      <ellipse cx="51" cy="58" rx="24" ry="19" fill="#F2A93B" />
      <ellipse cx="51" cy="78" rx="29" ry="19" fill="#F2A93B" />
      <circle cx="51" cy="66" r="9" fill="#5B3A22" />
      <rect x="40" y="84" width="22" height="5" rx="2" fill="#5B3A22" />
      {[47, 51, 55].map((x) => <line key={x} className="istr" x1={x} y1="8" x2={x} y2="86" stroke="#FFF3D6" strokeWidth="1.6" />)}
    </g>,
    xylo: <g>
      <rect x="10" y="30" width="80" height="6" rx="3" fill="#8A5C3B" /><rect x="10" y="66" width="80" height="6" rx="3" fill="#8A5C3B" />
      {['#E5533D', '#F2A93B', '#7DB955', '#4FA3D9', '#8E6CC9'].map((c, k) => (
        <rect key={k} className={`ibar${lit % 5 === k ? ' lit' : ''}`} x={14 + k * 15.5} y={22 + k * 3} width="12" height={58 - k * 6} rx="3" fill={c} />
      ))}
      <g className="imallet"><rect x="64" y="2" width="5" height="30" rx="2.5" fill="#8A5C3B" transform="rotate(35 66 17)" /><circle cx="76" cy="6" r="7" fill="#E85D8A" /></g>
    </g>,
    trumpet: <g>
      {[0, 1, 2].map((k) => <path key={k} className={`iwave w${k}`} d={`M${84 + k * 5} ${36 - k * 6} Q ${92 + k * 6} 50 ${84 + k * 5} ${64 + k * 6}`} fill="none" stroke="#F2A93B" strokeWidth="4" strokeLinecap="round" />)}
      <path d="M10 46 L 56 46 L 78 32 L 78 68 L 56 54 L 10 54 Z" fill="#FFC93C" />
      <rect x="6" y="44" width="8" height="12" rx="3" fill="#D9A21E" />
      {[24, 34, 44].map((x) => <rect key={x} className="ivalve" x={x} y="30" width="7" height="16" rx="2.5" fill="#D9A21E" />)}
      <path d="M18 54 Q 18 70 36 70 L 50 70 Q 58 70 58 60" fill="none" stroke="#FFC93C" strokeWidth="7" />
    </g>,
    drum: <g>
      <rect x="14" y="36" width="72" height="40" fill="#E5533D" />
      <path d="M14 40 L 30 74 L 42 40 L 56 74 L 70 40 L 86 74" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" opacity="0.8" />
      <ellipse cx="50" cy="76" rx="36" ry="10" fill="#B83A28" />
      <ellipse className="idrumhead" cx="50" cy="36" rx="36" ry="12" fill="#F6F1E6" stroke="#D9CBB0" strokeWidth="3" />
      <g className="imallet"><rect x="60" y="2" width="5" height="32" rx="2.5" fill="#8A5C3B" transform="rotate(28 62 18)" /><circle cx="72" cy="6" r="5" fill="#F2A93B" /></g>
      <g className="imallet"><rect x="26" y="2" width="5" height="32" rx="2.5" fill="#8A5C3B" transform="rotate(-28 28 18)" /><circle cx="16" cy="6" r="5" fill="#F2A93B" /></g>
    </g>,
    flute: <g>
      {[0, 1, 2].map((k) => <path key={k} className={`iwave w${k}`} d={`M${88 + k * 4} ${34 - k * 5} Q ${96 + k * 5} 46 ${88 + k * 4} ${58 + k * 5}`} fill="none" stroke="#4FA3D9" strokeWidth="3.5" strokeLinecap="round" />)}
      <rect x="6" y="38" width="80" height="16" rx="8" fill="#CFD8E3" stroke="#9FB0C4" strokeWidth="2.5" />
      <rect x="6" y="38" width="80" height="6" rx="3" fill="#fff" opacity="0.55" />
      <ellipse cx="18" cy="46" rx="5" ry="3" fill="#8FA2B8" />
      {[34, 44, 54, 64, 74].map((x) => <circle key={x} className="ivalve" cx={x} cy="46" r="3.6" fill="#5B6B80" />)}
    </g>,
    harp: <g>
      <path d="M22 84 L 22 18 Q 22 6 36 6 Q 74 6 80 40 Q 84 62 70 84 Z" fill="#E8B04A" stroke="#B9822A" strokeWidth="3" strokeLinejoin="round" />
      <rect x="16" y="82" width="62" height="8" rx="4" fill="#8A5C3B" />
      {[0, 1, 2, 3, 4, 5, 6].map((k) => <line key={k} className="istr" x1={30 + k * 7} y1={16 + k * 4.5} x2={30 + k * 7} y2="82" stroke="#FFF7DF" strokeWidth="1.8" />)}
    </g>,
    maracas: <g>
      <g className="imara"><rect x="20" y="46" width="7" height="38" rx="3.5" fill="#8A5C3B" transform="rotate(14 24 66)" /><ellipse cx="30" cy="34" rx="17" ry="22" fill="#E5533D" transform="rotate(14 30 34)" /><circle cx="26" cy="28" r="3" fill="#FFE9B0" /><circle cx="36" cy="40" r="3" fill="#FFE9B0" /><circle cx="24" cy="42" r="2.5" fill="#FFE9B0" /></g>
      <g className="imara m2"><rect x="72" y="46" width="7" height="38" rx="3.5" fill="#8A5C3B" transform="rotate(-14 76 66)" /><ellipse cx="70" cy="34" rx="17" ry="22" fill="#4FA3D9" transform="rotate(-14 70 34)" /><circle cx="74" cy="28" r="3" fill="#FFE9B0" /><circle cx="64" cy="40" r="3" fill="#FFE9B0" /><circle cx="76" cy="42" r="2.5" fill="#FFE9B0" /></g>
    </g>,
    bells: <g>
      <g className="ibell"><path d="M26 74 Q 26 28 40 24 Q 54 28 54 74 Z" fill="#F2B33D" stroke="#C98A1C" strokeWidth="3" /><rect x="22" y="72" width="36" height="7" rx="3.5" fill="#E0A02B" /><circle cx="40" cy="84" r="5" fill="#8A5C3B" /><circle cx="40" cy="20" r="4" fill="#C98A1C" /></g>
      <g className="ibell b2"><path d="M54 70 Q 54 34 66 30 Q 78 34 78 70 Z" fill="#FFD76A" stroke="#C98A1C" strokeWidth="3" /><rect x="50" y="68" width="32" height="7" rx="3.5" fill="#E8B03A" /><circle cx="66" cy="80" r="4.5" fill="#8A5C3B" /><circle cx="66" cy="27" r="3.5" fill="#C98A1C" /></g>
    </g>,
    tambourine: <g>
      <circle cx="50" cy="48" r="34" fill="#F6E3B8" stroke="#C98A1C" strokeWidth="9" />
      <circle cx="50" cy="48" r="26" fill="#FFF8E3" opacity="0.7" />
      {[0, 1, 2, 3, 4, 5].map((k) => { const a = (k * Math.PI) / 3; return <g key={k} className="ijingle"><circle cx={50 + Math.cos(a) * 34} cy={48 + Math.sin(a) * 34} r="6.5" fill="#E0A02B" stroke="#8A5C3B" strokeWidth="1.5" /></g>; })}
      <path d="M36 44 Q 50 60 64 44" fill="none" stroke="#E85D8A" strokeWidth="4" strokeLinecap="round" />
    </g>,
  };
  return <svg viewBox="0 0 100 92" aria-hidden="true">{art[id]}</svg>;
}
