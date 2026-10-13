/**
 * Generates all local demo imagery as WebP from hand-written SVG illustrations:
 *   - product images (one per colour + one detail shot) at 1200/800/480 px wide
 *   - hero, promo, blog and Open Graph images, favicon
 * Run: npm run images   (requires the optional `sharp` dependency)
 *
 * These are ILLUSTRATIONS for the demo catalog, not product photography.
 * Replace them with real photography through Admin → Products before launch.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PRODUCTS, BLOG_POSTS } from '../server/scripts/catalog-data.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/images');
const W = 1200;
const H = 1500;
const FLOOR = 1220;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- colour helpers ----------
function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex: string, amt: number) {
  const [r, g, b] = rgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const m = (c: number) => Math.round(c + (t - c) * p);
  return '#' + [m(r), m(g), m(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
/** horizontal "cylinder" gradient */
const cyl = (id: string, c: string, k = 1) => `<linearGradient id="${id}" x1="0" x2="1" y1="0" y2="0">
  <stop offset="0" stop-color="${shade(c, -0.28 * k)}"/><stop offset="0.32" stop-color="${shade(c, 0.14 * k)}"/>
  <stop offset="0.55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.38 * k)}"/></linearGradient>`;
const vert = (id: string, c: string, k = 1) => `<linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">
  <stop offset="0" stop-color="${shade(c, 0.12 * k)}"/><stop offset="1" stop-color="${shade(c, -0.22 * k)}"/></linearGradient>`;
const shadow = (cx: number, w: number, y = FLOOR, o = 0.28) =>
  `<ellipse cx="${cx}" cy="${y + 6}" rx="${w / 2}" ry="${Math.max(14, w / 14)}" fill="#1a1a1a" opacity="${o}" filter="url(#blur)"/>`;

type Art = { defs: string; body: string; focus?: [number, number]; scale?: number };
type Draw = (c: string, extra: { name: string; alt?: string }) => Art;

