// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { loadPluginApp, renderSlot } from '@get-bb/plugin-sdk/testing/app';
import { emptySnapshot, type Snapshot } from '../model';

const data: Snapshot = { ...emptySnapshot('acme/app\nacme/blocked'), updatedAt: new Date().toISOString(), repositories: [
  { repository: 'acme/app', status: 'readable', checkedAt: new Date().toISOString(), error: null, alerts: [{
    key: 'acme/app#20', number: 20, repository: 'acme/app', package: 'glib', ecosystem: 'rust',
    manifest: 'Cargo.lock', scope: 'runtime', severity: 'medium', summary: 'Unsound iterators',
    vulnerableRange: '< 0.20.0', patchedVersion: '0.20.0', createdAt: '2026-10-01T00:00:00Z',
    url: 'https://github.com/acme/app/security/dependabot/20', work: null,
  }] },
  { repository: 'acme/blocked', status: 'unavailable', checkedAt: new Date().toISOString(), error: 'Check repository permissions', alerts: [] },
] };
async function render(snapshot: Snapshot = data, rpc = {}) {
  const app = await loadPluginApp(() => import('../app'));
  return renderSlot(app.navPanels[0]!, { subPath: '' }, { rpc: { view: () => snapshot, ...rpc } });
}

test('registers one Security destination, without replacing BB navigation', async () => {
  const app = await loadPluginApp(() => import('../app'));
  expect(app.navPanels).toHaveLength(1);
  expect(app.navPanels[0]).toMatchObject({ title: 'Security', path: 'security' });
});

test('partial coverage and filters cannot imply the whole team is clear', async () => {
  const slot = await render();
  try {
    await slot.findByText('Unsound iterators');
    expect(slot.getByText(/Partial coverage/)).toBeTruthy();
    fireEvent.change(slot.getByRole('searchbox'), { target: { value: 'does-not-exist' } });
    expect(slot.getByText(/No alerts match/)).toBeTruthy();
    expect(slot.getByText(/Partial coverage/)).toBeTruthy();
    fireEvent.click(slot.getByRole('button', { name: 'Repositories & scope' }));
    expect(slot.getByText('Unknown')).toBeTruthy();
    expect(slot.getByText('Check repository permissions')).toBeTruthy();
  } finally { slot.lifecycle.unmount(); }
});

test('prepares a brief without a project lookup, checkout, or thread launch', async () => {
  const slot = await render();
  try {
    fireEvent.click(await slot.findByText('Unsound iterators'));
    fireEvent.click(slot.getByRole('button', { name: 'Prepare investigation brief' }));
    const brief = slot.getByRole('textbox', { name: 'Investigation brief' }) as HTMLTextAreaElement;
    expect(brief.value).toContain('smallest supported upgrade');
    expect(brief.value).toContain('Do not change code');
    expect(slot.inspection.sdkCalls).toEqual([]);
    expect(slot.inspection.rpcCalls.every(call => call.method === 'view')).toBe(true);
  } finally { slot.lifecycle.unmount(); }
});

test('empty scope invites an explicit list, not project creation', async () => {
  const saveWatchList = vi.fn(() => emptySnapshot('acme/app'));
  const slot = await render(emptySnapshot(''), { saveWatchList });
  try {
    fireEvent.click(await slot.findByRole('button', { name: 'Repositories & scope' }));
    const editor = slot.getByRole('textbox', { name: 'Watched repositories' });
    fireEvent.change(editor, { target: { value: 'acme/app' } });
    fireEvent.click(slot.getByRole('button', { name: 'Save watch list' }));
    await vi.waitFor(() => expect(saveWatchList).toHaveBeenCalledWith({ watchList: 'acme/app', expectedWatchList: '' }));
  } finally { slot.lifecycle.unmount(); }
});
