import { beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { mockFetch, renderApp } from '../../test/utils';
import { EditFlow } from './FlowEditor';
import type { FlowView } from '../../api/client';

beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });

const me = (role: string) => ({ user: { id: 'u1', email: 'e@x.test', name: 'Ed', role }, authMode: 'dev', demo: true });
const flow = (over: Partial<FlowView> = {}): FlowView => ({
  id: 'f1', slug: 'f1', title: 'Invoice problems', status: 'draft', revision: 3, startId: 'q1', articleId: null, article: null, articles: {},
  updatedAt: '2026-10-29T10:00:00Z', publishedAt: null, permissions: { write: true, publish: true, submit: true, archive: true },
  nodes: [
    { id: 'q1', kind: 'question', text: 'Is there a GOP?', options: [{ label: 'Yes', to: 'r1' }, { label: 'No', to: 'r2' }] },
    { id: 'r1', kind: 'result', text: 'Register it', severity: 'success' },
    { id: 'r2', kind: 'result', text: 'Stop and escalate', severity: 'warning' },
    { id: 'q2', kind: 'question', text: 'Dangling question?' },
  ],
  ...over,
});

const mount = (role = 'editor', f = flow()) => {
  const fetchMock = mockFetch({ '/api/me': me(role), '/api/flows/f1': f, '/api/articles': { articles: [] }, '/api/search': { groups: [] } });
  renderApp(<Routes><Route path="/flows/:id/edit" element={<EditFlow />} /></Routes>, '/flows/f1/edit');
  return fetchMock;
};

describe('FlowEditor', () => {
  it('viewers get the forbidden page', async () => {
    mount('viewer');
    expect(await screen.findByRole('heading', { name: /Editing isn.t available/ })).toBeInTheDocument();
  });

  it('lists steps as cards, with live checks that jump to the offending step', async () => {
    const u = userEvent.setup();
    mount();
    await screen.findByDisplayValue('Invoice problems');
    expect(document.getElementById('node-q1')).toBeTruthy();
    const checks = screen.getByRole('list', { name: 'Problems' });
    const err = within(checks).getAllByRole('button').find((b) => /dead end/.test(b.textContent ?? ''))!;
    expect(err).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Checks/ })).toHaveTextContent('1'); // the dead end; the unreachable warning is not counted
    await u.click(err);
    const card = document.getElementById('node-q2')!;
    await waitFor(() => expect(within(card).getByLabelText('Question')).toHaveFocus());
  });

  it('adds an answer that creates a new result, and autosaves with baseRevision', async () => {
    const u = userEvent.setup();
    const fetchMock = mount();
    await screen.findByDisplayValue('Invoice problems');
    const card = document.getElementById('node-q1')!;
    await u.click(within(card).getByRole('button', { name: /Add answer/ }));
    await u.type(within(card).getByLabelText('Answer 3 label'), 'Maybe');
    await u.selectOptions(within(card).getByLabelText('Answer 3 goes to'), '__new:result');
    expect(document.getElementById('node-r3')).toBeTruthy();
    expect((within(card).getByLabelText('Answer 3 goes to') as HTMLSelectElement).value).toBe('r3');
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(patch).toBeTruthy();
      const body = JSON.parse(String(patch![1]!.body));
      expect(body.baseRevision).toBe(3);
      expect(body.nodes.find((n: any) => n.id === 'q1').options).toHaveLength(3);
    }, { timeout: 4000 });
  });

  it('deleting a step says how many answers lead there and removes them', async () => {
    const u = userEvent.setup();
    mount();
    await screen.findByDisplayValue('Invoice problems');
    await u.click(within(document.getElementById('node-r1')!).getByRole('button', { name: 'Delete step' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('1 answer lead here and will be removed');
    await u.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete step' }));
    await waitFor(() => expect(document.getElementById('node-r1')).toBeNull());
    expect(screen.getAllByRole('status').map((e) => e.textContent).join()).toMatch(/1 answer that led to it was removed/);
  });

  it('the Test run tab runs the unsaved draft', async () => {
    const u = userEvent.setup();
    mount();
    await screen.findByDisplayValue('Invoice problems');
    await u.click(screen.getByRole('tab', { name: 'Test run' }));
    const panel = screen.getByRole('tabpanel');
    await u.click(await within(panel).findByRole('button', { name: /2.*No/ }));
    expect(await within(panel).findByTestId('flow-result')).toHaveAttribute('data-severity', 'warning');
  });

  it('only offers the actions the server allows', async () => {
    mount('editor', flow({ permissions: { write: true, publish: false, submit: true, archive: true } }));
    await screen.findByDisplayValue('Invoice problems');
    expect(screen.queryByRole('button', { name: /^Publish/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Submit for review/ })).toBeInTheDocument();
  });

  it('publish is blocked locally while there are problems', async () => {
    const u = userEvent.setup();
    mount();
    await screen.findByDisplayValue('Invoice problems');
    await u.click(screen.getByRole('button', { name: /^Publish/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Fix the 1 problem/);
  });
});
