import { esc } from './frame';

/** Illustrative DEMO diagram: claim lifecycle from intake to payment. Static markup, no scripts. */
const box = (x: number, title: string, sub: string, fill: string) => `
  <g transform="translate(${x} 200)">
    <rect width="150" height="96" rx="14" fill="${fill}" stroke="#C9CFDC"/>
    <text x="75" y="42" font-size="14" font-weight="700" fill="#1B2440" text-anchor="middle">${esc(title)}</text>
    <text x="75" y="66" font-size="11" fill="#5B6478" text-anchor="middle">${esc(sub)}</text>
  </g>`;
const arrow = (x: number) => `<path d="M${x} 248 h26" stroke="#26408F" stroke-width="2.5" marker-end="url(#a)"/>`;

export const claimLifecycleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" font-family="Inter, Segoe UI, sans-serif">
  <defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#26408F"/></marker></defs>
  <rect width="960" height="540" rx="18" fill="#F5F7FB"/>
  <text x="40" y="64" font-size="22" font-weight="700" fill="#1B2440">Claim lifecycle</text>
  <text x="40" y="90" font-size="13" fill="#5B6478">From GOP to payment. Illustrative DEMO diagram; systems and timings are fictional.</text>
  <rect x="800" y="44" width="116" height="20" rx="10" fill="#C7CD3D"/>
  <text x="858" y="58" font-size="11" font-weight="700" fill="#26408F" text-anchor="middle">DEMO DATA</text>
  ${box(40, 'GOP issued', 'Globo · medical team', '#EEF1F9')}${arrow(194)}
  ${box(224, 'Invoice in', 'EDI 837 or paper', '#fff')}${arrow(378)}
  ${box(408, 'Registered', 'Globo · claims', '#fff')}${arrow(562)}
  ${box(592, 'Approved', 'medical + 4-eyes', '#fff')}${arrow(746)}
  ${box(776, 'Paid', 'ECNet · Wednesday run', '#E3F4EA')}
  <g font-size="12" fill="#5B6478">
    <text x="224" y="330">Day 0: invoice received</text>
    <text x="408" y="330">Within 1 working day</text>
    <text x="592" y="330">Target: 5 working days</text>
    <text x="776" y="330">Next Wednesday run</text>
  </g>
  <g transform="translate(40 380)">
    <rect width="880" height="110" rx="14" fill="#FFF8E6" stroke="#F1D9A0"/>
    <text x="24" y="34" font-size="13" font-weight="700" fill="#8A5A00">Where claims stop</text>
    <text x="24" y="60" font-size="12" fill="#6B5A2E">No GOP or GOP exhausted: back to the medical team. Duplicate or out-of-cover items: denied with a reason code.</text>
    <text x="24" y="82" font-size="12" fill="#6B5A2E">Bank return after payment: handled from the Returned payments queue in ECNet.</text>
  </g>
</svg>`;
