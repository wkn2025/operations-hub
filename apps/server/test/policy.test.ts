import { describe, it, expect } from 'vitest';
import { can } from '../src/auth/policy';
import type { User } from '@ops/shared';

const u = (role: User['role']): User => ({ id: role, email: `${role}@x.test`, name: role, role });
const [admin, editor, viewer] = [u('admin'), u('editor'), u('viewer')];

describe('can()', () => {
  it('anonymous can do nothing, even read published', () => {
    expect(can(null, 'article:read', { status: 'published' })).toBe(false);
    expect(can(null, 'article:read', { status: 'draft' })).toBe(false);
    expect(can(null, 'article:write')).toBe(false);
  });
  it('viewer reads only published, writes nothing', () => {
    expect(can(viewer, 'article:read', { status: 'published' })).toBe(true);
    for (const s of ['draft', 'in_review', 'archived'] as const)
      expect(can(viewer, 'article:read', { status: s })).toBe(false);
    for (const a of ['article:write', 'article:publish', 'article:submit', 'article:archive', 'file:upload', 'admin'] as const)
      expect(can(viewer, a)).toBe(false);
  });
  it('editor reads all, writes, uploads, never admin', () => {
    expect(can(editor, 'article:read', { status: 'draft' })).toBe(true);
    expect(can(editor, 'article:write', { status: 'draft' })).toBe(true);
    expect(can(editor, 'article:write', { status: 'archived' })).toBe(false);
    expect(can(editor, 'file:upload')).toBe(true);
    expect(can(editor, 'admin')).toBe(false);
  });
  it('editor publish depends on requireApproval; submit always ok', () => {
    expect(can(editor, 'article:publish', {}, { requireApproval: false })).toBe(true);
    expect(can(editor, 'article:publish', {}, { requireApproval: true })).toBe(false);
    expect(can(editor, 'article:submit')).toBe(true);
  });
  it('admin can do everything', () => {
    expect(can(admin, 'article:publish', {}, { requireApproval: true })).toBe(true);
    expect(can(admin, 'article:read', { status: 'archived' })).toBe(true);
    expect(can(admin, 'admin')).toBe(true);
  });
  it('flow actions mirror the article rules', () => {
    expect(can(viewer, 'flow:read', { status: 'published' })).toBe(true);
    expect(can(viewer, 'flow:read', { status: 'draft' })).toBe(false);
    expect(can(viewer, 'flow:write', { status: 'draft' })).toBe(false);
    expect(can(editor, 'flow:write', { status: 'draft' })).toBe(true);
    expect(can(editor, 'flow:write', { status: 'published' }, { requireApproval: true })).toBe(false);
    expect(can(editor, 'flow:publish', {}, { requireApproval: true })).toBe(false);
    expect(can(editor, 'flow:archive', { status: 'published' }, { requireApproval: true })).toBe(false);
    expect(can(admin, 'flow:publish', {}, { requireApproval: true })).toBe(true);
  });
});
