import { execFile } from 'node:child_process';

/** Only read Dependabot alerts using the server's existing gh authentication. */
export const ghFetch: typeof fetch = async (input, options) => {
  const url = new URL(String(input));
  if (url.origin !== 'https://api.github.com' || url.username || url.password || url.hash ||
      (options?.method && options.method !== 'GET') ||
      !/^\/repos\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/dependabot\/alerts$/.test(url.pathname)) {
    throw new Error('Unsupported security dashboard endpoint');
  }
  const signal = options?.signal ?? undefined;
  signal?.throwIfAborted();
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile('gh', ['api', '--hostname', 'github.com', '--method', 'GET', '--include',
      '--header', 'Accept: application/vnd.github+json',
      '--header', 'X-GitHub-Api-Version: 2022-11-28', url.pathname.slice(1) + url.search], {
      encoding: 'utf8', timeout: 20_000, maxBuffer: 4 * 1024 * 1024,
      killSignal: 'SIGKILL', signal, windowsHide: true,
      env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat' },
    }, (error, output) => {
      if (signal?.aborted) reject(signal.reason);
      // gh includes HTTP status/headers on stdout even for non-2xx responses.
      else if (error && !/^HTTP\/\S+ \d{3}/.test(output)) reject(new Error('GitHub CLI unavailable'));
      else resolve(output);
    });
  });
  const boundary = /\r?\n\r?\n/.exec(stdout);
  const status = Number(/^HTTP\/\S+ (\d{3})/.exec(stdout)?.[1]);
  if (!boundary || !status) throw new Error('Invalid GitHub CLI response');
  const headers = new Headers();
  for (const line of stdout.slice(0, boundary.index).split(/\r?\n/).slice(1)) {
    const separator = line.indexOf(':');
    if (separator > 0 && line.slice(0, separator).toLowerCase() === 'link') headers.append('link', line.slice(separator + 1).trim());
  }
  return new Response(stdout.slice(boundary.index + boundary[0].length), { status, headers });
};
