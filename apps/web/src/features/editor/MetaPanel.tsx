import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Hash, Lock, Paperclip, Plus, Trash2, Upload, X } from 'lucide-react';
import { ARTICLE_TYPES, LIST_ITEM_MAX, TEMPLATE_FIELD_MAX, TEMPLATE_LABELS, type ArticleType, type PmNode, type TemplateFields } from '@ops/shared';
import { api, HttpError, useCategories, type Category, type FileRef } from '../../api/client';
import { LinkPicker } from './LinkPicker';
import { uploadFile } from './extensions/ImageUpload';

export interface Draft {
  title: string; type: ArticleType; categoryId: string | null; content: PmNode; fields: TemplateFields;
  tags: string[]; reviewDate: string | null; related: { id: string; title: string }[]; ownerId: string | null;
}
/** Keys: 'title' | 'tags' | 'validTo' | 'keyLimits' | any TEMPLATE_FIELD_MAX field name. */
export type MetaErrors = Partial<Record<string, string>>;
type MaxField = keyof typeof TEMPLATE_FIELD_MAX;

/** Labels of template fields, for messages ("Purpose wasn’t saved: …"). */
export const FIELD_LABELS: Record<string, string> = {
  summary: 'Summary', purpose: 'Purpose', scope: 'Scope', audience: 'Who uses this', verification: 'How to verify',
  client: 'Client name', contractRef: 'Contract reference', validFrom: 'Valid from', validTo: 'Valid to', region: 'Territory', keyLimits: 'Key limits',
  systems: 'Systems', version: 'Version', symptom: 'Symptom', cause: 'Likely cause', fix: 'Quick fix', flowId: 'Guided flow',
  term: 'Term', acronym: 'Acronym', definition: 'Definition', aliases: 'Also known as', relatedTerms: 'Related terms',
  title: 'Title', tags: 'Tags', reviewDate: 'Review by', related: 'Related articles', categoryId: 'Category', ownerId: 'Owner', type: 'Template',
};
const tooLong = (max: number) => `Keep it under ${max.toLocaleString('en-GB')} characters`;

/** Client-side checks mirroring the server schema; invalid parts are left out of the save so other edits still persist. */
export function validateMeta(d: Draft): MetaErrors {
  const e: MetaErrors = {};
  if (!d.title.trim()) e.title = 'Give the article a title.';
  else if (d.title.trim().length > 200) e.title = 'Keep the title under 200 characters.';
  if (d.tags.length > 30) e.tags = 'Use at most 30 tags.';
  else if (d.tags.some((t) => t.length > 40)) e.tags = 'Tags can be at most 40 characters.';
  for (const [k, max] of Object.entries(TEMPLATE_FIELD_MAX)) {
    const v = d.fields[k as MaxField];
    if (typeof v === 'string' && v.length > max) e[k] = tooLong(max);
  }
  if (d.type === 'client_terms') {
    const f = d.fields;
    if (f.validFrom && f.validTo && f.validTo < f.validFrom) e.validTo = 'The end date must be after the start date.';
    if (f.keyLimits?.some((k) => !k.label.trim())) e.keyLimits = 'Every key limit needs a label.';
    else if (f.keyLimits?.some((k) => k.label.length > LIST_ITEM_MAX || k.value.length > LIST_ITEM_MAX)) e.keyLimits = tooLong(LIST_ITEM_MAX);
  }
  return e;
}

