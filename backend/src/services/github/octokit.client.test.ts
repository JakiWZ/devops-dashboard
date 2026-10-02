import { createEtagCache, OctokitGitHubClient } from './octokit.client.js';

interface Call {
  url: string;
  headers: Headers;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(status === 304 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function fakeFetch(responses: Array<() => Response>) {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected request to ${String(input)}`);
    return next();
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const repo = {
  id: 42,
  full_name: 'acme/web',
  html_url: 'https://github.com/acme/web',
  default_branch: 'main',
  private: false,
};

describe('OctokitGitHubClient', () => {
  it('sends If-None-Match on repeat requests and serves the cached body on 304', async () => {
    const { fetch, calls } = fakeFetch([
      () => json(repo, 200, { etag: '"v1"' }),
      () => json(null, 304),
    ]);
    const client = new OctokitGitHubClient('token', createEtagCache(), fetch);

    const first = await client.getRepo('acme/web');
    const second = await client.getRepo('acme/web');

    expect(second).toEqual(first);
    expect(second).toMatchObject({ githubId: 42, fullName: 'acme/web', isPrivate: false });
    expect(calls[0]?.headers.get('if-none-match')).toBeNull();
    expect(calls[1]?.headers.get('if-none-match')).toBe('"v1"');
  });

  it('does not share cached responses between tokens', async () => {
    const cache = createEtagCache();
    const { fetch, calls } = fakeFetch([
      () => json(repo, 200, { etag: '"v1"' }),
      () => json(repo, 200, { etag: '"v1"' }),
    ]);

    await new OctokitGitHubClient('token-a', cache, fetch).getRepo('acme/web');
    await new OctokitGitHubClient('token-b', cache, fetch).getRepo('acme/web');

    expect(calls[1]?.headers.get('if-none-match')).toBeNull();
  });

  it('maps pull requests and merge dates from the issues endpoint', async () => {
    const { fetch } = fakeFetch([
      () =>
        json([
          { created_at: '2026-09-01T00:00:00Z', closed_at: null },
          {
            created_at: '2026-09-01T00:00:00Z',
            closed_at: null,
            pull_request: { merged_at: null },
          },
        ]),
    ]);
    const issues = await new OctokitGitHubClient('t', createEtagCache(), fetch).listOpenIssues(
      'acme/web',
    );

    expect(issues.map((i) => i.isPullRequest)).toEqual([false, true]);
  });

  it('turns an invalid token into a client error instead of a 500', async () => {
    const { fetch } = fakeFetch([() => json({ message: 'Bad credentials' }, 401)]);
    const client = new OctokitGitHubClient('bad', createEtagCache(), fetch);

    await expect(client.getLogin()).rejects.toMatchObject({
      status: 400,
      code: 'GITHUB_TOKEN_INVALID',
    });
  });
});

describe('GitHub 403 handling', () => {
  it('distinguishes a rate limit from a missing permission', async () => {
    const { fetch } = fakeFetch([
      () =>
        json({ message: 'API rate limit exceeded' }, 403, {
          'x-ratelimit-remaining': '0',
          // Reset tra un'ora: il client non deve restare in attesa, deve fallire subito.
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
        }),
      () => json({ message: 'Resource not accessible by personal access token' }, 403),
    ]);
    const client = new OctokitGitHubClient('t', createEtagCache(), fetch);

    await expect(client.getRepo('acme/a')).rejects.toMatchObject({ code: 'GITHUB_RATE_LIMITED' });
    await expect(client.getRepo('acme/b')).rejects.toMatchObject({ code: 'GITHUB_FORBIDDEN' });
  });
});
