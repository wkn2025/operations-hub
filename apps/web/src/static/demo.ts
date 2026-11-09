/** True in the GitHub Pages build (`VITE_STATIC_DEMO=1`): no server, a read-only snapshot of the seeded content. Vite inlines the
 * value, so the normal build drops every static-demo branch. */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

/** Fired on window whenever the static demo refuses a change (see ReadOnlyNotice). */
export const READ_ONLY_EVENT = 'ops:demo-read-only';

/** Snapshot file names by file id (id + extension, so Pages serves the right type); filled when the snapshot loads, which happens
 * before any article or file list can render. */
export const demoFileNames = new Map<string, string>();

/** Uploaded files live under demo-data/files/ in the static build; the server build keeps /api/files/<id>. */
export function fileUrl(url: string) {
  if (!STATIC_DEMO || !url.startsWith('/api/files/')) return url;
  const id = url.slice('/api/files/'.length);
  return `demo-data/files/${demoFileNames.get(id) ?? id}`;
}