// ---------- objects ----------
const K: Record<string, Draw> = {
  vase: (c) => ({
    defs: cyl('b', c),
    body: `${shadow(600, 380)}
    <path d="M560,600 C540,520 600,470 610,420 M600,600 C620,500 690,470 700,380 M590,600 C580,520 520,470 500,430" stroke="#7a6a52" stroke-width="5" fill="none" stroke-linecap="round"/>
    <circle cx="610" cy="418" r="10" fill="#b49a6e"/><circle cx="700" cy="378" r="9" fill="#b49a6e"/><circle cx="500" cy="428" r="8" fill="#b49a6e"/>
    <path d="M565,560 L635,560 C635,640 640,670 700,720 C820,820 810,1010 760,1120 C740,1180 710,1215 690,1220 L510,1220 C490,1215 460,1180 440,1120 C390,1010 380,820 500,720 C560,670 565,640 565,560 Z" fill="url(#b)"/>
    <ellipse cx="600" cy="560" rx="36" ry="9" fill="${shade(c, -0.45)}"/>`,
    focus: [600, 820],
  }),
  vase2: () => ({
    defs: `<linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#cfe0e3" stop-opacity=".55"/><stop offset=".4" stop-color="#ffffff" stop-opacity=".75"/><stop offset="1" stop-color="#a9c2c7" stop-opacity=".6"/></linearGradient>`,
    body: `${shadow(600, 560)}
    ${[[470, 760, 170], [700, 560, 200]].map(([x, top, w]) => `<g>
      <path d="M${x - w / 2},${top + 40} Q${x - w / 2},${top} ${x - w / 3},${top} L${x + w / 3},${top} Q${x + w / 2},${top} ${x + w / 2},${top + 40} L${x + w / 2},${FLOOR - 20} Q${x + w / 2},${FLOOR} ${x + w / 3},${FLOOR} L${x - w / 3},${FLOOR} Q${x - w / 2},${FLOOR} ${x - w / 2},${FLOOR - 20} Z" fill="url(#g)" stroke="#8aa7ad" stroke-opacity=".5" stroke-width="2"/>
      ${Array.from({ length: 9 }, (_, i) => `<line x1="${x - w / 2 + 12 + i * ((w - 24) / 8)}" y1="${top + 20}" x2="${x - w / 2 + 12 + i * ((w - 24) / 8)}" y2="${FLOOR - 12}" stroke="#ffffff" stroke-opacity="${i % 2 ? 0.55 : 0.2}" stroke-width="5"/>`).join('')}
      <ellipse cx="${x}" cy="${top + 4}" rx="${w / 3}" ry="8" fill="#ffffff" opacity=".6"/>
      <rect x="${x - w / 2 + 6}" y="${FLOOR - 140}" width="${w - 12}" height="120" rx="14" fill="#9fbfc4" opacity=".25"/>
      <path d="M${x},${top + 10} C${x - 10},${top - 120} ${x + 40},${top - 200} ${x + 20},${top - 300}" stroke="#6f8b5a" stroke-width="5" fill="none"/>
      <ellipse cx="${x + 30}" cy="${top - 230}" rx="34" ry="14" fill="#7d9a66" transform="rotate(-30 ${x + 30} ${top - 230})"/>
    </g>`).join('')}`,
    focus: [600, 760],
  }),
  pillow: (c) => ({
    defs: `<radialGradient id="b" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="${shade(c, 0.18)}"/><stop offset=".7" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.3)}"/></radialGradient>
    <pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 3h6M3 0v6" stroke="#000" stroke-opacity=".05" stroke-width="1"/></pattern>`,
    body: `${shadow(600, 640)}
    <path d="M290,600 Q600,560 910,600 Q960,600 950,650 Q900,900 950,1150 Q960,1200 910,1205 Q600,1240 290,1205 Q240,1200 250,1150 Q300,900 250,650 Q240,600 290,600 Z" fill="url(#b)"/>
    <path d="M290,600 Q600,560 910,600 Q960,600 950,650 Q900,900 950,1150 Q960,1200 910,1205 Q600,1240 290,1205 Q240,1200 250,1150 Q300,900 250,650 Q240,600 290,600 Z" fill="url(#weave)"/>
    <path d="M300,612 Q600,575 900,612" stroke="${shade(c, -0.25)}" stroke-width="3" fill="none" stroke-dasharray="2 8"/>
    <path d="M330,880 Q600,930 870,880" stroke="${shade(c, -0.18)}" stroke-width="6" fill="none" opacity=".5"/>`,
    focus: [700, 760],
  }),
  candle: (_c, e) => {
    const big = e.alt === '400 g';
    const w = big ? 360 : 280;
    const h = big ? 440 : 340;
    const x = 600 - w / 2;
    const top = FLOOR - h;
    return {
      defs: `<linearGradient id="glass" x1="0" x2="1"><stop offset="0" stop-color="#2b2420"/><stop offset=".35" stop-color="#5a4a40"/><stop offset=".6" stop-color="#3a302a"/><stop offset="1" stop-color="#1c1714"/></linearGradient>`,
      body: `${shadow(600, w + 60)}
      <rect x="${x}" y="${top}" width="${w}" height="${h}" rx="24" fill="url(#glass)" opacity=".95"/>
      <ellipse cx="600" cy="${top + 30}" rx="${w / 2 - 14}" ry="18" fill="#efe4cf"/>
      <rect x="592" y="${top - 18}" width="16" height="44" rx="3" fill="#7b5b3a"/>
      <rect x="${x + 40}" y="${top + h * 0.42}" width="${w - 80}" height="${h * 0.3}" rx="6" fill="#efe9de"/>
      <rect x="${x + 70}" y="${top + h * 0.42 + 26}" width="${w - 140}" height="10" rx="5" fill="#1b2a4a" opacity=".85"/>
      <rect x="${x + 90}" y="${top + h * 0.42 + 52}" width="${w - 180}" height="7" rx="3" fill="#a0896a"/>
      <rect x="${x + 100}" y="${top + h * 0.42 + 72}" width="${w - 200}" height="7" rx="3" fill="#a0896a" opacity=".6"/>
      <rect x="${x + 14}" y="${top + 20}" width="14" height="${h - 50}" rx="7" fill="#fff" opacity=".12"/>`,
      focus: [600, top + 60],
    };
  },
  notebook: () => ({
    defs: `<pattern id="lin" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 2.5h5" stroke="#000" stroke-opacity=".07"/></pattern>`,
    body: `${shadow(600, 700)}
    ${[['#5D6B78', -8, 560], ['#D8C3A0', 4, 600], ['#1B2A4A', -2, 640]].map(([col, rot, x]) => `<g transform="rotate(${rot} ${x} 900)">
      <rect x="${Number(x) - 230}" y="560" width="460" height="640" rx="14" fill="${col}"/>
      <rect x="${Number(x) - 230}" y="560" width="460" height="640" rx="14" fill="url(#lin)"/>
      <rect x="${Number(x) + 196}" y="560" width="10" height="640" fill="#1c1c1e" opacity=".55"/>
      <rect x="${Number(x) - 222}" y="1188" width="444" height="10" fill="#f4efe6"/></g>`).join('')}
    <rect x="470" y="800" width="260" height="40" rx="4" fill="#efe9de" transform="rotate(-2 600 820)"/>`,
    focus: [600, 820],
  }),
  diffuser: () => ({
    defs: `<linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#3d4a3a"/><stop offset=".4" stop-color="#7f9479"/><stop offset="1" stop-color="#2f3a2d"/></linearGradient>`,
    body: `${shadow(600, 320)}
    ${Array.from({ length: 8 }, (_, i) => {
      const a = -0.5 + i * 0.14;
      return `<line x1="600" y1="820" x2="${600 + Math.sin(a) * 560}" y2="${820 - Math.cos(a) * 560}" stroke="#8a6b47" stroke-width="7" stroke-linecap="round"/>`;
    }).join('')}
    <path d="M560,800 L640,800 L640,850 C760,880 760,900 760,960 L760,1180 Q760,1220 720,1220 L480,1220 Q440,1220 440,1180 L440,960 C440,900 440,880 560,850 Z" fill="url(#g)" opacity=".95"/>
    <rect x="555" y="770" width="90" height="40" rx="6" fill="#1c1c1e"/>
    <rect x="480" y="1010" width="240" height="120" rx="6" fill="#efe9de"/><rect x="520" y="1050" width="160" height="10" rx="5" fill="#1b2a4a"/><rect x="540" y="1075" width="120" height="7" rx="3" fill="#a0896a"/>`,
    focus: [600, 700],
  }),
  lamp: (c) => ({
    defs: `${cyl('b', c)}<radialGradient id="glow" cx=".42" cy=".38" r=".65"><stop offset="0" stop-color="#fffdf6"/><stop offset=".6" stop-color="#f6efe0"/><stop offset="1" stop-color="#d9cfbd"/></radialGradient>
    <radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe9b8" stop-opacity=".55"/><stop offset="1" stop-color="#ffe9b8" stop-opacity="0"/></radialGradient>`,
    body: `${shadow(600, 380)}
    <circle cx="600" cy="610" r="330" fill="url(#halo)"/>
    <path d="M470,1220 Q470,1150 520,1140 L680,1140 Q730,1150 730,1220 Z" fill="url(#b)"/>
    <rect x="585" y="820" width="30" height="330" fill="url(#b)"/>
    <rect x="560" y="800" width="80" height="40" rx="10" fill="url(#b)"/>
    <circle cx="600" cy="620" r="200" fill="url(#glow)"/>`,
    focus: [600, 720],
  }),
  pendant: () => ({
    defs: `${cyl('b', '#3A3D42')}<linearGradient id="cone" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff4d6" stop-opacity=".7"/><stop offset="1" stop-color="#fff4d6" stop-opacity="0"/></linearGradient>`,
    body: `<polygon points="440,760 760,760 980,1240 220,1240" fill="url(#cone)"/>
    <line x1="600" y1="0" x2="600" y2="470" stroke="#1c1c1e" stroke-width="6"/>
    <rect x="575" y="460" width="50" height="60" rx="8" fill="#1c1c1e"/>
    <path d="M330,770 Q330,520 600,515 Q870,520 870,770 Z" fill="url(#b)"/>
    <ellipse cx="600" cy="770" rx="270" ry="26" fill="#f4f2ee"/><ellipse cx="600" cy="770" rx="90" ry="14" fill="#fffbe9"/>`,
    focus: [600, 620],
  }),
  mug: (c) => ({
    defs: cyl('b', c),
    body: `${shadow(600, 720)}
    ${[[430, 0], [760, 1]].map(([x, i]) => `<g>
      <path d="M${x + 150},${880} q120,10 110,110 q-10,90 -110,90" stroke="${shade(c, -0.15)}" stroke-width="34" fill="none"/>
      <path d="M${x - 160},${800} L${x + 160},${800} L${x + 150},${1180} Q${x + 148},${FLOOR} ${x + 110},${FLOOR} L${x - 110},${FLOOR} Q${x - 148},${FLOOR} ${x - 150},${1180} Z" fill="url(#b)"/>
      <ellipse cx="${x}" cy="800" rx="160" ry="26" fill="${shade(c, -0.35)}"/><ellipse cx="${x}" cy="796" rx="150" ry="20" fill="${shade(c, -0.5)}"/>
      ${Array.from({ length: 26 }, (_, k) => `<circle cx="${x - 130 + ((k * 53 + i * 31) % 260)}" cy="${830 + ((k * 97 + i * 13) % 340)}" r="3" fill="${shade(c, lum(c) > 0.5 ? -0.5 : 0.4)}" opacity=".5"/>`).join('')}
      <rect x="${x - 150}" y="${FLOOR - 40}" width="300" height="40" fill="#cdbfa4" opacity=".55"/></g>`).join('')}`,
    focus: [430, 900],
  }),
  kettle: (c) => ({
    defs: cyl('b', c, 1.2),
    body: `${shadow(620, 520)}
    <path d="M420,1000 C330,960 300,860 230,700 Q215,665 190,668" stroke="url(#b)" stroke-width="30" fill="none" stroke-linecap="round"/>
    <path d="M800,820 C930,820 930,1060 810,1080" stroke="#1c1c1e" stroke-width="34" fill="none" stroke-linecap="round"/>
    <path d="M440,820 L800,820 L850,1180 Q855,${FLOOR} 815,${FLOOR} L425,${FLOOR} Q385,${FLOOR} 390,1180 Z" fill="url(#b)"/>
    <ellipse cx="620" cy="820" rx="180" ry="26" fill="${shade(c, 0.2)}"/>
    <ellipse cx="620" cy="800" rx="120" ry="22" fill="url(#b)"/><rect x="600" y="750" width="40" height="50" rx="10" fill="#1c1c1e"/>
    <circle cx="620" cy="760" r="18" fill="#efe9de" stroke="#1c1c1e" stroke-width="4"/>`,
    focus: [560, 860],
  }),
  board: (_c, e) => {
    const large = e.alt === 'Large';
    const w = large ? 460 : 380;
    const h = large ? 820 : 700;
    const x = 600 - w / 2;
    const top = FLOOR - h;
    return {
      defs: `<linearGradient id="wood" x1="0" x2="1"><stop offset="0" stop-color="#4a2f1e"/><stop offset=".5" stop-color="#7a5236"/><stop offset="1" stop-color="#4f3322"/></linearGradient>`,
      body: `${shadow(600, w + 80)}
      <path d="M${x},${top + 160} Q${x},${top + 110} ${x + 40},${top + 110} L${600 - 60},${top + 110} L${600 - 60},${top + 30} Q${600 - 60},${top} ${600 - 30},${top} L${600 + 30},${top} Q${600 + 60},${top} ${600 + 60},${top + 30} L${600 + 60},${top + 110} L${x + w - 40},${top + 110} Q${x + w},${top + 110} ${x + w},${top + 160} L${x + w},${FLOOR - 30} Q${x + w},${FLOOR} ${x + w - 30},${FLOOR} L${x + 30},${FLOOR} Q${x},${FLOOR} ${x},${FLOOR - 30} Z" fill="url(#wood)"/>
      <circle cx="600" cy="${top + 50}" r="18" fill="#f1ede6"/>
      ${Array.from({ length: 14 }, (_, i) => `<path d="M${x + 20 + i * ((w - 40) / 13)},${top + 130} q${i % 2 ? 12 : -12},${h / 3} 0,${h / 1.6} t0,${h / 4}" stroke="#2e1d12" stroke-opacity=".25" stroke-width="3" fill="none"/>`).join('')}`,
      focus: [600, top + 140],
    };
  },
  bottle: (c) => ({
    defs: `${cyl('b', c)}${cyl('s', '#B8BCC2')}`,
    body: `${shadow(600, 300)}
    <rect x="490" y="500" width="220" height="110" rx="30" fill="url(#s)"/>
    <rect x="540" y="470" width="120" height="50" rx="16" fill="url(#s)"/>
    <path d="M480,640 Q480,600 520,600 L680,600 Q720,600 720,640 L720,1170 Q720,${FLOOR} 670,${FLOOR} L530,${FLOOR} Q480,${FLOOR} 480,1170 Z" fill="url(#b)"/>
    <rect x="480" y="600" width="240" height="26" fill="url(#s)"/>
    <rect x="575" y="900" width="50" height="8" rx="4" fill="${shade(c, lum(c) > 0.6 ? -0.4 : 0.5)}" opacity=".7"/>`,
    focus: [600, 620],
  }),
  headphones: (c) => ({
    defs: `${cyl('b', c)}${vert('v', c)}`,
    body: `${shadow(600, 640)}
    <path d="M330,900 C300,420 900,420 870,900" stroke="url(#v)" stroke-width="54" fill="none" stroke-linecap="round"/>
    <path d="M360,880 C340,470 860,470 840,880" stroke="${shade(c, -0.4)}" stroke-width="14" fill="none" opacity=".6"/>
    ${[300, 900].map((x) => `<rect x="${x - 95}" y="820" width="190" height="300" rx="90" fill="url(#b)"/>
      <rect x="${x - 70 + (x < 600 ? 60 : -60)}" y="850" width="140" height="240" rx="70" fill="${shade(c, -0.55)}"/>`).join('')}
    <rect x="${900 - 50}" y="1040" width="10" height="30" rx="5" fill="#c9a15a"/>`,
    focus: [300, 940],
  }),
  speaker: (c) => ({
    defs: `${cyl('b', c)}<pattern id="mesh" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r="2.6" fill="#000" opacity=".22"/></pattern>`,
    body: `${shadow(600, 560)}
    <rect x="330" y="760" width="540" height="460" rx="110" fill="url(#b)"/>
    <rect x="330" y="760" width="540" height="460" rx="110" fill="url(#mesh)"/>
    <rect x="360" y="790" width="480" height="40" rx="20" fill="${shade(c, -0.3)}" opacity=".6"/>
    ${[520, 600, 680].map((x) => `<circle cx="${x}" cy="810" r="11" fill="${shade(c, lum(c) > 0.5 ? -0.5 : 0.5)}"/>`).join('')}
    <rect x="565" y="1150" width="70" height="14" rx="7" fill="#c9a15a" opacity=".85"/>`,
    focus: [600, 820],
  }),
  pad: () => ({
    defs: `<linearGradient id="wood" x1="0" x2="1"><stop offset="0" stop-color="#5a3b26"/><stop offset=".5" stop-color="#8d6243"/><stop offset="1" stop-color="#5a3b26"/></linearGradient>`,
    body: `${shadow(600, 720, 1150)}
    <path d="M880,1080 C1000,1120 1060,1200 1200,1190" stroke="#e8e4dc" stroke-width="16" fill="none"/>
    <ellipse cx="600" cy="1080" rx="340" ry="120" fill="#2b2b2d"/>
    <ellipse cx="600" cy="1060" rx="340" ry="120" fill="url(#wood)"/>
    ${Array.from({ length: 8 }, (_, i) => `<ellipse cx="600" cy="1060" rx="${300 - i * 34}" ry="${104 - i * 12}" fill="none" stroke="#3a2416" stroke-opacity=".18" stroke-width="3"/>`).join('')}
    <circle cx="840" cy="1110" r="6" fill="#9be3a0"/>`,
    focus: [600, 1040],
  }),
  watch: (c, e) => {
    const [caseC, strap] = e.name.startsWith('Gold') ? ['#C9A15A', '#1B2A4A'] : ['#C7CBD1', '#1C1C1E'];
    return {
      defs: `${cyl('cs', caseC, 1.3)}${vert('st', strap)}<radialGradient id="dial" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="${e.name.startsWith('Gold') ? '#24365c' : '#f5f4f0'}"/><stop offset="1" stop-color="${e.name.startsWith('Gold') ? '#101a30' : '#d9d8d2'}"/></radialGradient>`,
      body: `${shadow(600, 300)}
      <rect x="520" y="300" width="160" height="420" rx="24" fill="url(#st)"/>
      <rect x="520" y="980" width="160" height="240" rx="24" fill="url(#st)"/>
      ${[360, 420, 480].map((y) => `<rect x="540" y="${y}" width="120" height="4" fill="#000" opacity=".2"/>`).join('')}
      <rect x="560" y="1080" width="80" height="60" rx="10" fill="none" stroke="url(#cs)" stroke-width="10"/>
      <circle cx="600" cy="850" r="205" fill="url(#cs)"/>
      <circle cx="600" cy="850" r="180" fill="url(#dial)"/>
      ${Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return `<line x1="${600 + Math.sin(a) * 150}" y1="${850 - Math.cos(a) * 150}" x2="${600 + Math.sin(a) * (i % 3 ? 160 : 132)}" y2="${850 - Math.cos(a) * (i % 3 ? 160 : 132)}" stroke="${caseC}" stroke-width="${i % 3 ? 4 : 8}"/>`;
      }).join('')}
      <line x1="600" y1="850" x2="660" y2="760" stroke="${caseC}" stroke-width="10" stroke-linecap="round"/>
      <line x1="600" y1="850" x2="520" y2="960" stroke="${caseC}" stroke-width="7" stroke-linecap="round"/>
      <circle cx="600" cy="850" r="12" fill="${caseC}"/>
      <rect x="800" y="830" width="30" height="40" rx="6" fill="url(#cs)"/>`,
      focus: [600, 850],
    };
  },
  wallet: (c) => ({
    defs: `${vert('b', c)}`,
    body: `${shadow(600, 600)}
    <rect x="420" y="600" width="300" height="190" rx="14" fill="#c9a15a" transform="rotate(-8 570 700)"/>
    <rect x="340" y="700" width="520" height="500" rx="26" fill="url(#b)"/>
    <path d="M340,820 Q600,860 860,820" stroke="${shade(c, -0.3)}" stroke-width="6" fill="none"/>
    <path d="M340,940 Q600,980 860,940" stroke="${shade(c, -0.3)}" stroke-width="6" fill="none"/>
    <rect x="352" y="712" width="496" height="476" rx="20" fill="none" stroke="${shade(c, 0.35)}" stroke-width="3" stroke-dasharray="10 9"/>`,
    focus: [600, 820],
  }),
  sunglasses: (c) => ({
    defs: `${vert('f', c, 1.4)}<linearGradient id="lens" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#4a5560"/><stop offset=".5" stop-color="#1a2028"/><stop offset="1" stop-color="#2d3a44"/></linearGradient>`,
    body: `${shadow(600, 760, 1080)}
    <path d="M200,880 L120,1050 M1000,880 L1080,1050" stroke="url(#f)" stroke-width="24" stroke-linecap="round"/>
    ${[400, 800].map((x) => `<rect x="${x - 175}" y="760" width="350" height="290" rx="120" fill="url(#f)"/><rect x="${x - 150}" y="784" width="300" height="242" rx="104" fill="url(#lens)"/>
      <path d="M${x - 100},820 Q${x - 40},800 ${x + 20},830" stroke="#fff" stroke-opacity=".25" stroke-width="12" fill="none" stroke-linecap="round"/>`).join('')}
    <path d="M560,820 Q600,780 640,820" stroke="url(#f)" stroke-width="30" fill="none"/>
    ${c === '#6B4A2E' ? Array.from({ length: 30 }, (_, i) => `<circle cx="${240 + ((i * 97) % 720)}" cy="${770 + ((i * 53) % 270)}" r="${8 + (i % 4) * 4}" fill="#2f1d10" opacity=".35"/>`).join('') : ''}`,
    focus: [400, 900],
  }),
  scarf: (c) => ({
    defs: `${vert('b', c)}<pattern id="knit" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 5h10" stroke="#000" stroke-opacity=".06" stroke-width="2"/></pattern>`,
    body: `${shadow(600, 640)}
    <path d="M330,520 Q600,470 870,520 L880,1120 Q600,1180 320,1120 Z" fill="url(#b)"/>
    <path d="M330,520 Q600,470 870,520 L880,1120 Q600,1180 320,1120 Z" fill="url(#knit)"/>
    <path d="M380,520 Q440,800 400,1130 M520,505 Q560,800 540,1150 M690,505 Q650,820 680,1150 M820,515 Q770,820 810,1130" stroke="${shade(c, -0.25)}" stroke-width="16" fill="none" opacity=".35"/>
    ${Array.from({ length: 34 }, (_, i) => `<line x1="${330 + i * 16}" y1="${1124 + Math.sin(i / 5) * 18}" x2="${330 + i * 16}" y2="${1205}" stroke="${shade(c, -0.1)}" stroke-width="5" stroke-linecap="round"/>`).join('')}`,
    focus: [600, 1080],
  }),
  tote: (c) => ({
    defs: `${vert('b', c)}${cyl('h', c)}`,
    body: `${shadow(600, 760)}
    <path d="M420,700 C420,420 560,420 560,700" stroke="${shade(c, -0.25)}" stroke-width="30" fill="none"/>
    <path d="M640,700 C640,420 780,420 780,700" stroke="${shade(c, -0.25)}" stroke-width="30" fill="none"/>
    <path d="M300,700 L900,700 L960,1220 L240,1220 Z" fill="url(#b)"/>
    <path d="M318,724 L882,724 L936,1196 L264,1196 Z" fill="none" stroke="${shade(c, 0.3)}" stroke-width="3" stroke-dasharray="9 8"/>
    <rect x="575" y="740" width="50" height="16" rx="8" fill="#c9a15a"/>`,
    focus: [600, 760],
  }),
  backpack: (c) => ({
    defs: `${vert('b', c)}${vert('d', shade(c, -0.15))}`,
    body: `${shadow(600, 640)}
    <path d="M520,460 Q600,400 680,460" stroke="${shade(c, -0.35)}" stroke-width="26" fill="none"/>
    <rect x="340" y="470" width="520" height="750" rx="120" fill="url(#b)"/>
    <rect x="400" y="820" width="400" height="340" rx="60" fill="url(#d)"/>
    <path d="M410,840 L790,840" stroke="#1c1c1e" stroke-width="6" opacity=".6"/>
    <path d="M380,560 Q600,500 820,560" stroke="#1c1c1e" stroke-width="6" fill="none" opacity=".5"/>
    <rect x="770" y="828" width="16" height="44" rx="6" fill="#c9a15a"/><rect x="805" y="548" width="16" height="44" rx="6" fill="#c9a15a"/>
    <rect x="560" y="1060" width="80" height="30" rx="6" fill="${shade(c, 0.2)}" opacity=".8"/>`,
    focus: [600, 620],
  }),
  crossbody: (c) => ({
    defs: `${vert('b', c)}${vert('f', shade(c, -0.08))}`,
    body: `${shadow(600, 560)}
    <path d="M370,900 C330,500 520,250 600,250 C680,250 870,500 830,900" stroke="${shade(c, -0.3)}" stroke-width="20" fill="none"/>
    <rect x="330" y="880" width="540" height="340" rx="40" fill="url(#b)"/>
    <path d="M330,920 Q330,880 370,880 L830,880 Q870,880 870,920 L870,1040 Q600,1090 330,1040 Z" fill="url(#f)"/>
    <rect x="570" y="1030" width="60" height="38" rx="8" fill="#c9a15a"/>`,
    focus: [600, 960],
  }),
  sneaker: (c) => shoe(c, 'low'),
  boot: (c) => shoe(c, 'boot'),
  runner: (c) => shoe(c, 'knit'),
  sweater: (c) => garment(c, { sleeves: 'long', collar: 'crew', len: 620, knit: true }),
  tee: (c) => garment(c, { sleeves: 'short', collar: 'crew', len: 600 }),
  shirt: (c) => garment(c, { sleeves: 'long', collar: 'shirt', len: 660, buttons: true }),
  jacket: (c) => garment(c, { sleeves: 'long', collar: 'stand', len: 600, quilted: true, zip: true }),
  coat: (c) => garment(c, { sleeves: 'long', collar: 'lapel', len: 780, buttons: true }),
};

