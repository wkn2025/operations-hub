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
});
