/** Illustrative DEMO screenshot of a fictional EDI Monitor. Static markup, no scripts. */
const row = (y: number, name: string, time: string, claims: string, status: string, color: string, bg: string) => `
  <g transform="translate(232 ${y})">
    <rect width="672" height="52" rx="10" fill="#fff" stroke="#E6E9F0"/>
    <circle cx="24" cy="26" r="5" fill="${color}"/>
    <text x="44" y="31" font-size="13" font-weight="600" fill="#1B2440">${name}</text>
    <text x="356" y="31" font-size="12" fill="#5B6478">${time}</text>
    <text x="466" y="31" font-size="12" fill="#5B6478">${claims}</text>
    <rect x="560" y="15" width="96" height="22" rx="11" fill="${bg}"/>
    <text x="608" y="30" font-size="11" font-weight="600" fill="${color}" text-anchor="middle">${status}</text>
  </g>`;

export const ediMonitorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" font-family="Inter, Segoe UI, sans-serif">
  <rect width="960" height="540" rx="18" fill="#F5F7FB"/>
  <rect x="0" y="0" width="960" height="48" rx="18" fill="#26408F"/>
  <rect x="0" y="30" width="960" height="18" fill="#26408F"/>
  <circle cx="26" cy="24" r="5" fill="#ffffff" opacity=".5"/><circle cx="44" cy="24" r="5" fill="#ffffff" opacity=".5"/><circle cx="62" cy="24" r="5" fill="#ffffff" opacity=".5"/>
  <text x="88" y="29" font-size="13" font-weight="600" fill="#fff">EDI Monitor</text>
  <rect x="820" y="14" width="116" height="20" rx="10" fill="#C7CD3D"/>
  <text x="878" y="28" font-size="11" font-weight="700" fill="#26408F" text-anchor="middle">DEMO DATA</text>
  <g font-size="13" fill="#3A4560">
    <rect x="16" y="64" width="192" height="460" rx="14" fill="#fff" stroke="#E6E9F0"/>
    <rect x="28" y="80" width="168" height="34" rx="9" fill="#EEF1F9"/>
    <text x="44" y="102" font-weight="600" fill="#26408F">Inbound batches</text>
    <text x="44" y="142">Quarantine</text><text x="172" y="142" font-size="11" fill="#C0392B" font-weight="700">3</text>
    <text x="44" y="176">Acknowledgements</text>
    <text x="44" y="210">Senders</text>
    <text x="44" y="244">Settings</text>
  </g>
  <text x="232" y="96" font-size="20" font-weight="700" fill="#1B2440">Inbound batches</text>
  <text x="232" y="118" font-size="12" fill="#5B6478">UHCG Direct · 837I · today</text>
  <g font-size="11" fill="#8A93A6" font-weight="600">
    <text x="276" y="152">Batch file</text><text x="588" y="152">Received</text><text x="698" y="152">Claims</text><text x="808" y="152">Status</text>
  </g>
  ${row(164, 'UHCGD_837I_DEMO01_…_000412', '08:15', '42 / 42', 'Imported', '#1F8A4C', '#E3F4EA')}
  ${row(224, 'UHCGD_837I_DEMO01_…_000413', '10:32', '17 / 18', '1 rejected', '#C0392B', '#FBE7E5')}
  ${row(284, 'UHCGD_837I_DEMO02_…_000098', '11:05', '9 / 9', 'Imported', '#1F8A4C', '#E3F4EA')}
  ${row(344, 'UHCGD_837I_DEMO01_…_000414', '12:40', '—', 'Processing', '#26408F', '#EEF1F9')}
  <g transform="translate(232 416)">
    <rect width="672" height="92" rx="12" fill="#FFF8E6" stroke="#F1D9A0"/>
    <text x="20" y="32" font-size="13" font-weight="700" fill="#8A5A00">Claim CLM-DEMO-7781 rejected</text>
    <text x="20" y="56" font-size="12" fill="#6B5A2E">E-112 NO_GOP: no guarantee of payment found on case C-DEMO-20931.</text>
    <text x="20" y="76" font-size="12" fill="#6B5A2E">Moved to quarantine. Retry after the GOP is issued.</text>
  </g>
</svg>`;
