import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { handleApi, type D1Database, type D1PreparedStatement, type WorkerEnv } from './worker/index.ts';

dotenv.config();

// Ephemeral in-memory fallback JWT secret for local preview if JWT_SECRET env var is unset
const EPHEMERAL_DEV_JWT_SECRET = crypto.randomBytes(32).toString('hex');

function createLocalD1Adapter(dbPath: string): D1Database {
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA foreign_keys = ON;');

  const schemaFile = path.resolve(process.cwd(), 'schema.sql');
  if (fs.existsSync(schemaFile)) {
    const schemaSql = fs.readFileSync(schemaFile, 'utf8');
    sqlite.exec(schemaSql);
  }

  class LocalPreparedStatement implements D1PreparedStatement {
    private params: SQLInputValue[] = [];
    constructor(private readonly query: string) {}

    bind(...values: unknown[]): D1PreparedStatement {
      const next = new LocalPreparedStatement(this.query);
      next.params = values.map((v) => {
        if (v === undefined || v === null) return null;
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (typeof v === 'number' || typeof v === 'string' || v instanceof Uint8Array) {
          return v;
        }
        return String(v);
      });
      return next;
    }

    async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
      const stmt = sqlite.prepare(this.query);
      const row = stmt.get(...this.params) as Record<string, unknown> | undefined;
      if (!row) return null;
      if (colName) return (row[colName] as T) ?? null;
      return { ...row } as T;
    }

    async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
      const stmt = sqlite.prepare(this.query);
      const rows = stmt.all(...this.params) as Record<string, unknown>[];
      return { results: rows.map((r) => ({ ...r }) as T) };
    }

    async run(): Promise<{ success: boolean; meta?: { last_row_id?: number; changes?: number } }> {
      const stmt = sqlite.prepare(this.query);
      const result = stmt.run(...this.params);
      return {
        success: true,
        meta: {
          last_row_id: Number(result.lastInsertRowid ?? 0),
          changes: Number(result.changes ?? 0),
        },
      };
    }
  }

  return {
    prepare(query: string): D1PreparedStatement {
      return new LocalPreparedStatement(query);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]> {
      sqlite.exec('BEGIN');
      try {
        const results: T[] = [];
        for (const stmt of statements) {
          const r = await stmt.run();
          results.push(r as unknown as T);
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const dbPath = path.resolve(process.cwd(), process.env.LOCAL_DB_PATH || '.local-cms.sqlite');
  const localD1 = createLocalD1Adapter(dbPath);

  const workerEnv: WorkerEnv = {
    DB: localD1,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
    GITHUB_OWNER: process.env.GITHUB_OWNER || '',
    GITHUB_REPO: process.env.GITHUB_REPO || '',
    GITHUB_BRANCH: process.env.GITHUB_BRANCH || 'main',
    GITHUB_CONTENT_PATH: process.env.GITHUB_CONTENT_PATH || 'src/content/blog',
    BLOG_DOMAIN: process.env.BLOG_DOMAIN || 'https://ndh.io.vn',
    JWT_SECRET: process.env.JWT_SECRET || EPHEMERAL_DEV_JWT_SECRET,
  };

  // Forward all /api/* requests into the exact same Cloudflare Worker handler
  app.use('/api', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
    try {
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || `localhost:${PORT}`;
      const fullUrl = new URL(req.originalUrl, `${proto}://${host}`);

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
          value.forEach((v) => headers.append(key, v));
        } else if (typeof value === 'string') {
          headers.set(key, value);
        }
      }

      const method = req.method.toUpperCase();
      const hasBody = method !== 'GET' && method !== 'HEAD';
      const rawBody = hasBody && Buffer.isBuffer(req.body) && req.body.length > 0 ? new Uint8Array(req.body) : undefined;

      const webRequest = new Request(fullUrl.toString(), {
        method,
        headers,
        body: rawBody,
      });

      const webResponse = await handleApi(webRequest, workerEnv, fullUrl);

      res.status(webResponse.status);
      webResponse.headers.forEach((val, key) => {
        if (key.toLowerCase() === 'set-cookie') {
          res.append('Set-Cookie', val);
        } else {
          res.setHeader(key, val);
        }
      });

      const responseBuffer = Buffer.from(await webResponse.arrayBuffer());
      res.send(responseBuffer);
    } catch (err) {
      console.error('[Dev Server API Bridge Error]', err);
      res.status(500).json({ ok: false, error: 'Lỗi máy chủ cục bộ.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NDH Blog CMS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
