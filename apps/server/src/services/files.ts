import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { User } from '@ops/shared';
import { can } from '../auth/policy';
import { articleFiles, files } from '../db/schema';
import { ApiError, notFound, readable, requireApproval, type Svc } from './articles';
import { audit } from './audit';
import { extractFileIds } from './pm-text';

const MAX_NAME = 120;
const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv', txt: 'text/plain',
};
const INLINE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** Content type from magic bytes only (client mime is ignored). null = not on the allowlist. */
export function sniff(b: Buffer): string | null {
  const at = (off: number, s: string) => b.subarray(off, off + s.length).toString('latin1') === s;
  if (at(1, 'PNG') && b[0] === 0x89) return EXT_MIME.png;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return EXT_MIME.jpg;
  if (at(0, 'GIF87a') || at(0, 'GIF89a')) return EXT_MIME.gif;
  if (at(0, 'RIFF') && at(8, 'WEBP')) return EXT_MIME.webp;
  if (at(0, '%PDF-')) return EXT_MIME.pdf;
  if (at(0, 'PK\x03\x04')) { // ponytail: substring scan of the zip; a crafted zip could fake it but is still served as a nosniff attachment
    const t = b.toString('latin1');
    if (t.includes('word/document.xml')) return EXT_MIME.docx;
    if (t.includes('xl/workbook.xml')) return EXT_MIME.xlsx;
    if (t.includes('ppt/presentation.xml')) return EXT_MIME.pptx;
    return null;
  }
  // plain text/csv: valid UTF-8, no NUL, and not markup
  if (b.includes(0)) return null;
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return null; }
  if (/^\s*</.test(text)) return null;
  return 'text/plain';
}

export function cleanName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const n = (raw.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f"<>:|?*]/g, '').replace(/^\.+/, '').trim().slice(-MAX_NAME);
  return n || 'file';
}

const root = (s: Svc & { config: { dataDir: string } }) => resolve(s.config.dataDir, 'uploads');
type FileSvc = Svc & { config: { dataDir: string } };
const diskPath = (s: FileSvc, id: string) => {
  const p = resolve(root(s), id);
  if (!p.startsWith(root(s) + sep)) throw notFound();
  return p;
};

export async function saveUpload(s: FileSvc, user: User, rawName: string, data: Buffer) {
  if (!can(user, 'file:upload', {})) throw new ApiError(403, { error: 'forbidden' });
  const name = cleanName(rawName), ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (!data.length) throw new ApiError(400, { error: 'invalid', message: 'empty file' });
  const sniffed = sniff(data);
  const want = EXT_MIME[ext];
  // text/csv share the text sniff; every other type must match its extension exactly
  const ok = sniffed && want && (sniffed === want || (sniffed === 'text/plain' && want === 'text/csv'));
  if (!ok) throw new ApiError(415, { error: 'unsupported_type', message: 'file type not allowed or does not match its content' });
  return storeFile(s, user, name, want, data);
}

/**
 * Writes bytes + row with a mime the caller vouches for. User uploads reach it only through saveUpload's sniffing;
 * the seed uses it directly for its own trusted SVG illustrations (served as nosniff attachment + CSP sandbox).
 */
export async function storeFile(s: FileSvc, user: User, name: string, mime: string, data: Buffer) {
  const id = crypto.randomUUID(), now = new Date().toISOString();
  // ponytail: a crash between the write and the insert leaves an orphan blob; no startup sweep (add one if orphans matter)
  await mkdir(root(s), { recursive: true });
  await writeFile(diskPath(s, id), data, { flag: 'wx' });
  try {
    s.sqlite.transaction(() => {
      s.db.insert(files).values({ id, name, mime, size: data.length, path: id, uploadedBy: user.id, createdAt: now }).run();
      audit(s.db, { actorId: user.id, action: 'file.upload', entity: 'file', entityId: id, summary: `Uploaded "${name}" (${data.length} bytes)` });
    })();
  } catch (e) { await unlink(diskPath(s, id)).catch(() => {}); throw e; }
  return { id, url: `/api/files/${id}`, name, mime, size: data.length };
}

/** Editors/admins: any file. Viewers: only files of a published, visible article. */
export function canFetch(s: Svc, user: User, fileId: string): boolean {
  if (user.role !== 'viewer') return true;
  return s.db.select().from(articleFiles).where(eq(articleFiles.fileId, fileId)).all().some((r) => !!readable(s, user, r.articleId));
}

