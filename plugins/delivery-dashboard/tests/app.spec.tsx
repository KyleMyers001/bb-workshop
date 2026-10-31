// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { loadPluginApp, renderSlot } from '@get-bb/plugin-sdk/testing/app';

const data = {
  repository: 'acme/app', environment: 'production', days: 7, refreshSeconds: 300,
  updatedAt: new Date().toISOString(),
  repositories: [],
  people: [{ username: 'KyleMyers001', opened: { value: 5, error: null },
    merged: { value: 4, error: null }, previousMerged: { value: 2, error: null },
    open: { value: 1, error: null }, medianMergeHours: { value: 12, error: null },
    reviewedPrs: { value: 6, error: null },
    history: [{ start: '2026-10-24T12:00:00Z', end: '2026-10-25T12:00:00Z', merged: 4 }], historyError: null }],
  deployments: { value: 14, error: null }, openPrs: { value: 3, error: null },
  ciPassRate: { value: 80, error: null },
};
test('sidebar page renders metrics, manual refresh, and cleans up polling', async () => {
  const app = await loadPluginApp(() => import('../app'));
  const refresh = vi.fn(() => data);
  const slot = renderSlot(app.navPanels[0]!, { subPath: '' }, {
    rpc: { view: () => data, refreshView: refresh },
  });
  try {
    await slot.findByText('KyleMyers001');
    expect(slot.getByText('+2 vs previous 7 days (2)')).toBeTruthy();
    fireEvent.click(slot.getByText(/Repository delivery context/));
    expect(slot.getByText('14 successful deployments in 7 days')).toBeTruthy();
    expect(slot.getAllByText('Open PRs')).toHaveLength(2);
    expect(slot.getByText('CI pass rate')).toBeTruthy();
    fireEvent.click(slot.getByRole('button', { name: 'Refresh' }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  } finally { slot.lifecycle.unmount(); }
});
test('personal dashboard works without repository context', async () => {
  const app = await loadPluginApp(() => import('../app'));
  const slot = renderSlot(app.navPanels[0]!, { subPath: '' }, {
    rpc: { view: () => ({ ...data, repository: '' }) },
  });
  try {
    expect(await slot.findByText('KyleMyers001')).toBeTruthy();
    expect(slot.getByText('All repositories visible to your signed-in account')).toBeTruthy();
  } finally { slot.lifecycle.unmount(); }
});
test('supports a second person and compares identical time windows', async () => {
  const app = await loadPluginApp(() => import('../app'));
  const slot = renderSlot(app.navPanels[0]!, { subPath: '' }, {
    rpc: { view: () => ({ ...data, people: [...data.people,
      { ...data.people[0], username: 'teammate', merged: { value: 8, error: null } }] }) },
  });
  try {
    const select = await slot.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'teammate' } });
    expect(slot.getByText('+6 vs previous 7 days (2)')).toBeTruthy();
    expect(slot.getByRole('table', { name: 'Same repositories · Same 7-day window' })).toBeTruthy();
    expect(slot.getByText('Same repositories · Same 7-day window')).toBeTruthy();
  } finally { slot.lifecycle.unmount(); }
});

test('registers a sidebar destination without a new-thread section', async () => {
  const app = await loadPluginApp(() => import('../app'));
  expect(app.homepageSections).toHaveLength(0);
  expect(app.navPanels).toHaveLength(1);
  expect(app.navPanels[0]).toMatchObject({ title: 'Personal velocity', path: 'velocity' });
});

test('time span buttons request matching data and keep the chart in sync', async () => {
  const app = await loadPluginApp(() => import('../app'));
  const view = vi.fn(({ days }: { days: number }) => ({ ...data, days }));
  const slot = renderSlot(app.navPanels[0]!, { subPath: '' }, { rpc: { view } });
  try {
    await slot.findByText('KyleMyers001');
    for (const [label, days] of [['Month', 30], ['6 months', 180], ['Year', 365], ['Week', 7]] as const) {
      fireEvent.click(slot.getByRole('button', { name: label }));
      await vi.waitFor(() => expect(view).toHaveBeenLastCalledWith({ days }));
      expect(slot.getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('true');
      await vi.waitFor(() => expect(slot.getByRole('group', { name: new RegExp(`over ${days} days`) })).toBeTruthy());
    }
    fireEvent.click(slot.getByText('View data'));
    expect(slot.getByRole('table', { name: 'PRs merged per bucket (UTC)' })).toBeTruthy();
  } finally { slot.lifecycle.unmount(); }
});

test('a slow old range cannot replace a newer selected span', async () => {
  const app = await loadPluginApp(() => import('../app'));
  let release: ((value: typeof data) => void) | undefined;
  const view = vi.fn(({ days }: { days: number }) => days === 30
    ? new Promise<typeof data>(resolve => { release = resolve; }) : { ...data, days });
  const slot = renderSlot(app.navPanels[0]!, { subPath: '' }, { rpc: { view } });
  try {
    await slot.findByText('KyleMyers001');
    fireEvent.click(slot.getByRole('button', { name: 'Month' }));
    await vi.waitFor(() => expect(release).toBeDefined());
    fireEvent.click(slot.getByRole('button', { name: 'Year' }));
    await slot.findByRole('group', { name: /over 365 days/ });
    release!({ ...data, days: 30 });
    await vi.waitFor(() => expect(slot.getByRole('group', { name: /over 365 days/ })).toBeTruthy());
    expect(slot.queryByRole('group', { name: /over 30 days/ })).toBeNull();
  } finally { slot.lifecycle.unmount(); }
});