function shoe(c: string, type: 'low' | 'boot' | 'knit'): Art {
  const sole = type === 'boot' ? '#3a2b20' : c === '#1C1C1E' && type === 'low' ? '#f4f2ee' : '#f4f2ee';
  const top = type === 'boot' ? 560 : 820;
  const upper =
    type === 'boot'
      ? `M300,1120 L300,${top} Q300,${top - 20} 330,${top - 20} L560,${top - 20} Q590,${top - 20} 590,${top + 10} L600,880 Q650,960 860,1000 Q960,1020 960,1100 L960,1120 Z`
      : `M260,1120 Q250,950 330,${top + 20} Q420,${top - 30} 520,${top} L600,880 Q660,950 860,990 Q960,1010 960,1090 L960,1120 Z`;
  return {
    defs: `${vert('b', c)}<pattern id="knit" width="14" height="10" patternUnits="userSpaceOnUse"><path d="M0 5 l7 -4 l7 4" stroke="#fff" stroke-opacity=".18" stroke-width="2" fill="none"/></pattern>`,
    body: `${shadow(610, 760)}
    <path d="${upper}" fill="url(#b)"/>
    ${type === 'knit' ? `<path d="${upper}" fill="url(#knit)"/>` : ''}
    ${type === 'boot' ? `<path d="M470,${top + 40} Q500,800 470,1000 L560,1000 Q590,800 560,${top + 40} Z" fill="${shade(c, -0.25)}"/><rect x="320" y="${top - 60}" width="40" height="70" rx="10" fill="${shade(c, -0.35)}"/>` : ''}
    ${type !== 'boot' ? Array.from({ length: 4 }, (_, i) => `<line x1="${520 + i * 34}" y1="${880 + i * 16}" x2="${600 + i * 34}" y2="${860 + i * 16}" stroke="${lum(c) > 0.6 ? '#1b2a4a' : '#f4f2ee'}" stroke-width="7" stroke-linecap="round"/>`).join('') : ''}
    <path d="M240,1110 L980,1110 Q990,1150 960,1180 L270,1180 Q235,1160 240,1110 Z" fill="${sole}"/>
    <path d="M250,1180 L965,1180 L960,1212 L260,1212 Z" fill="${type === 'boot' ? '#22180f' : '#d9d3c6'}"/>
    ${type === 'low' ? `<rect x="300" y="1000" width="90" height="16" rx="8" fill="#c9a15a"/>` : ''}`,
    focus: [700, 980],
  };
}

