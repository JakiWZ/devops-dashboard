import type { Request, RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';
import {
  MAX_METRICS_RANGE_DAYS,
  metricsQuerySchema,
  type GitHubTokenInput,
  type TrackRepoInput,
} from '../routes/repos.schemas.js';
import type { GitHubAccountService } from '../services/github/github-account.service.js';
import type { RepoService } from '../services/repos.service.js';
import type { RepoSyncService } from '../services/sync/sync.service.js';

function userId(req: Request): string {
  if (!req.auth) throw new HttpError(401, 'Not authenticated', 'UNAUTHENTICATED');
  return req.auth.userId;
}

function repoId(req: Request): string {
  const { id } = req.params;
  if (typeof id !== 'string') throw new HttpError(400, 'Missing repository id', 'BAD_REQUEST');
  return id;
}

export function githubController(github: GitHubAccountService) {
  const status: RequestHandler = async (req, res) => {
    res.json(await github.status(userId(req)));
  };

  const connect: RequestHandler = async (req, res) => {
    const { token } = req.body as GitHubTokenInput;
    res.json(await github.connect(userId(req), token));
  };

  const disconnect: RequestHandler = async (req, res) => {
    await github.disconnect(userId(req));
    res.status(204).end();
  };

  return { status, connect, disconnect };
}

export function reposController(repos: RepoService, sync: RepoSyncService) {
  const available: RequestHandler = async (req, res) => {
    res.json({ repositories: await repos.listAvailable(userId(req)) });
  };

  const list: RequestHandler = async (req, res) => {
    res.json({ repositories: await repos.list(userId(req)) });
  };

  const track: RequestHandler = async (req, res) => {
    const { fullName } = req.body as TrackRepoInput;
    res.status(201).json({ repository: await repos.track(userId(req), fullName) });
  };

  const get: RequestHandler = async (req, res) => {
    res.json({ repository: await repos.get(userId(req), repoId(req)) });
  };

  const remove: RequestHandler = async (req, res) => {
    await repos.remove(userId(req), repoId(req));
    res.status(204).end();
  };

  const metrics: RequestHandler = async (req, res) => {
    const range = metricsQuerySchema.parse(req.query);
    res.json(await repos.metrics(userId(req), repoId(req), range, MAX_METRICS_RANGE_DAYS));
  };

  const runSync: RequestHandler = async (req, res) => {
    // Il controllo di ownership precede il sync: niente sync su repository altrui.
    const repo = await repos.get(userId(req), repoId(req));
    res.json(await sync.sync(repo.id));
  };

  return { available, list, track, get, remove, metrics, runSync };
}
