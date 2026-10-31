// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { loadPluginApp, renderSlot } from '@get-bb/plugin-sdk/testing/app';
import { emptySnapshot, type Snapshot } from '../model';

async function render(data: Snapshot, rpc = {}) {
  const app = await loadPluginApp(() => import('../app'));
  const slot = renderSlot(app.navPanels[0]!, { subPath: '' }, { rpc: { view: () => data, ...rpc } });
  fireEvent.click(await slot.findByRole('button', { name: 'Repositories & scope' }));
  return slot;
}

test('confirms and lists every saved repository, including zero-alert, pending and unavailable entries', async () => {
  const names = Array.from({ length: 11 }, (_, i) => `acme/repository-${i + 1}`);
  const data = emptySnapshot(names.join('\n'));
  data.repositories[0]!.status = 'readable';
  data.repositories[1]!.status = 'unavailable';
  data.repositories[1]!.error = 'Access unavailable';
  const slot = await render(data);
  try {
    expect(slot.getByRole('heading', { name: 'Watching 11 repositories' })).toBeTruthy();
    const table = slot.getByRole('table', { name: /All 11 saved repositories/ });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(11);
    for (const name of names) expect(slot.getByRole('link', { name })).toBeTruthy();
    expect(slot.getAllByText('Unknown')).toHaveLength(10);
    expect(slot.getByText('Access unavailable')).toBeTruthy();
    expect(slot.getByRole('region', { name: 'Team security inbox' }).tabIndex).toBe(0);
  } finally { slot.lifecycle.unmount(); }
});

test('distinguishes unsaved editor entries from the accepted repository list', async () => {
  const slot = await render(emptySnapshot('acme/accepted'));
  try {
    fireEvent.change(slot.getByRole('textbox', { name: 'Watched repositories' }), {
      target: { value: 'acme/accepted\nacme/not-saved' },
    });
    expect(slot.getByText(/Unsaved changes/)).toBeTruthy();
    expect(slot.getByRole('heading', { name: 'Watching 1 repository' })).toBeTruthy();
    expect(slot.queryByRole('link', { name: 'acme/not-saved' })).toBeNull();
  } finally { slot.lifecycle.unmount(); }
});

test('a successful save confirms the accepted normalized count, not the number of editor lines', async () => {
  const slot = await render(emptySnapshot(''), {
    saveWatchList: () => emptySnapshot('acme/one\nacme/two'),
  });
  try {
    fireEvent.change(slot.getByRole('textbox', { name: 'Watched repositories' }), {
      target: { value: 'acme/one, acme/two\nacme/one' },
    });
    fireEvent.click(slot.getByRole('button', { name: 'Save watch list' }));
    await vi.waitFor(() => expect(slot.getByText('Watch list saved: 2 repositories accepted.')).toBeTruthy());
    expect(slot.getByRole('heading', { name: 'Watching 2 repositories' })).toBeTruthy();
    expect(slot.getAllByRole('link')).toHaveLength(2);
    expect(slot.queryByText(/Unsaved changes/)).toBeNull();
  } finally { slot.lifecycle.unmount(); }
});
