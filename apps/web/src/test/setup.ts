import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

// jsdom gaps used by Radix / motion
class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as any).ResizeObserver ??= RO;
(globalThis as any).IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
Element.prototype.scrollIntoView ??= function () {};
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as any;
window.scrollTo = () => {};
