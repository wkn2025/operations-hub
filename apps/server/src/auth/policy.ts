import type { preHandlerHookHandler } from 'fastify';
import type { Action, ArticleStatus, Role, User } from '@ops/shared';

export interface Resource { status?: ArticleStatus; ownerId?: string }
export interface PolicyOpts { requireApproval?: boolean }

/** Single authorization decision point. Anonymous (null) is treated as viewer-without-write. */
export function can(user: User | null, action: Action, resource: Resource = {}, opts: PolicyOpts = {}): boolean {
  const role = user?.role;
  if (role === 'admin') return true;
  const isEditor = role === 'editor';
  switch (action) {
    case 'article:read': return resource.status === 'published' || (isEditor && resource.status !== undefined);
    case 'article:write': return isEditor && resource.status !== 'archived';
    case 'article:publish': return isEditor && !opts.requireApproval;
    case 'article:submit':
    case 'article:archive':
    case 'file:upload': return isEditor;
    default: return false; // 'admin'
  }
}

export const requireRole = (...roles: Role[]): preHandlerHookHandler => async (req, reply) => {
  if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  if (!roles.includes(req.user.role)) return reply.code(403).send({ error: 'forbidden' });
};
