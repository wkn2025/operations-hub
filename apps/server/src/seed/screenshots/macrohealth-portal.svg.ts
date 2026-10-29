import { frame, grid, heading, nav, note, status } from './frame';

/** Illustrative DEMO screenshot of a fictional MacroHealth EDI exchange portal. */
export const macroHealthPortalSvg = frame('MacroHealth Exchange', `${nav(['File exchange', 'Acknowledgements', 'Trading partners', 'Certificates'], 0)}
  ${heading('File exchange · outbound to us', 'Trading partner ID DEMO-OPS-01 · polling every 15 min')}
  ${grid(140, [24, 300, 410, 568], ['File', 'Type', 'Received', 'Status'], [
    ['MH_837P_DEMO_20261029_0007.x12', '837P', '07:45', 'Accepted'],
    ['MH_837I_DEMO_20261029_0008.x12', '837I', '09:10', 'Accepted'],
    ['MH_837P_DEMO_20261029_0009.x12', '837P', '11:25', 'Rejected 999'],
    ['MH_837I_DEMO_20261029_0010.x12', '837I', '13:02', 'Waiting'],
  ], status)}
  ${note(370, 'File 0009 rejected: IK5*R', ['IK3*NM1*14**8 - segment NM1 has data element errors (member ID too long).', 'MacroHealth will resend with a new control number. Do not edit the file.'])}`);
