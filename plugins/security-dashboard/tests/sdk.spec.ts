import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { experimental_scanPublicSdkOnly } from '@get-bb/plugin-sdk/testing';

test('imports only public SDK and declared runtime/test packages', async () => {
  const result = await experimental_scanPublicSdkOnly(fileURLToPath(new URL('..', import.meta.url)), {
    allow: [/^react$/, /^vitest(?:\/config)?$/, /^@testing-library\/react$/, /^@get-bb\/plugin-sdk\/testing(?:\/app)?$/],
  });
  expect(result.violations).toEqual([]);
  expect(result.privateDependencies).toEqual([]);
});
