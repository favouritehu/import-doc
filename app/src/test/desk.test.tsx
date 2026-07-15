import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DeskProvider, useDesk } from '../store/desk';

function Probe() {
  const { desk } = useDesk();
  return <span>desk:{desk}</span>;
}

describe('DeskProvider', () => {
  it('defaults to import', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><DeskProvider><Probe /></DeskProvider></MemoryRouter>,
    );
    expect(html).toContain('desk:import');
  });
  it('honors initialDesk', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><DeskProvider initialDesk="export"><Probe /></DeskProvider></MemoryRouter>,
    );
    expect(html).toContain('desk:export');
  });
});
