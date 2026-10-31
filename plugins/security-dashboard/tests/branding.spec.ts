import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('ships a plugin-owned security icon rather than relying on a named-icon fallback', () => {
  const root = new URL('../', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  expect(manifest.bb.branding.icon).toBe('./assets/security.svg');
  const svg = readFileSync(new URL(manifest.bb.branding.icon, root), 'utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain('viewBox="0 0 24 24"');
  expect(svg).not.toMatch(/<script|\son\w+=/i);
});
