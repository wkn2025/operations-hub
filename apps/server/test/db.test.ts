import { describe, it, expect } from 'vitest';
import { createDb } from '../src/db/client';

describe('migrations', () => {
  it('create all tables and FTS5 on boot', () => {
    const { sqlite } = createDb(':memory:');
    const names = (sqlite.prepare("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map((r) => r.name);
    for (const t of ['users', 'editor_allowlist', 'categories', 'articles', 'revisions', 'tags', 'article_tags', 'article_links', 'files', 'article_files', 'flows', 'audit_log', 'settings', 'article_fts'])
      expect(names).toContain(t);
    sqlite.prepare("insert into article_fts(article_id,title,body,tags,category,client,terms) values ('a','Hello','world','t','c','cl','tm')").run();
    expect(sqlite.prepare("select article_id from article_fts where article_fts match 'hello'").all()).toHaveLength(1);
  });
  it('slug is unique on articles', () => {
    const { sqlite } = createDb(':memory:');
    const ins = () =>
      sqlite
        .prepare('insert into articles(id,slug,title,type,status,content,content_text,fields,revision,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?)')
        .run(crypto.randomUUID(), 's', 't', 'standard', 'draft', '{}', '', '{}', 1, 'n', 'n');
    ins();
    expect(ins).toThrow(/UNIQUE/);
  });
});
