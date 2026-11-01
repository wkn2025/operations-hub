import type { Db } from '../db/client';
import { auditLog } from '../db/schema';

export interface AuditEntry { actorId: string | null; action: string; entity: string; entityId: string; summary: string }

/** Every write path calls this (inside its transaction). */
export function audit(db: Db, e: AuditEntry) {
  db.insert(auditLog).values({
    actorId: e.actorId, action: e.action, entity: e.entity, entityId: e.entityId,
    detail: JSON.stringify({ summary: e.summary }), createdAt: new Date().toISOString(),
  }).run();
}