function garment(c: string, o: { sleeves: 'long' | 'short'; collar: 'crew' | 'shirt' | 'stand' | 'lapel'; len: number; knit?: boolean; quilted?: boolean; buttons?: boolean; zip?: boolean }): Art {
  const top = 460;
  const hem = top + o.len;
  const L = 380;
  const R = 820;
  const sleeve =
    o.sleeves === 'long'
      ? { r: `L${R + 20},${top + 40} L${R + 150},${hem - 40} L${R + 70},${hem - 10} L${R},${top + 220}`, l: `L${L},${top + 220} L${L - 70},${hem - 10} L${L - 150},${hem - 40} L${L - 20},${top + 40}` }
      : { r: `L${R + 20},${top + 40} L${R + 140},${top + 230} L${R + 60},${top + 280} L${R},${top + 200}`, l: `L${L},${top + 200} L${L - 60},${top + 280} L${L - 140},${top + 230} L${L - 20},${top + 40}` };
  const body = `M520,${top} Q600,${top + 50} 680,${top} ${sleeve.r} L${R},${hem} L${L},${hem} ${sleeve.l} Z`;
  return {
    defs: `${vert('b', c)}<pattern id="knit" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M3 0 v12 M9 0 v12" stroke="#000" stroke-opacity=".06" stroke-width="3"/></pattern>`,
    body: `
    <path d="M600,${top - 40} q0,-40 30,-50 q30,-12 30,-40 q0,-30 -30,-30 q-22,0 -30,20" stroke="#8b8b8b" stroke-width="10" fill="none"/>
    <path d="M400,${top + 20} L600,${top - 40} L800,${top + 20}" stroke="#a0896a" stroke-width="14" fill="none" stroke-linecap="round"/>
    <path d="${body}" fill="url(#b)"/>
    ${o.knit ? `<path d="${body}" fill="url(#knit)"/><rect x="${L}" y="${hem - 50}" width="${R - L}" height="50" fill="${shade(c, -0.12)}"/>` : ''}
    ${o.quilted ? Array.from({ length: Math.floor(o.len / 90) }, (_, i) => `<path d="M${L - (o.sleeves === 'long' ? 40 + i * 14 : 0)},${top + 90 + i * 90} Q600,${top + 110 + i * 90} ${R + (o.sleeves === 'long' ? 40 + i * 14 : 0)},${top + 90 + i * 90}" stroke="${shade(c, -0.35)}" stroke-width="5" fill="none"/>`).join('') : ''}
    ${o.collar === 'crew' ? `<path d="M520,${top} Q600,${top + 50} 680,${top}" stroke="${shade(c, -0.25)}" stroke-width="22" fill="none"/>` : ''}
    ${o.collar === 'shirt' ? `<path d="M520,${top} L560,${top + 90} L600,${top + 40} L640,${top + 90} L680,${top}" fill="${shade(c, 0.1)}" stroke="${shade(c, -0.2)}" stroke-width="4"/>` : ''}
    ${o.collar === 'stand' ? `<rect x="525" y="${top - 30}" width="150" height="60" rx="16" fill="${shade(c, -0.1)}"/>` : ''}
    ${o.collar === 'lapel' ? `<path d="M520,${top} L600,${top + 300} L680,${top} L720,${top + 30} L640,${top + 160} L600,${top + 300} L560,${top + 160} L480,${top + 30} Z" fill="${shade(c, -0.12)}"/>` : ''}
    ${o.zip ? `<line x1="600" y1="${top + 30}" x2="600" y2="${hem}" stroke="#c9a15a" stroke-width="6"/>` : ''}
    ${o.buttons ? Array.from({ length: o.collar === 'lapel' ? 3 : 6 }, (_, i) => `<circle cx="${o.collar === 'lapel' ? 640 : 600}" cy="${(o.collar === 'lapel' ? top + 340 : top + 80) + i * (o.collar === 'lapel' ? 110 : 90)}" r="${o.collar === 'lapel' ? 14 : 8}" fill="${shade(c, lum(c) > 0.6 ? -0.4 : 0.35)}"/>`).join('') : ''}
    ${o.collar === 'lapel' ? `<path d="M${L + 50},${top + 420} l100,0 M${R - 150},${top + 420} l100,0" stroke="${shade(c, -0.3)}" stroke-width="6"/>` : ''}`,
    focus: [600, top + 120],
  };
}

