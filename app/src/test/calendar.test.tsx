import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { StoreProvider } from '../store/store';
import { SEED_FILES } from '../data/seed';
import { Calendar } from '../screens/Calendar';

// jsdom ships no matchMedia; useIsMobile reads it on render. Stub it so both the
// desktop-grid (matches:false) and mobile-agenda (matches:true) paths render.
// renderToStaticMarkup runs no effects, so only `.matches` is ever read.
function stubMatchMedia(matches: boolean): void {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

function render(matches: boolean): string {
  stubMatchMedia(matches);
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/calendar']}>
      <StoreProvider initialFiles={SEED_FILES}>
        <Calendar />
      </StoreProvider>
    </MemoryRouter>,
  );
}

describe('Calendar screen (seed data, no runtime throw)', () => {
  // The default month tracks the real wall clock, so assertions stay
  // clock-independent (title + weekday header) while still forcing the full
  // grid/byDay/chip body to execute.
  it('renders the desktop month grid', () => {
    const html = render(false);
    expect(html).toContain('Calendar');
    expect(html).toContain('Mon'); // weekday header → grid path ran
    expect(html).toContain('departs'); // legend → desktop branch
  });

  it('renders the mobile agenda fallback', () => {
    const html = render(true);
    expect(html).toContain('Calendar');
    // Mobile branch shows no weekday-header grid; it renders an agenda or the
    // empty state — either way the component body executed without throwing.
    expect(html.length).toBeGreaterThan(0);
  });
});