export async function openFile(s: FileSvc, user: User, id: string) {
  const f = s.db.select().from(files).where(eq(files.id, id)).get();
  if (!f || !canFetch(s, user, id)) throw notFound();
  const data = await readFile(diskPath(s, f.path)).catch(() => { throw notFound(); });
  return { f, data, inline: INLINE.has(f.mime) };
}

const fileCols = (f: typeof files.$inferSelect) => ({ id: f.id, url: `/api/files/${f.id}`, name: f.name, mime: f.mime, size: f.size, createdAt: f.createdAt });

function writableArticle(s: Svc, user: User, articleId: string) {
  const a = readable(s, user, articleId);
  if (!a) throw notFound();
  if (!can(user, 'article:write', { status: a.status, ownerId: a.ownerId ?? undefined }, { requireApproval: requireApproval(s.sqlite) })) throw new ApiError(403, { error: 'forbidden' });
  return a;
}

export function attach(s: Svc, user: User, articleId: string, fileId: string, on: boolean) {
  s.sqlite.transaction(() => {
    const a = writableArticle(s, user, articleId);
    if (!s.db.select({ id: files.id }).from(files).where(eq(files.id, fileId)).get()) throw notFound();
    const cur = s.db.select().from(articleFiles).where(and(eq(articleFiles.articleId, articleId), eq(articleFiles.fileId, fileId))).get();
    if (on) {
      if (!cur) s.db.insert(articleFiles).values({ articleId, fileId, source: 'attached' }).run();
      else if (cur.source === 'embedded') s.db.update(articleFiles).set({ source: 'attached' }).where(and(eq(articleFiles.articleId, articleId), eq(articleFiles.fileId, fileId))).run();
    } else if (cur?.source === 'embedded') throw new ApiError(409, { error: 'embedded', message: 'file is embedded in the content; remove it there' });
    else if (cur && extractFileIds(JSON.parse(a.content)).includes(fileId)) s.db.update(articleFiles).set({ source: 'embedded' }).where(and(eq(articleFiles.articleId, articleId), eq(articleFiles.fileId, fileId))).run(); // still shown in content
    else if (cur) s.db.delete(articleFiles).where(and(eq(articleFiles.articleId, articleId), eq(articleFiles.fileId, fileId))).run();
    audit(s.db, { actorId: user.id, action: on ? 'file.attach' : 'file.detach', entity: 'article', entityId: articleId, summary: `${on ? 'Attached' : 'Detached'} file ${fileId} on "${a.title}"` });
  })();
}

export function articleFileList(s: Svc, user: User, articleId: string) {
  if (!readable(s, user, articleId)) throw notFound();
  return s.sqlite.prepare('select f.*, x.source from article_files x join files f on f.id = x.file_id where x.article_id = ? order by f.created_at').all(articleId)
    .map((r: any) => ({ ...fileCols({ id: r.id, name: r.name, mime: r.mime, size: r.size, path: r.path, uploadedBy: r.uploaded_by, createdAt: r.created_at }), source: r.source as 'attached' | 'embedded' }));
}

export function adminFiles(s: Svc) {
  return (s.sqlite.prepare(
    `select f.id, f.name, f.mime, f.size, f.uploaded_by as uploadedBy, f.created_at as createdAt,
            (select count(*) from article_files x where x.file_id = f.id) as "references"
     from files f order by f.created_at desc`).all() as any[]).map((r) => ({ ...r, url: `/api/files/${r.id}` }));
}

export async function deleteFile(s: FileSvc, user: User, id: string) {
  const f = s.sqlite.transaction(() => {
    const row = s.db.select().from(files).where(eq(files.id, id)).get();
    if (!row) throw notFound();
    const refs = s.db.select().from(articleFiles).where(eq(articleFiles.fileId, id)).all().length;
    if (refs) throw new ApiError(409, { error: 'file_in_use', references: refs });
    s.db.delete(files).where(eq(files.id, id)).run();
    audit(s.db, { actorId: user.id, action: 'file.delete', entity: 'file', entityId: id, summary: `Deleted "${row.name}"` });
    return row;
  })();
  await unlink(diskPath(s, f.path)).catch(() => {}); // row is gone either way; a missing blob is not an error
}