// Small objects get scaled up so every product fills its card similarly.
const SCALE: Record<string, number> = { mug: 1.12, speaker: 1.3, pad: 1.25, sunglasses: 1.12, wallet: 1.15, candle: 1.3, bottle: 1.15, crossbody: 1.05, diffuser: 1.1, watch: 1.05, headphones: 1.1, lamp: 1.08 };

// ---------- scenes ----------
const BLUR = `<filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>`;

function studio(art: Art) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${BLUR}<linearGradient id="bg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#F5F3EF"/><stop offset=".78" stop-color="#ECE8E1"/><stop offset=".781" stop-color="#E4DED4"/><stop offset="1" stop-color="#DAD3C7"/></linearGradient>${art.defs}</defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/><g transform="translate(600 ${FLOOR}) scale(${art.scale ?? 1}) translate(-600 -${FLOOR})">${art.body}</g></svg>`;
}

function detail(art: Art) {
  const [fx, fy] = art.focus ?? [600, 800];
  const s = 1.75;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${BLUR}<radialGradient id="bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#16294A"/><stop offset=".7" stop-color="#0B1D38"/><stop offset="1" stop-color="#061225"/></radialGradient>
  <radialGradient id="rim" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#E9BE65" stop-opacity=".22"/><stop offset="1" stop-color="#E9BE65" stop-opacity="0"/></radialGradient>${art.defs}</defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/><circle cx="600" cy="640" r="560" fill="url(#rim)"/>
  <g transform="translate(${600 - fx * s} ${700 - fy * s}) scale(${s})">${art.body}</g></svg>`;
}

