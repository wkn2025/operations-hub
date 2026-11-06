import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockFetch, renderApp } from '../test/utils';
import { CodeLookup } from './CodeLookup';

const RESULTS = { results: [
  { query: 'S330XXA', matches: [{ system: 'ICD-10-CM', code: 'S33.0XXA', billable: true, description: 'Traumatic rupture of lumbar intervertebral disc, initial encounter' }] },
  { query: 'S33', matches: [{ system: 'ICD-10-CM', code: 'S33', billable: false, description: 'Dislocation and sprain of joints and ligaments of lumbar spine and pelvis' }] },
  { query: 'G0439', matches: [
    { system: 'ICD-10-CM', code: 'G04.39', billable: true, description: 'Other acute disseminated encephalitis and encephalomyelitis' },
    { system: 'HCPCS', code: 'G0439', billable: true, description: 'Annual wellness visit, subsequent' },
  ] },
  { query: 'ZZZ99', matches: [] },
] };

afterEach(() => vi.unstubAllGlobals());

describe('Diagnosis & Service codes lookup', () => {
  it('looks up what is typed and lists each code with its system and description, in order', async () => {
    const fetch = mockFetch({ '/api/codes?': RESULTS });
    renderApp(<CodeLookup />, '/category/codes');
    await userEvent.click(screen.getByRole('searchbox', { name: /codes/i }));
    await userEvent.paste('s33.0xxa, s33 - G0439 ZZZ99'); // one change: no race with the debounce
    const rows = within(await screen.findByRole('list', { name: 'Code results' })).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent(/S33\.0XXA.*ICD-10-CM.*initial encounter/);
    expect(rows[1]).toHaveTextContent(/not billable/i);
    expect(within(rows[2]).getByText('HCPCS')).toBeInTheDocument();
    expect(within(rows[2]).getByText('ICD-10-CM')).toBeInTheDocument();
    expect(rows[3]).toHaveTextContent(/ZZZ99.*no match/i);
    expect(screen.getByText(/3 of 4 found/i)).toBeInTheDocument();
    // one request for the finished text (debounced), and the text is kept in the address for Back/sharing
    const urls = fetch.mock.calls.map((c) => String(c[0]));
    expect(urls.at(-1)).toBe(`/api/codes?q=${encodeURIComponent('s33.0xxa, s33 - G0439 ZZZ99')}`);
    expect(screen.getByTestId('location')).toHaveTextContent('q=');
  });

  it('starts from the address text and shows an error with Retry when the lookup fails', async () => {
    mockFetch({ '/api/codes?': { __status: 500, error: 'internal' } });
    renderApp(<CodeLookup />, '/category/codes?q=99214');
    expect(screen.getByRole('searchbox', { name: /codes/i })).toHaveValue('99214');
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
