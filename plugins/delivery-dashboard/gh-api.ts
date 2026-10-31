import { execFile } from 'node:child_process';

export const CLI_SETUP_MESSAGE = 'GitHub CLI request failed. Ensure gh is installed and run gh auth login on the BB server machine; also check access and rate limits.';

/** Run API requests through gh without reading or copying its credentials. */
export const ghFetch: typeof fetch = async (input, options) => {
  const url = new URL(String(input));
  const method = options?.method ?? 'GET';
  const graphql = url.pathname === '/graphql' && method === 'POST';
  if (url.origin !== 'https://api.github.com' || url.username || url.password ||
      (!graphql && !(url.pathname.startsWith('/repos/') && method === 'GET'))) {
    throw new Error('Unsupported GitHub CLI endpoint');
  }
  const signal = options?.signal ?? undefined;
  signal?.throwIfAborted();
  const args = ['api', '--hostname', 'github.com', '--method', method,
    '--header', 'Accept: application/vnd.github+json',
    '--header', 'X-GitHub-Api-Version: 2022-11-28',
    url.pathname.slice(1) + url.search];
  if (graphql) args.push('--input', '-');
  const body = graphql ? options?.body : undefined;
  if (graphql && typeof body !== 'string') throw new Error('Expected a JSON request body');
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = execFile('gh', args, {
      encoding: 'utf8', timeout: 15_000, maxBuffer: 4 * 1024 * 1024,
      killSignal: 'SIGKILL', signal, windowsHide: true,
      env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat' },
    }, (error, output) => {
      if (signal?.aborted) reject(signal.reason);
      else if (error) reject(new Error(CLI_SETUP_MESSAGE));
      else resolve(output);
    });
    // Request data goes to stdin, not a shell or command-line interpolation.
    child.stdin?.on('error', () => {}); // Early child exit can close the pipe.
    child.stdin?.end(body);
  });
  return new Response(stdout, { headers: { 'content-type': 'application/json' } });
};