/** Place an object (drawn in the 1200×1500 frame) inside a larger scene. */
function place(art: Art, x: number, y: number, s: number) {
  return `<g transform="translate(${x} ${y}) scale(${s})">${art.body}</g>`;
}
function uniq(art: Art, p: string): Art {
  // Prefix gradient/pattern ids so several objects can share one SVG.
  const ids = [...art.defs.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  let { defs, body } = art;
  for (const id of ids) {
    const re = new RegExp(`(id="|url\\(#)${id}([")])`, 'g');
    defs = defs.replace(re, `$1${p}${id}$2`);
    body = body.replace(re, `$1${p}${id}$2`);
  }
  return { ...art, defs, body };
}

async function out(svg: string, file: string, widths: number[], fmt: 'webp' | 'jpg' = 'webp') {
  mkdirSync(path.dirname(file), { recursive: true });
  const buf = Buffer.from(svg);
  const meta = await sharp(buf).metadata();
  for (const [i, w] of widths.entries()) {
    const target = i === 0 ? file : file.replace(/\.(webp|jpg)$/, `-${w}.$1`);
    let img = sharp(buf, { density: 72 * (w / (meta.width ?? w)) * 1 }).resize({ width: w });
    img = fmt === 'webp' ? img.webp({ quality: 80, effort: 5 }) : img.jpeg({ quality: 84, mozjpeg: true });
    await img.toFile(target);
  }
}

async function main() {
  let count = 0;
  for (const p of PRODUCTS) {
    const draw = K[p.kind];
    if (!draw) throw new Error(`No drawing for kind ${p.kind}`);
    const colors = p.colors?.length ? p.colors : [null];
    for (const c of colors) {
      const art = { ...draw(c?.hex ?? '#888888', { name: c?.name ?? '', alt: p.sizes?.[p.sizes.length - 1] }), scale: SCALE[p.kind] ?? 1 };
      const name = c ? slug(c.name) : 'main';
      await out(studio(art), path.join(OUT, 'products', `${p.slug}-${name}.webp`), [1200, 800, 480]);
      count++;
    }
    const first = colors[0];
    const art = draw(first?.hex ?? '#888888', { name: first?.name ?? '' });
    await out(detail(art), path.join(OUT, 'products', `${p.slug}-detail.webp`), [1200, 800, 480]);
    count++;
  }

  const by = (k: string, hex: string, name = '') => K[k](hex, { name });
  const navyScene = (w: number, h: number, inner: string, defs: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>${BLUR}<radialGradient id="nbg" cx=".62" cy=".45" r=".8"><stop offset="0" stop-color="#14284A"/><stop offset=".65" stop-color="#0B1D38"/><stop offset="1" stop-color="#061225"/></radialGradient>
    <linearGradient id="plinth" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1A3157"/><stop offset="1" stop-color="#0E203D"/></linearGradient>${defs}</defs>
    <rect width="${w}" height="${h}" fill="url(#nbg)"/>${inner}</svg>`;

  // Hero (wide): arch, plinths, three objects.
  {
    const a = uniq(by('lamp', '#C9A15A'), 'a');
    const b = uniq(by('vase', '#D8C3A0'), 'b');
    const c = uniq(by('headphones', '#D8C3A0'), 'c');
    const d = uniq(by('tote', '#8E4E2B'), 'd');
    const inner = `
      <path d="M1020,1250 L1020,560 A390,390 0 0 1 1800,560 L1800,1250" fill="#0F2443" stroke="#E9BE65" stroke-opacity=".55" stroke-width="3"/>
      <circle cx="1410" cy="560" r="300" fill="#E9BE65" opacity=".06"/>
      <rect x="980" y="1010" width="420" height="240" fill="url(#plinth)"/><rect x="980" y="1010" width="420" height="4" fill="#E9BE65" opacity=".5"/>
      <rect x="1430" y="900" width="420" height="350" fill="url(#plinth)"/><rect x="1430" y="900" width="420" height="4" fill="#E9BE65" opacity=".5"/>
      ${place(a, 1000, 345, 0.55)}${place(b, 1180, 520, 0.4)}${place(d, 1440, 362, 0.45)}${place(c, 800, 770, 0.36)}`;
    await out(navyScene(2000, 1250, inner, a.defs + b.defs + c.defs + d.defs), path.join(OUT, 'hero', 'hero-wide.webp'), [2000, 1400, 900]);
    // Tall crop composition for phones.
    const inner2 = `
      <path d="M140,1250 L140,520 A360,360 0 0 1 860,520 L860,1250" fill="#0F2443" stroke="#E9BE65" stroke-opacity=".55" stroke-width="3"/>
      <rect x="120" y="1000" width="760" height="250" fill="url(#plinth)"/><rect x="120" y="1000" width="760" height="4" fill="#E9BE65" opacity=".5"/>
      ${place(a, 120, 335, 0.55)}${place(b, 470, 512, 0.4)}`;
    await out(navyScene(1000, 1250, inner2, a.defs + b.defs), path.join(OUT, 'hero', 'hero-tall.webp'), [1000, 700]);
    count += 2;
  }
  // Promo banner (outerwear)
  {
    const j = uniq(by('jacket', '#1B2A4A'), 'j');
    const s = uniq(by('scarf', '#B98B5B'), 's');
    const inner = `<circle cx="1200" cy="420" r="380" fill="#E9BE65" opacity=".07"/>${place(j, 820, 40, 0.62)}${place(s, 1300, 280, 0.45)}`;
    await out(navyScene(1800, 900, inner, j.defs + s.defs), path.join(OUT, 'promo', 'promo-outerwear.webp'), [1800, 1100, 700]);
    count++;
  }
  // Blog images
  const blogScenes: Record<string, [string, string, string?, string?]> = {
    'blog-lamp': ['lamp', '#C9A15A', 'notebook', '#888888'],
    'blog-leather': ['tote', '#8E4E2B', 'wallet', '#B07B4F'],
    'blog-coffee': ['kettle', '#A7ADB3', 'mug', '#EFE6D2'],
    'blog-welcome': ['vase', '#D8C3A0', 'bottle', '#1B2A4A'],
  };
  for (const post of BLOG_POSTS) {
    const [k1, c1, k2, c2] = blogScenes[post.image];
    const a = uniq(by(k1, c1), 'a');
    const b = k2 ? uniq(by(k2, c2!), 'b') : null;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><defs>${BLUR}${a.defs}${b?.defs ?? ''}</defs>
      <rect width="1600" height="1000" fill="#EFEBE4"/><rect x="0" y="0" width="760" height="1000" fill="#E3DCCF"/><rect x="0" y="808" width="1600" height="192" fill="#DCD4C6"/>
      ${place(a, 120, 70, 0.6)}${b ? place(b, 820, 70, 0.6) : ''}</svg>`;
    await out(svg, path.join(OUT, 'blog', `${post.image}.webp`), [1600, 1000, 600]);
    count++;
  }
  // Open Graph default
  {
    const a = uniq(by('vase', '#D8C3A0'), 'a');
    const inner = `<path d="M760,630 L760,300 A220,220 0 0 1 1200,300 L1200,630" fill="#0F2443" stroke="#E9BE65" stroke-opacity=".6" stroke-width="3"/>
      ${place(a, 790, 30, 0.38)}
      <text x="90" y="300" font-family="Lora" font-size="110" fill="#F6D995" letter-spacing="14">SOLVIA</text>
      <rect x="94" y="340" width="120" height="3" fill="#E9BE65"/>
      <text x="92" y="410" font-family="Inter" font-size="38" fill="#E3E8EF">Discover Better. Shop Smarter.</text>`;
    await out(navyScene(1200, 630, inner, a.defs), path.join(OUT, 'og-default.jpg'), [1200], 'jpg');
    count++;
  }
  // Favicon + touch icon
  const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#061225"/><path d="M42 20c-2-3-6-5-10-5-6 0-10 3-10 8 0 11 21 6 21 17 0 5-5 9-11 9-5 0-9-2-11-6" fill="none" stroke="#E9BE65" stroke-width="5" stroke-linecap="round"/></svg>`;
  writeFileSync(path.join(ROOT, 'public', 'favicon.svg'), fav);
  await sharp(Buffer.from(fav), { density: 600 }).resize(180, 180).png().toFile(path.join(ROOT, 'public', 'apple-touch-icon.png'));
  console.log(`Generated ${count} images (+ size variants) in public/images`);
}

await main();
