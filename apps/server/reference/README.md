# Reference code lists (Diagnosis & Service codes lookup)

Read by `apps/server/src/services/codes.ts` on the first `GET /api/codes`, kept in memory.

| File | Content | Source |
|---|---|---|
| `icd10cm-2027.tsv.gz` | ICD-10-CM FY2027 (effective 1 Oct 2026), 98,403 rows: `code` (no dot) TAB `1` billable / `0` category header TAB long description | CMS "2027 Code Descriptions in Tabular Order", `icd10cm_order_2027.txt` (https://www.cms.gov/files/zip/2027-code-descriptions-tabular-order.zip). US government work, public domain. |
| `cpt-hcpcs.tsv` | 2,354 rows: `code` TAB `CPT` or `HCPCS` TAB plain short description | Company file `CptCodes_backup_v3.xlsx`, column G (ShortDescription); our own wording, not AMA descriptors. CPT Cat II/III and PLA rows are labelled CPT. |

Yearly update: ICD-10-CM changes every 1 October. Regenerate the TSV from the new order file
(columns: code = chars 7–13, flag = char 15, long description = char 78 onwards), gzip it, and update the file name in `codes.ts`.
