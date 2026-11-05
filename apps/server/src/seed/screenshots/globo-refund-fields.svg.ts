import { esc } from './frame';

/**
 * Redrawn Globo field crops (not a capture, no patient data) for "denied, now to be paid": the fields to clear after
 * refund and create a copy, and the savings re-entered by hand. Values as in the EDI 101 reference redraw. Static markup.
 */
const W = 190, ROW = 36;
const col = (x: number, head: string, cells: string[], tone: 'fix' | 'add', caption: string, kind: 'text' | 'check' | 'field' = 'text') => {
  const h = 34 + cells.length * ROW, edge = tone === 'fix' ? '#C8453B' : '#2E9E57';
  const cell = (c: string, j: number) => {
    const y = 34 + j * ROW;
    const line = j ? `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="#DFE2EA"/>` : '';
    if (kind === 'check') return `${line}<rect x="${W / 2 - 8}" y="${y + 10}" width="16" height="16" rx="2" fill="#FFFFFF" stroke="#6C7186"/><path d="M${W / 2 - 4} ${y + 18} l3 4 l6 -9" fill="none" stroke="#12151F" stroke-width="1.8"/>`;
    if (kind === 'field') return `${line}<rect x="12" y="${y + 7}" width="64" height="22" rx="2" fill="#FFFFFF" stroke="#9AA0B0"/><text x="44" y="${y + 23}" font-weight="600" text-anchor="middle">${esc(c)}</text>`;
    return `${line}<text x="${W - 14}" y="${y + 23}" text-anchor="end">${esc(c)}</text>`;
  };
  return `
  <g transform="translate(${x} 96)" font-size="13" fill="#12151F">
    <rect width="${W}" height="${h}" rx="3" fill="#FFFFFF" stroke="#B9BDC9"/>
    <rect width="${W}" height="34" rx="3" fill="#EEF0F5"/><line x1="0" x2="${W}" y1="34" y2="34" stroke="#B9BDC9"/>
    <text x="12" y="22" font-size="12" font-weight="600" fill="#3C4152">${esc(head)}</text>
    ${cells.map(cell).join('')}
    <rect x="1" y="1" width="${W - 2}" height="${h - 2}" rx="3" fill="none" stroke="${edge}" stroke-width="2"/>
    <text x="0" y="${h + 26}" font-size="12" fill="#565B6B">${esc(caption)}</text>
  </g>`;
};

export const globoRefundFieldsSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="320" viewBox="0 0 960 320" font-family="Inter, Segoe UI, sans-serif">
  <rect width="960" height="320" rx="18" fill="#F7F8FC"/>
  <text x="40" y="48" font-size="18" font-weight="700" fill="#12151F">After refund and create a copy: what to change on the new line</text>
  <text x="40" y="72" font-size="12" fill="#565B6B">Redrawn Globo fields. Red: clear or unmark. Green: savings show 0.00, re-enter the original savings by hand.</text>
  ${col(40, 'Internal Remark', ['182'], 'fix', '1. Remove the denial code', 'field')}
  ${col(262, 'Not covered', ['', '', ''], 'fix', '2. Unmark the boxes', 'check')}
  ${col(484, 'Saving', ['0.00', '0.00', '0.00'], 'add', '3. After the refund')}
  ${col(706, 'Saving', ['120.00', '40.00', '40.00'], 'add', '4. Re-entered by hand')}
</svg>`;
