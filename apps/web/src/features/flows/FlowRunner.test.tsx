import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EDI_EXAMPLE } from '@ops/shared';
import { mockFetch, renderApp } from '../../test/utils';
import { FlowRunner } from './FlowRunner';

const flow = { ...EDI_EXAMPLE, nodes: EDI_EXAMPLE.nodes.map((n) => (n.kind === 'article' ? { ...n, articleId: 'a-1' } : n)), articles: { 'a-1': { status: 'published', title: 'Corrective procedure', slug: 'corrective' } } };
const article = { id: 'a-1', slug: 'corrective', title: 'Corrective procedure', type: 'standard', status: 'published', fields: { summary: 'Fix and re-queue the claim.' }, linkTargets: {}, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Open Quarantine.' }] }] } };

describe('FlowRunner', () => {
  it('runs question by question with numbered answers, a clickable trail, Back and Restart', async () => {
    const u = userEvent.setup();
    renderApp(<FlowRunner flow={flow} />);
    expect(screen.getByRole('heading', { name: 'Is there a GOP for this case?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1.*Yes/ })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: /1.*Yes/ }));
    expect(await screen.findByRole('heading', { name: 'Is the member ID valid?' })).toBeInTheDocument();
    const trail = screen.getByRole('navigation', { name: 'Progress' });
    await u.click(screen.getByRole('button', { name: /2.*No, leading zeros/ }));
    expect(await screen.findByText(/Correct the member ID/)).toBeInTheDocument();
    expect(screen.getByTestId('flow-result')).toHaveAttribute('data-severity', 'info');
    // trail: click the first step to jump back
    await u.click(screen.getAllByRole('button').find((b) => b.closest('nav') === screen.getByRole('navigation', { name: 'Progress' }) && /GOP/.test(b.textContent ?? ''))!);
    expect(await screen.findByRole('heading', { name: 'Is there a GOP for this case?' })).toBeInTheDocument();
    expect(trail).toBeTruthy();
    await u.click(screen.getByRole('button', { name: /2.*No/ }));
    await screen.findByTestId('flow-result');
    expect(screen.getByTestId('flow-result')).toHaveAttribute('data-severity', 'warning');
    await u.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Is there a GOP for this case?' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: /1.*Yes/ }));
    await u.click(await screen.findByRole('button', { name: 'Start over' }));
    expect(await screen.findByRole('heading', { name: 'Is there a GOP for this case?' })).toBeInTheDocument();
  });

  it('keyboard: number keys choose, Backspace goes back, typing in a field is left alone', async () => {
    const u = userEvent.setup();
    renderApp(<><input aria-label="notes" /><FlowRunner flow={flow} /></>);
    await u.keyboard('1');
    expect(await screen.findByRole('heading', { name: 'Is the member ID valid?' })).toBeInTheDocument();
    await u.keyboard('{Backspace}');
    expect(await screen.findByRole('heading', { name: 'Is there a GOP for this case?' })).toBeInTheDocument();
    await u.keyboard('9'); // no such answer: nothing happens
    expect(screen.getByRole('heading', { name: 'Is there a GOP for this case?' })).toBeInTheDocument();
    await u.click(screen.getByLabelText('notes'));
    await u.keyboard('1');
    expect(screen.getByRole('heading', { name: 'Is there a GOP for this case?' })).toBeInTheDocument();
  });

  it('article node shows an inline preview card and a link', async () => {
    mockFetch({ '/api/articles/a-1': article });
    const u = userEvent.setup();
    renderApp(<FlowRunner flow={flow} />);
    await u.keyboard('1'); await screen.findByText('Is the member ID valid?');
    await u.keyboard('1'); await screen.findByText('Is there a matching open case?');
    await u.keyboard('1');
    expect(await screen.findByText('Open Quarantine.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open full article/ })).toHaveAttribute('href', '/article/corrective');
    expect(screen.getByText('Fix and re-queue the claim.')).toBeInTheDocument();
  });

  it('an unavailable article shows a state instead of crashing', async () => {
    const f = { ...flow, articles: { 'a-1': { status: 'unavailable' } } };
    const u = userEvent.setup();
    renderApp(<FlowRunner flow={f} />);
    await u.keyboard('1'); await screen.findByText('Is the member ID valid?');
    await u.keyboard('1'); await screen.findByText('Is there a matching open case?');
    await u.keyboard('1');
    expect(await screen.findByText(/article is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('a broken flow shows a recoverable error, not a crash', async () => {
    renderApp(<FlowRunner flow={{ ...flow, startId: 'ghost' }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/can.t run this flow/i);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start over' })).toBeInTheDocument());
  });

  it('a step the flow cannot take shows the broken-flow panel instead of doing nothing', async () => {
    const u = userEvent.setup();
    const bad = { title: 'x', startId: 'a', nodes: [{ id: 'a', kind: 'question' as const, text: 'Q?', options: [{ label: 'Go', to: 'ghost' }, { label: 'Stay', to: 'a' }] }] };
    renderApp(<FlowRunner flow={bad} />);
    await u.click(screen.getByRole('button', { name: /Go/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/can.t run this flow/i);
  });

  it('the trail shows the answer that was chosen, even when two answers lead to the same node', async () => {
    const u = userEvent.setup();
    const twin = { title: 'x', startId: 'a', nodes: [
      { id: 'a', kind: 'question' as const, text: 'Pick?', options: [{ label: 'One', to: 'r' }, { label: 'Two', to: 'r' }] },
      { id: 'r', kind: 'result' as const, text: 'Done' },
    ] };
    renderApp(<FlowRunner flow={twin} />);
    await u.click(screen.getByRole('button', { name: /Two/ }));
    const nav = await screen.findByRole('navigation', { name: 'Progress' });
    expect(nav).toHaveTextContent('Two');
    expect(nav).not.toHaveTextContent('One');
  });

  it('Back and number shortcuts are ignored inside dialogs and menus', async () => {
    const u = userEvent.setup();
    renderApp(<><div role="dialog" aria-label="d"><button>inside</button></div><FlowRunner flow={flow} /></>);
    await u.keyboard('1');
    await screen.findByRole('heading', { name: 'Is the member ID valid?' });
    screen.getByRole('button', { name: 'inside' }).focus();
    await u.keyboard('{Backspace}');
    await u.keyboard('2');
    expect(screen.getByRole('heading', { name: 'Is the member ID valid?' })).toBeInTheDocument();
  });

  it('does not announce twice: no live region around the moving screen', async () => {
    renderApp(<FlowRunner flow={flow} />);
    expect(document.querySelector('[data-testid=flow-runner] [aria-live]')).toBeNull();
  });
});