/** Category options as an indented tree; archived categories (and anything under them) are left out. */
export function categoryOptions(cats: Category[]): { id: string; label: string; depth: number }[] {
  const out: { id: string; label: string; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const c of cats.filter((x) => x.parentId === parent && !x.archived).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))) {
      out.push({ id: c.id, label: c.name, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

const inputCls = 'w-full rounded-[10px] bg-white px-3 py-2 text-[14px] text-neutral-900 shadow-sm ring-1 ring-inset ring-neutral-200 transition-shadow placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-neutral-50 disabled:text-neutral-500';

function Field({ label, error, hint, children, id }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-neutral-700">{label}</label>
      {children}
      {error ? <p role="alert" className="mt-1.5 text-xs text-danger">{error}</p> : hint ? <p className="mt-1.5 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function Text({ label, value, onChange, multiline, type = 'text', error, hint, placeholder, disabled, max }: {
  label: string; value: string | undefined; onChange: (v: string) => void; multiline?: boolean; type?: string; error?: string; hint?: ReactNode; placeholder?: string; disabled?: boolean;
  /** shared server limit (TEMPLATE_FIELD_MAX): maxLength + a counter from 80% */
  max?: number;
}) {
  const id = useId();
  const len = (value ?? '').length;
  const counter = max && len >= max * 0.8
    ? <span className={clsx('float-right tabular', len > max ? 'font-medium text-danger' : 'text-ink-muted')}>{len.toLocaleString('en-GB')} / {max.toLocaleString('en-GB')}</span> : null;
  return (
    <Field label={label} error={error} hint={hint} id={id}>
      {multiline
        ? <textarea id={id} rows={3} value={value ?? ''} disabled={disabled} placeholder={placeholder} maxLength={max} onChange={(e) => onChange(e.target.value)} className={clsx(inputCls, 'resize-y leading-relaxed')} aria-invalid={!!error} />
        : <input id={id} type={type} value={value ?? ''} disabled={disabled} placeholder={placeholder} maxLength={max} onChange={(e) => onChange(e.target.value)} className={inputCls} aria-invalid={!!error} />}
      {counter && <p className="mt-1 text-xs">{counter}&nbsp;</p>}
    </Field>
  );
}

/** Comma-separated list; keeps the typed text locally so "a, " can be typed. */
function ListText({ label, value, onChange, placeholder, disabled }: { label: string; value: string[] | undefined; onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean }) {
  const [text, setText] = useState((value ?? []).join(', '));
  return <Text label={label} value={text} placeholder={placeholder} disabled={disabled} hint="Separate with commas"
    onChange={(v) => { setText(v); onChange(v.split(',').map((s) => s.trim()).filter(Boolean)); }} />;
}

function Section({ title, children, icon }: { title: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <section className="border-t border-neutral-200/70 px-5 py-5 first:border-t-0">
      <h3 className="mb-3.5 flex items-center gap-2 text-[13px] font-semibold text-neutral-900">{icon}{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function MetaPanel({ draft, onChange, articleId, slug, published, disabled, canChangeOwner = true }: {
  draft: Draft; onChange: (d: Draft) => void; articleId?: string; slug?: string; published?: boolean; disabled?: boolean; canChangeOwner?: boolean;
}) {
  const errors = validateMeta(draft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
  const setF = (patch: Partial<TemplateFields>) => onChange({ ...draft, fields: { ...draft.fields, ...patch } });
  const f = draft.fields;
  const cats = useCategories();
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api<{ tags: string[] }>('/api/tags').then((r) => r.tags), staleTime: 60_000 });
  const owners = useQuery({ queryKey: ['owners'], queryFn: () => api<{ owners: { id: string; name: string; email: string }[] }>('/api/owners').then((r) => r.owners), staleTime: 60_000 });
  const catOpts = useMemo(() => categoryOptions(cats.data ?? []), [cats.data]);
  const ids = { type: useId(), cat: useId(), owner: useId(), tag: useId(), tagList: useId() };
  const [tagText, setTagText] = useState('');
  const [relatedOpen, setRelatedOpen] = useState(false);

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (t && !draft.tags.includes(t)) set('tags', [...draft.tags, t]);
    setTagText('');
  };

  return (
    <div className="text-[14px]">
      <Section title="Details">
        <Field label="Template" id={ids.type}>
          <select id={ids.type} className={inputCls} value={draft.type} disabled={disabled} onChange={(e) => set('type', e.target.value as ArticleType)}>
            {ARTICLE_TYPES.map((t) => <option key={t} value={t}>{TEMPLATE_LABELS[t]}</option>)}
          </select>
        </Field>
        <Field label="Category" id={ids.cat}>
          <select id={ids.cat} className={inputCls} value={draft.categoryId ?? ''} disabled={disabled} onChange={(e) => set('categoryId', e.target.value || null)}>
            <option value="">No category</option>
            {catOpts.map((c) => <option key={c.id} value={c.id}>{'   '.repeat(c.depth) + c.label}</option>)}
          </select>
        </Field>
        <Field label="Owner" id={ids.owner} hint={canChangeOwner ? 'Responsible for keeping this article accurate' : 'Only the owner or an admin can hand this article over'}>
          <select id={ids.owner} className={inputCls} value={draft.ownerId ?? ''} disabled={disabled || !owners.data || !canChangeOwner} onChange={(e) => set('ownerId', e.target.value || null)}>
            {!draft.ownerId && <option value="">Not set</option>}
            {(owners.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Text label="Review by" type="date" value={draft.reviewDate ?? ''} disabled={disabled} onChange={(v) => set('reviewDate', v || null)} hint="You’ll see it under “Due for review” 30 days before" />
        {slug && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-neutral-700">Address</p>
            <p className="flex items-center gap-2 truncate rounded-[10px] bg-neutral-50 px-3 py-2 font-mono text-[12.5px] text-neutral-600 ring-1 ring-inset ring-neutral-200/80">
              {published && <Lock size={13} className="shrink-0 text-neutral-400" aria-label="Locked" />}<span className="truncate">/article/{slug}</span>
            </p>
            <p className="mt-1.5 text-xs text-ink-muted">{published ? 'Fixed since publishing, so existing links keep working.' : 'Follows the title until the article is published.'}</p>
          </div>
        )}
      </Section>

      <Section title="Tags">
        <div>
          {draft.tags.length > 0 && (
            <ul aria-label="Tags" className="mb-2.5 flex flex-wrap gap-1.5">
              {draft.tags.map((t) => (
                <li key={t} className="inline-flex items-center gap-0.5 rounded-full bg-neutral-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-neutral-700">
                  <Hash size={11} className="text-neutral-400" aria-hidden />{t}
                  {!disabled && <button type="button" aria-label={`Remove tag ${t}`} onClick={() => set('tags', draft.tags.filter((x) => x !== t))} className="ml-0.5 rounded-full p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"><X size={11} /></button>}
                </li>
              ))}
            </ul>
          )}
          <label htmlFor={ids.tag} className="sr-only">Add tag</label>
          <input id={ids.tag} list={ids.tagList} value={tagText} disabled={disabled} placeholder="Add a tag and press Enter" className={inputCls}
            onChange={(e) => setTagText(e.target.value)} onBlur={() => tagText && addTag(tagText)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagText); } }} aria-invalid={!!errors.tags} />
          <datalist id={ids.tagList}>{(tags.data ?? []).filter((t) => !draft.tags.includes(t)).map((t) => <option key={t} value={t} />)}</datalist>
          {errors.tags && <p role="alert" className="mt-1.5 text-xs text-danger">{errors.tags}</p>}
        </div>
      </Section>

      <Section title={`${TEMPLATE_LABELS[draft.type]} fields`}>
        <Text label="Summary" multiline value={f.summary} max={TEMPLATE_FIELD_MAX.summary} error={errors.summary} disabled={disabled} onChange={(v) => setF({ summary: v })} placeholder="One sentence shown under the title" />
        <TemplateFieldsForm draft={draft} setF={setF} errors={errors} disabled={disabled} />
      </Section>

      <Section title="Related articles">
        {draft.related.length > 0 && (
          <ul className="space-y-1">
            {draft.related.map((r) => (
              <li key={r.id} className="group flex items-center gap-2 rounded-[10px] bg-neutral-50 px-3 py-2 ring-1 ring-inset ring-neutral-200/70">
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-neutral-800">{r.title}</span>
                {!disabled && <button type="button" aria-label={`Remove related ${r.title}`} onClick={() => set('related', draft.related.filter((x) => x.id !== r.id))} className="rounded-md p-1 text-neutral-400 hover:bg-white hover:text-danger"><X size={13} /></button>}
              </li>
            ))}
          </ul>
        )}
        {!disabled && (
          <button type="button" onClick={() => setRelatedOpen(true)} className="flex items-center gap-1.5 text-[13px] font-medium text-primary hover:text-primary-hover">
            <Plus size={14} aria-hidden /> Add related article
          </button>
        )}
        {draft.related.length === 0 && <p className="text-xs text-ink-muted">Without picks, readers see other articles from the same category.</p>}
        <LinkPicker open={relatedOpen} onOpenChange={setRelatedOpen} title="Add a related article" exclude={[...(articleId ? [articleId] : []), ...draft.related.map((r) => r.id)]}
          onPick={(a) => set('related', [...draft.related, a])} />
      </Section>

      <Section title="Attachments" icon={<Paperclip size={14} className="text-neutral-400" aria-hidden />}>
        {articleId ? <Attachments articleId={articleId} disabled={disabled} /> : <p className="text-xs text-ink-muted">Attachments can be added once the draft is saved.</p>}
      </Section>
    </div>
  );
}

function TemplateFieldsForm({ draft, setF, errors, disabled }: { draft: Draft; setF: (p: Partial<TemplateFields>) => void; errors: MetaErrors; disabled?: boolean }) {
  const f = draft.fields, d = disabled;
  switch (draft.type) {
    case 'work_instruction': return (<>
      <Text label="Purpose" multiline value={f.purpose} max={TEMPLATE_FIELD_MAX.purpose} error={errors.purpose} disabled={d} onChange={(v) => setF({ purpose: v })} placeholder="What this procedure achieves" />
      <Text label="Scope" multiline value={f.scope} max={TEMPLATE_FIELD_MAX.scope} error={errors.scope} disabled={d} onChange={(v) => setF({ scope: v })} placeholder="What is in and out" />
      <Text label="Who uses this" value={f.audience} max={TEMPLATE_FIELD_MAX.audience} error={errors.audience} disabled={d} onChange={(v) => setF({ audience: v })} placeholder="e.g. Claims handlers" />
      <Text label="How to verify" multiline value={f.verification} max={TEMPLATE_FIELD_MAX.verification} error={errors.verification} disabled={d} onChange={(v) => setF({ verification: v })} />
    </>);
    case 'client_terms': return (<>
      <Text label="Client name" value={f.client} max={TEMPLATE_FIELD_MAX.client} error={errors.client} disabled={d} onChange={(v) => setF({ client: v })} placeholder="Fictional client (DEMO)" />
      <Text label="Contract reference" value={f.contractRef} max={TEMPLATE_FIELD_MAX.contractRef} error={errors.contractRef} disabled={d} onChange={(v) => setF({ contractRef: v })} />
      <div className="grid grid-cols-2 gap-3">
        <Text label="Valid from" type="date" value={f.validFrom} disabled={d} onChange={(v) => setF({ validFrom: v || undefined })} />
        <Text label="Valid to" type="date" value={f.validTo} disabled={d} onChange={(v) => setF({ validTo: v || undefined })} error={errors.validTo} />
      </div>
      <Text label="Territory" value={f.region} max={TEMPLATE_FIELD_MAX.region} error={errors.region} disabled={d} onChange={(v) => setF({ region: v })} />
      <KeyLimits value={f.keyLimits ?? []} onChange={(v) => setF({ keyLimits: v })} error={errors.keyLimits} disabled={d} />
      <p className="text-xs text-ink-muted">Put the coverage table and exclusions in the text, or type <kbd className="font-sans">/table</kbd>.</p>
    </>);
    case 'technical': return (<>
      <ListText label="Systems" value={f.systems} disabled={d} onChange={(v) => setF({ systems: v })} placeholder="Globo, ECNet" />
      <Text label="Version" value={f.version} max={TEMPLATE_FIELD_MAX.version} error={errors.version} disabled={d} onChange={(v) => setF({ version: v })} />
    </>);
    case 'troubleshooting': return (<>
      <Text label="Symptom" multiline value={f.symptom} max={TEMPLATE_FIELD_MAX.symptom} error={errors.symptom} disabled={d} onChange={(v) => setF({ symptom: v })} placeholder="What the user sees" />
      <Text label="Likely cause" multiline value={f.cause} max={TEMPLATE_FIELD_MAX.cause} error={errors.cause} disabled={d} onChange={(v) => setF({ cause: v })} />
      <Text label="Quick fix" multiline value={f.fix} max={TEMPLATE_FIELD_MAX.fix} error={errors.fix} disabled={d} onChange={(v) => setF({ fix: v })} />
      <Text label="Guided flow" value={f.flowId} max={TEMPLATE_FIELD_MAX.flowId} error={errors.flowId} disabled={d} onChange={(v) => setF({ flowId: v || undefined })} placeholder="Flow ID" hint="Optional. Normally you link a flow from the flow editor (Guided flows) instead of typing an ID here." />
    </>);
    case 'glossary': return (<>
      <Text label="Term" value={f.term} max={TEMPLATE_FIELD_MAX.term} error={errors.term} disabled={d} onChange={(v) => setF({ term: v })} />
      <Text label="Acronym" value={f.acronym} max={TEMPLATE_FIELD_MAX.acronym} error={errors.acronym} disabled={d} onChange={(v) => setF({ acronym: v })} placeholder="e.g. GOP" />
      <Text label="Definition" multiline value={f.definition} max={TEMPLATE_FIELD_MAX.definition} error={errors.definition} disabled={d} onChange={(v) => setF({ definition: v })} />
      <ListText label="Also known as" value={f.aliases} disabled={d} onChange={(v) => setF({ aliases: v })} />
      <ListText label="Related terms" value={f.relatedTerms} disabled={d} onChange={(v) => setF({ relatedTerms: v })} />
    </>);
    default: return null;
  }
}

function KeyLimits({ value, onChange, error, disabled }: { value: { label: string; value: string }[]; onChange: (v: { label: string; value: string }[]) => void; error?: string; disabled?: boolean }) {
  const upd = (i: number, p: Partial<{ label: string; value: string }>) => onChange(value.map((k, j) => (j === i ? { ...k, ...p } : k)));
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium text-neutral-700">Key limits</legend>
      <div className="space-y-2">
        {value.map((k, i) => (
          <div key={i} className="flex gap-2">
            <input aria-label={`Limit ${i + 1} label`} placeholder="Annual limit" value={k.label} disabled={disabled} onChange={(e) => upd(i, { label: e.target.value })} className={clsx(inputCls, 'min-w-0 flex-1')} />
            <input aria-label={`Limit ${i + 1} value`} placeholder="€ 50,000" value={k.value} disabled={disabled} onChange={(e) => upd(i, { value: e.target.value })} className={clsx(inputCls, 'min-w-0 flex-1')} />
            {!disabled && <button type="button" aria-label={`Remove limit ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="shrink-0 rounded-[10px] px-2 text-neutral-400 hover:bg-neutral-100 hover:text-danger"><Trash2 size={14} /></button>}
          </div>
        ))}
      </div>
      {error && <p role="alert" className="mt-1.5 text-xs text-danger">{error}</p>}
      {!disabled && value.length < 6 && (
        <button type="button" onClick={() => onChange([...value, { label: '', value: '' }])} className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-primary hover:text-primary-hover">
          <Plus size={14} aria-hidden /> Add limit
        </button>
      )}
    </fieldset>
  );
}

const size = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

function Attachments({ articleId, disabled }: { articleId: string; disabled?: boolean }) {
  const qc = useQueryClient();
  const files = useQuery({ queryKey: ['files', articleId], queryFn: () => api<{ files: FileRef[] }>(`/api/articles/${articleId}/files`).then((r) => r.files) });
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['files', articleId] });

  const add = async (list: FileList | null) => {
    setErr(null); setBusy(true);
    try {
      for (const file of Array.from(list ?? [])) {
        const f = await uploadFile(file);
        await api(`/api/articles/${articleId}/files/${f.id}`, { method: 'POST' });
      }
    } catch (e) { setErr(uploadMessage(e)); } finally { setBusy(false); if (input.current) input.current.value = ''; void refresh(); }
  };
  const detach = async (f: FileRef) => {
    setErr(null);
    try { await api(`/api/articles/${articleId}/files/${f.id}`, { method: 'DELETE' }); } catch (e) { setErr(uploadMessage(e)); }
    void refresh();
  };

  return (
    <div>
      {(files.data ?? []).length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {files.data!.map((f) => (
            <li key={f.id} className="flex items-center gap-2.5 rounded-[10px] bg-white px-2.5 py-2 shadow-sm ring-1 ring-neutral-200/80">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-neutral-50 text-[9px] font-bold uppercase text-neutral-500 ring-1 ring-inset ring-neutral-200">{f.name.split('.').pop()?.slice(0, 4)}</span>
              <span className="min-w-0 flex-1">
                <a href={f.url} className="block truncate text-[13px] font-medium text-neutral-800 hover:text-primary">{f.name}</a>
                <span className="text-[11.5px] text-ink-muted tabular">{size(f.size)}{f.source === 'embedded' && ' · shown in the text'}</span>
              </span>
              {!disabled && f.source !== 'embedded' && (
                <button type="button" aria-label={`Remove attachment ${f.name}`} onClick={() => detach(f)} className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-danger"><X size={13} /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (<>
        <input ref={input} type="file" multiple className="sr-only" aria-label="Upload attachment" onChange={(e) => add(e.target.files)}
          accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.xlsx,.pptx,.csv,.txt" />
        <button type="button" disabled={busy} onClick={() => input.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-neutral-300 px-3 py-3 text-[13px] font-medium text-neutral-600 transition-colors hover:border-primary/40 hover:bg-primary-soft/50 hover:text-primary disabled:opacity-60">
          <Upload size={14} aria-hidden /> {busy ? 'Uploading…' : 'Upload a file'}
        </button>
        <p className="mt-1.5 text-xs text-ink-muted">PDF, Office, CSV, text or images up to 15 MB.</p>
      </>)}
      {err && <p role="alert" className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  );
}

export function uploadMessage(e: unknown): string {
  if (e instanceof HttpError) {
    if (e.status === 413) return 'That file is larger than 15 MB.';
    if (e.status === 415) return 'That file type isn’t allowed. Use PDF, Office, CSV, text or PNG/JPG/GIF/WebP images.';
    if (e.status === 403) return 'You don’t have permission to upload files.';
    if (e.status === 409) return 'That file is shown in the text. Remove it there first.';
  }
  // plain Error = our own user-facing message (e.g. wrong type pasted); TypeError etc. = network failure
  return e instanceof Error && e.constructor === Error ? e.message : 'Upload failed. Check your connection and try again.';
}
