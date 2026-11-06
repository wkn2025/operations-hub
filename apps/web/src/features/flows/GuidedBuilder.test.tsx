import { beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { mockFetch, renderApp } from '../../test/utils';
import { BuildFlow } from './GuidedBuilder';
import type { FlowView } from '../../api/client';

beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });

const me = { user: { id: 'u1', email: 'e@x.test', name: 'Ed', role: 'editor' }, authMode: 'dev', demo: true };
const view: FlowView = {
  id: 'f1', slug: 'f1', title: 'Printer won’t print', status: 'draft', revision: 1, startId: 'q1', articleId: null, article: null, articles: {},
  updatedAt: '2026-11-05T10:00:00Z', publishedAt: null, permissions: { write: true, publish: true, submit: true, archive: true },
  nodes: [{ id: 'q1', kind: 'question', text: '' }],
};

describe('guided flow builder', () => {
  it('walks a new author through question, answers, each path and publishing, one thing at a time', async () => {
    const fetch = mockFetch({ '/api/me': me, '/api/flows/f1': view });
    renderApp(<Routes><Route path="/flows/:id/build" element={<BuildFlow />} /></Routes>, '/flows/f1/build');

    expect(await screen.findByRole('heading', { name: /first thing you would ask/ })).toBeInTheDocument();
    expect(screen.queryByText(/goes to/i)).toBeNull(); // no wiring dropdowns
    await userEvent.type(screen.getByLabelText('Question'), 'Is the printer switched on?');
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));

    expect(await screen.findByRole('heading', { name: /What can they answer/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Answer 1')).toHaveValue('Yes');
    expect(screen.getByLabelText('Answer 2')).toHaveValue('No');
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));

    // path 1: Yes -> solution
    expect(await screen.findByRole('heading', { name: /When they answer Yes/ })).toBeInTheDocument();
    expect(screen.getByText('0 endings ready')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Give the solution/ }));
    await userEvent.type(await screen.findByLabelText('Solution'), 'Print a test page');
    await userEvent.click(screen.getByRole('button', { name: /Save ending/ }));

    // path 2: No -> solution, marked as escalation
    expect(await screen.findByRole('heading', { name: /When they answer No/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Your path so far' })).toHaveTextContent('Is the printer switched on?');
    await userEvent.click(screen.getByRole('button', { name: /Give the solution/ }));
    await userEvent.type(await screen.findByLabelText('Solution'), 'Switch it on');
    await userEvent.click(screen.getByLabelText(/Stop or escalate/));
    await userEvent.click(screen.getByRole('button', { name: /Save ending/ }));

    expect(await screen.findByRole('heading', { name: /Every path ends with an answer/ })).toBeInTheDocument();
    expect(screen.getByText('2 endings ready')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Publish/ }));
    await waitFor(() => expect(fetch.mock.calls.some(([u, i]) => String(u) === '/api/flows/f1/publish' && i?.method === 'POST')).toBe(true));

    const patches = fetch.mock.calls.filter(([u, i]) => String(u) === '/api/flows/f1' && i?.method === 'PATCH');
    const last = JSON.parse(String(patches.at(-1)![1]!.body));
    expect(last.nodes).toEqual([
      { id: 'q1', kind: 'question', text: 'Is the printer switched on?', options: [{ label: 'Yes', to: 'r1' }, { label: 'No', to: 'r2' }] },
      { id: 'r1', kind: 'result', text: 'Print a test page', severity: 'success' },
      { id: 'r2', kind: 'result', text: 'Switch it on', severity: 'warning' },
    ]);
  });

  it('lets the author change an earlier question from the path', async () => {
    mockFetch({ '/api/me': me, '/api/flows/f1': { ...view, nodes: [
      { id: 'q1', kind: 'question', text: 'Is it on?', options: [{ label: 'Yes', to: 'r1' }, { label: 'No', to: '' }] },
      { id: 'r1', kind: 'result', text: 'Fine', severity: 'success' },
    ] } });
    renderApp(<Routes><Route path="/flows/:id/build" element={<BuildFlow />} /></Routes>, '/flows/f1/build');
    await userEvent.click(await screen.findByRole('button', { name: 'Change question: Is it on?' }));
    const input = await screen.findByLabelText('Question');
    await userEvent.clear(input);
    await userEvent.type(input, 'Is the printer on?');
    await userEvent.click(screen.getByRole('button', { name: /Done/ }));
    expect(await screen.findByRole('heading', { name: /When they answer No/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change question: Is the printer on?' })).toBeInTheDocument();
  });

  it('a reloaded half-built flow carries on where it stopped, and a wrong choice can be taken back', async () => {
    const fetch = mockFetch({ '/api/me': me, '/api/flows/f1': { ...view, nodes: [
      { id: 'q1', kind: 'question', text: 'Laser or inkjet?', options: [{ label: 'Laser', to: 'r1' }, { label: 'Inkjet', to: '' }] },
      { id: 'r1', kind: 'result', text: 'Replace toner', severity: 'success' },
    ] } });
    renderApp(<Routes><Route path="/flows/:id/build" element={<BuildFlow />} /></Routes>, '/flows/f1/build');
    expect(await screen.findByRole('heading', { name: /When they answer Inkjet/ })).toBeInTheDocument(); // not asked for answers again
    await userEvent.click(screen.getByRole('button', { name: /Send them to an article/ }));
    expect(await screen.findByRole('heading', { name: /Which article/ })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: /Choose something else/ }));
    expect(await screen.findByRole('heading', { name: /When they answer Inkjet/ })).toBeInTheDocument();
    await waitFor(() => {
      const last = fetch.mock.calls.filter(([u, i]) => String(u) === '/api/flows/f1' && i?.method === 'PATCH').at(-1);
      expect(JSON.parse(String(last![1]!.body)).nodes).toEqual([
        { id: 'q1', kind: 'question', text: 'Laser or inkjet?', options: [{ label: 'Laser', to: 'r1' }, { label: 'Inkjet', to: '' }] },
        { id: 'r1', kind: 'result', text: 'Replace toner', severity: 'success' },
      ]); // the open answer is saved, not dropped
    });
  });

  it('when every path ends but something else is wrong, it says what instead of hiding Publish', async () => {
    mockFetch({ '/api/me': me, '/api/flows/f1': { ...view, nodes: [
      { id: 'q1', kind: 'question', text: 'On?', options: [{ label: 'Yes', to: 'r1' }, { label: 'No', to: 'r1' }] },
      { id: 'r1', kind: 'result', text: 'Fine', severity: 'success', options: [{ label: 'x', to: 'q1' }] },
    ] } });
    renderApp(<Routes><Route path="/flows/:id/build" element={<BuildFlow />} /></Routes>, '/flows/f1/build');
    expect(await screen.findByRole('heading', { name: /still need fixing/ })).toBeInTheDocument();
    expect(screen.getByText(/must not have options/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fix in the advanced editor/ })).toBeInTheDocument();
  });
});
