/** Shared window chrome for the illustrative DEMO screenshots (same look as edi-monitor.svg). Static markup, no scripts. */
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const frame = (app: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" font-family="Inter, Segoe UI, sans-serif">
  <rect width="960" height="540" rx="18" fill="#F5F7FB"/>
  <rect x="0" y="0" width="960" height="48" rx="18" fill="#26408F"/>
  <rect x="0" y="30" width="960" height="18" fill="#26408F"/>
  <circle cx="26" cy="24" r="5" fill="#ffffff" opacity=".5"/><circle cx="44" cy="24" r="5" fill="#ffffff" opacity=".5"/><circle cx="62" cy="24" r="5" fill="#ffffff" opacity=".5"/>
  <text x="88" y="29" font-size="13" font-weight="600" fill="#fff">${esc(app)}</text>
  <rect x="820" y="14" width="116" height="20" rx="10" fill="#C7CD3D"/>
  <text x="878" y="28" font-size="11" font-weight="700" fill="#26408F" text-anchor="middle">DEMO DATA</text>
${body}
</svg>`;

/** Left navigation with one active item. */
export const nav = (items: string[], active: number) => `
  <g font-size="13" fill="#3A4560">
    <rect x="16" y="64" width="192" height="460" rx="14" fill="#fff" stroke="#E6E9F0"/>
    ${items.map((t, i) => (i === active
    ? `<rect x="28" y="${80 + i * 34}" width="168" height="34" rx="9" fill="#EEF1F9"/><text x="44" y="${102 + i * 34}" font-weight="600" fill="#26408F">${esc(t)}</text>`
    : `<text x="44" y="${102 + i * 34}">${esc(t)}</text>`)).join('\n    ')}
  </g>`;

/** Simple table: header row + rows; `x` are column offsets inside a 672px card starting at (232, y). */
export const grid = (y: number, x: number[], head: string[], rows: string[][], pill?: (lastCell: string) => [string, string] | null) => `
  <g transform="translate(232 ${y})">
    <rect width="672" height="${40 + rows.length * 40}" rx="12" fill="#fff" stroke="#E6E9F0"/>
    ${head.map((t, i) => `<text x="${x[i]}" y="26" font-size="11" font-weight="600" fill="#8A93A6">${esc(t)}</text>`).join('')}
    ${rows.map((r, j) => {
    const c = pill?.(r[r.length - 1]!);
    return `<line x1="16" x2="656" y1="${40 + j * 40}" y2="${40 + j * 40}" stroke="#EEF0F5"/>` + r.map((t, i) => (c && i === r.length - 1
      ? `<rect x="${x[i] - 8}" y="${50 + j * 40}" width="104" height="22" rx="11" fill="${c[1]}"/><text x="${x[i] + 44}" y="${65 + j * 40}" font-size="11" font-weight="600" fill="${c[0]}" text-anchor="middle">${esc(t)}</text>`
      : `<text x="${x[i]}" y="${66 + j * 40}" font-size="12" fill="${i === 0 ? '#1B2440' : '#5B6478'}"${i === 0 ? ' font-weight="600"' : ''}>${esc(t)}</text>`)).join('');
  }).join('\n    ')}
  </g>`;

export const heading = (title: string, sub: string) => `
  <text x="232" y="96" font-size="20" font-weight="700" fill="#1B2440">${esc(title)}</text>
  <text x="232" y="118" font-size="12" fill="#5B6478">${esc(sub)}</text>`;

export const note = (y: number, title: string, lines: string[], tone: 'warn' | 'ok' = 'warn') => {
  const [bg, stroke, fg, body] = tone === 'warn' ? ['#FFF8E6', '#F1D9A0', '#8A5A00', '#6B5A2E'] : ['#E3F4EA', '#B9DFC8', '#1F8A4C', '#2E5A3E'];
  return `
  <g transform="translate(232 ${y})">
    <rect width="672" height="${44 + lines.length * 20}" rx="12" fill="${bg}" stroke="${stroke}"/>
    <text x="20" y="30" font-size="13" font-weight="700" fill="${fg}">${esc(title)}</text>
    ${lines.map((l, i) => `<text x="20" y="${54 + i * 20}" font-size="12" fill="${body}">${esc(l)}</text>`).join('')}
  </g>`;
};

export const status = (s: string): [string, string] | null => {
  if (/paid|approved|accepted|imported|active|registered/i.test(s)) return ['#1F8A4C', '#E3F4EA'];
  if (/reject|denied|returned|expired|missing/i.test(s)) return ['#C0392B', '#FBE7E5'];
  return ['#26408F', '#EEF1F9'];
};
