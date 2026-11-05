/** The EDI loop (UHCG -> MacroHealth -> Euro-Center and back), redrawn from the EDI 101 reference diagram. Static markup, no scripts. */
const box = (x: number, y: number, l1: string, l2: string) => `
  <rect x="${x}" y="${y}" width="230" height="92" rx="16" fill="#FFFFFF" stroke="#E3E5EE" stroke-width="1.5"/>
  <text x="${x + 115}" y="${y + 38}" text-anchor="middle">${l1}</text>
  <text x="${x + 115}" y="${y + 62}" text-anchor="middle">${l2}</text>`;
const badge = (x: number, y: number, label: string, fill: string, ink: string) => `
  <rect x="${x}" y="${y}" width="56" height="28" rx="8" fill="${fill}"/>
  <text x="${x + 28}" y="${y + 19}" text-anchor="middle" font-weight="700" fill="${ink}">${label}</text>`;
const lane = (x: number, label: string, fill: string, ink: string) => `
  <rect x="${x}" y="22" width="150" height="30" rx="15" fill="${fill}"/>
  <text x="${x + 75}" y="42" text-anchor="middle" font-size="11.5" font-weight="600" letter-spacing="1.4" fill="${ink}">${label}</text>`;

export const ediLoopSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="476" viewBox="0 0 1000 476" font-family="Inter, Segoe UI, sans-serif">
  <defs>
    <marker id="p" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#26408F"/></marker>
    <marker id="z" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#0084CC"/></marker>
  </defs>
  <rect width="1000" height="476" rx="18" fill="#F7F8FC"/>
  <g stroke="#C9CDD9" stroke-width="1.5" stroke-dasharray="3 7"><line x1="335" y1="76" x2="335" y2="430"/><line x1="665" y1="76" x2="665" y2="430"/></g>
  <g font-size="9.5" letter-spacing="1.3" fill="#6B7080" text-anchor="middle"><text x="335" y="68">SHARED FOLDER</text><text x="665" y="68">SHARED FOLDER</text></g>
  ${lane(95, 'UHCG', '#E2E6F1', '#26408F')}${lane(425, 'MACROHEALTH', '#EEF0C5', '#5B6008')}${lane(755, 'EURO-CENTER', '#DCEEF8', '#00699F')}
  <g font-size="12.5" fill="#565B6B" text-anchor="middle"><text x="170" y="88">Patient treated · invoice issued</text><text x="170" y="456">Payment reaches the provider</text></g>
  <g stroke-width="2" fill="none">
    <line x1="170" y1="96" x2="170" y2="108" stroke="#26408F" marker-end="url(#p)"/>
    <line x1="285" y1="158" x2="385" y2="158" stroke="#26408F" marker-end="url(#p)"/>
    <line x1="615" y1="158" x2="715" y2="158" stroke="#26408F" marker-end="url(#p)"/>
    <line x1="830" y1="204" x2="830" y2="296" stroke="#0084CC" marker-end="url(#z)"/>
    <line x1="715" y1="346" x2="615" y2="346" stroke="#0084CC" marker-end="url(#z)"/>
    <line x1="385" y1="346" x2="285" y2="346" stroke="#0084CC" marker-end="url(#z)"/>
    <line x1="170" y1="392" x2="170" y2="436" stroke="#0084CC" marker-end="url(#z)"/>
  </g>
  <g font-size="14" fill="#12151F">
    ${box(55, 112, 'Savings applied,', 'invoice converted to EDI')}${box(385, 112, 'Extracts the data,', 'forwards the file')}${box(715, 112, 'Imports the invoice', 'into Globo')}
    ${box(715, 300, 'Coverage decision applied,', 'status becomes Settled')}${box(385, 300, 'Transforms the file', 'into payment instructions')}${box(55, 300, 'Applies the decision,', 'pays the provider')}
  </g>
  <g font-size="12.5">
    ${badge(307, 144, '837', '#26408F', '#FFFFFF')}${badge(637, 144, '837', '#26408F', '#FFFFFF')}
    ${badge(637, 332, 'PCF', '#C7CD3D', '#3F4408')}${badge(307, 332, '835', '#00699F', '#FFFFFF')}
  </g>
</svg>`;
