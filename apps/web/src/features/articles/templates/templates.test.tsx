import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { ArticleTemplate } from '.';
import type { Article } from '../../../api/client';
import { renderApp } from '../../../test/utils';

const base: Article = {
  id: 'x', slug: 'x', title: 'The title', type: 'standard', status: 'published', categoryId: null, categoryPath: 'Work Instructions',
  owner: { id: 'u', name: 'Demo Editor' }, revision: 3, updatedAt: '2026-10-01T10:00:00Z', publishedAt: '2026-10-01T10:00:00Z',
  reviewDate: '2027-01-01', tags: ['edi'], linkTargets: {}, fields: {},
  content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Body heading' }] }] },
};
const make = (type: Article['type'], fields: Record<string, unknown>) => ({ ...base, type, fields });

describe('ArticleTemplate', () => {
  it('standard: title, summary and body', () => {
    renderApp(<ArticleTemplate article={make('standard', { summary: 'A lede' })} />);
    expect(screen.getByRole('heading', { level: 1, name: 'The title' })).toBeInTheDocument();
    expect(screen.getByText('A lede')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Body heading' })).toBeInTheDocument();
    expect(document.querySelector('[data-template="standard"]')).not.toBeNull();
  });

  it('work instruction: purpose, scope, verification and step progress', () => {
    const a = make('work_instruction', { purpose: 'Register invoices', scope: 'All providers', verification: 'Status is Registered' });
    a.content = { type: 'doc', content: [{ type: 'steps', content: [{ type: 'step', attrs: { title: 'One' }, content: [] }, { type: 'step', attrs: { title: 'Two' }, content: [] }] }] };
    renderApp(<ArticleTemplate article={a} />);
    expect(screen.getByText('Purpose')).toBeInTheDocument();
    expect(screen.getByText('Register invoices')).toBeInTheDocument();
    expect(screen.getByText('All providers')).toBeInTheDocument();
    expect(screen.getByText('Status is Registered')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Steps completed' })).toHaveAttribute('aria-valuemax', '2');
  });

  it('client terms: prominent DEMO banner, client, contract and key limits', () => {
    renderApp(<ArticleTemplate article={make('client_terms', { client: 'Northwind (fictional)', contractRef: 'NW-1', keyLimits: [{ label: 'Medical', value: 'EUR 250,000' }] })} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/DEMO – illustrative data/);
    expect(screen.getByText('Northwind (fictional)')).toBeInTheDocument();
    expect(screen.getByText('NW-1')).toBeInTheDocument();
    expect(screen.getByText('EUR 250,000')).toBeInTheDocument();
  });

  it('technical: system chips and version', () => {
    renderApp(<ArticleTemplate article={make('technical', { systems: ['EDI Gateway', 'Globo'], version: 'v2.4' })} />);
    expect(screen.getByRole('list', { name: 'Systems' })).toHaveTextContent('EDI Gateway');
    expect(screen.getByText('v2.4')).toBeInTheDocument();
  });

  it('troubleshooting: symptom → cause → fix, flow button only when a flow is linked', () => {
    const { unmount } = renderApp(<ArticleTemplate article={make('troubleshooting', { symptom: 'No invoice', cause: 'No GOP', fix: 'Issue GOP' })} />);
    for (const s of ['Symptom', 'Cause', 'Fix', 'No invoice', 'No GOP', 'Issue GOP']) expect(screen.getByText(s)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /guided flow/i })).toBeNull();
    unmount();
    renderApp(<ArticleTemplate article={make('troubleshooting', { symptom: 's', flowId: 'f1' })} />);
    expect(screen.getByRole('link', { name: /guided flow/i })).toHaveAttribute('href', '/flows/f1');
  });

  it('glossary: acronym, term, definition, related terms', () => {
    renderApp(<ArticleTemplate article={make('glossary', { acronym: 'GOP', term: 'Guarantee of Payment', definition: 'A commitment to pay', relatedTerms: ['Excess'] })} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('GOP');
    expect(screen.getByText('Guarantee of Payment')).toBeInTheDocument();
    expect(screen.getByText('A commitment to pay')).toBeInTheDocument();
    expect(screen.getByText('Excess')).toBeInTheDocument();
  });
});
