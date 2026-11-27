export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta?: { last_row_id?: number; changes?: number } }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}

export interface AssetsFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface WorkerEnv {
  DB: D1Database;
  ASSETS?: AssetsFetcher;
  GITHUB_TOKEN?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  GITHUB_CONTENT_PATH?: string;
  BLOG_DOMAIN?: string;
  JWT_SECRET?: string;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  full_name: string;
  role: 'admin' | 'member';
  created_at: string;
}

interface PublicUser {
  id: number;
  username: string;
  full_name: string;
  role: 'admin' | 'member';
}

interface PostRow {
  id: number;
  title: string;
  slug: string;
  published_slug: string | null;
  description: string;
  tags: string;
  cover: string;
  reading_time: number;
  content: string;
  status: 'draft' | 'pending' | 'published' | 'rejected';
  author_id: number;
  approved_by: number | null;
  reject_reason: string | null;
  delete_requested: number;
  delete_reason: string | null;
  created_at: string;
  updated_at: string;
  author_name?: string;
  author_role?: 'admin' | 'member';
}

const RESERVED_SLUGS = ['tool', 'tag', 'gioi-thieu', 'tim-kiem', '404', 'api', 'admin', 'login', 'register'];
const COOKIE_NAME = 'ndh_cms_session';
const SESSION_TTL_SECONDS = 604800; // 7 days

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url);
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not Found', { status: 404 });
  },
};

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function nowVietnam(): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function todayVietnam(): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function sanitizeBlogDomain(raw?: string): string {
  const fallback = 'https://ndh.io.vn';
  if (!raw) return fallback;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (/^https?:\/\/[a-zA-Z0-9.-]+(:\d+)?$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

function isSafeCoverUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//');
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// --- PBKDF2-SHA256 PASSWORD HASHING & CONSTANT-TIME VERIFICATION ---
function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return new Uint8Array(0);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function hashPassword(password: string, saltBytes?: Uint8Array): Promise<string> {
  const salt = saltBytes ?? crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `pbkdf2$100000$${toHex(salt)}$${toHex(derivedBits)}`;
}

async function verifyPassword(
  password: string,
  storedHash: string | null | undefined
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (!storedHash) return { valid: false, needsUpgrade: false };

  // Legacy INIT: upgrade path (for users migrating existing D1 records)
  if (storedHash.startsWith('INIT:')) {
    const rawInit = storedHash.slice(5);
    const enc = new TextEncoder();
    const valid = timingSafeEqualBytes(enc.encode(password), enc.encode(rawInit));
    return { valid, needsUpgrade: valid };
  }

  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return { valid: false, needsUpgrade: false };
  }
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 500000) {
    return { valid: false, needsUpgrade: false };
  }
  const salt = fromHex(parts[2]);
  const expectedHash = fromHex(parts[3]);
  if (salt.length === 0 || expectedHash.length === 0) {
    return { valid: false, needsUpgrade: false };
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const actualHash = new Uint8Array(derivedBits);
  const valid = timingSafeEqualBytes(actualHash, expectedHash);
  return { valid, needsUpgrade: valid && iterations < 100000 };
}

// --- WEB CRYPTO HMAC-SHA256 JWT ---
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

function base64UrlEncodeStr(str: string): string {
  return bytesToBase64(new TextEncoder().encode(str))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecodeStr(b64url: string): string {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const bin = atob(padded + '='.repeat(padLen));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function getJwtKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signSessionToken(payload: { uid: number; exp: number }, secret: string): Promise<string> {
  const header = base64UrlEncodeStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncodeStr(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const key = await getJwtKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = bytesToBase64(new Uint8Array(sig))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${data}.${sigB64}`;
}

async function verifySessionToken(
  token: string | null,
  secret: string | undefined
): Promise<{ uid: number; exp: number } | null> {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const [header, body, sigB64] = parts;
    const key = await getJwtKey(secret);
    const padded = sigB64.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const sigBin = atob(padded + '='.repeat(padLen));
    const sigBytes = new Uint8Array(sigBin.length);
    for (let i = 0; i < sigBin.length; i++) sigBytes[i] = sigBin.charCodeAt(i);

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(`${header}.${body}`)
    );
    if (!valid) return null;

    const payload = JSON.parse(base64UrlDecodeStr(body)) as { uid?: number; exp?: number };
    if (!payload.uid || (payload.exp && Date.now() / 1000 > payload.exp)) {
      return null;
    }
    return { uid: Number(payload.uid), exp: Number(payload.exp || 0) };
  } catch {
    return null;
  }
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') || '';
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = header.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? match[1] : null;
}

function getSessionToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  return getCookie(request, COOKIE_NAME);
}

function buildCookieHeader(token: string, isHttps: boolean, maxAge = SESSION_TTL_SECONDS): string {
  if (isHttps) {
    return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=${maxAge}`;
  }
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function verifyMutationCsrf(request: Request, url: URL): boolean {
  const customHeader = request.headers.get('X-Requested-With');
  if (customHeader === 'NDH-CMS') {
    return true;
  }
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers.get('X-Forwarded-Host') || request.headers.get('Host') || url.host;
    return originUrl.host === forwardedHost || originUrl.host === url.host;
  } catch {
    return false;
  }
}

async function getAuthUser(request: Request, env: WorkerEnv): Promise<PublicUser | null> {
  const token = getSessionToken(request);
  const session = await verifySessionToken(token, env.JWT_SECRET);
  if (!session || !session.uid) return null;
  const user = await env.DB.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?')
    .bind(session.uid)
    .first<PublicUser>();
  return user || null;
}

// --- SLUG & READING TIME ---
export function vietnameseToSlug(str: string): string {
  const s = String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
  return s || `bai-viet-${Math.floor(Date.now() / 1000)}`;
}

async function generateUniqueSlug(db: D1Database, rawInput: string, excludePostId = 0): Promise<string> {
  const baseSlug = vietnameseToSlug(rawInput).slice(0, 120);
  let slug = baseSlug;
  let counter = 1;

  while (counter < 500) {
    if (!RESERVED_SLUGS.includes(slug)) {
      const row = await db
        .prepare('SELECT COUNT(*) AS cnt FROM posts WHERE (slug = ? OR published_slug = ?) AND id != ?')
        .bind(slug, slug, excludePostId)
        .first<{ cnt: number }>();
      if (!row || Number(row.cnt) === 0) {
        return slug;
      }
    }
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  return `${baseSlug}-${Date.now()}`;
}

function estimateReadingTime(markdown: string): number {
  const text = String(markdown || '');
  let codeLines = 0;
  const blocks = text.match(/```[\s\S]*?```/g) || [];
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim() !== '' && !l.trim().startsWith('```'));
    codeLines += lines.length;
  }
  const prose = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' congthuc ')
    .replace(/\$[^\n$]+?\$/g, ' congthuc ')
    .replace(/[#*`>\-|[\]()]+/g, ' ')
    .trim();
  const words = prose ? prose.split(/\s+/).length : 0;
  return Math.max(1, Math.ceil(words / 200 + codeLines / 15));
}

async function notifyAllAdmins(db: D1Database, postTitle: string, actionType: string, message: string): Promise<void> {
  const { results } = await db.prepare("SELECT id FROM users WHERE role = 'admin'").all<{ id: number }>();
  if (!results || results.length === 0) return;
  const now = nowVietnam();
  const stmt = db.prepare(
    'INSERT INTO notifications (user_id, post_title, action_type, message, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  await db.batch(results.map((adm) => stmt.bind(adm.id, postTitle, actionType, message, now)));
}

// --- GITHUB API (STRICTLY SERVER-SIDE — PAT NEVER LEAVES WORKER/SERVER) ---
function utf8ToBase64(str: string): string {
  return bytesToBase64(new TextEncoder().encode(str));
}

function formatBlogMarkdown(post: {
  title: string;
  description: string;
  tags: string;
  cover: string;
  content: string;
  created_at?: string;
}): string {
  const escapeYaml = (val: string) =>
    String(val || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');

  const pubDate = post.created_at ? String(post.created_at).slice(0, 10) : todayVietnam();
  const cleanBody = String(post.content || '').replace(/\r\n?/g, '\n').trim();
  const readingTime = estimateReadingTime(cleanBody);
  const coverUrl = String(post.cover || '').trim();

  let tagsArray = String(post.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tagsArray.length === 0) tagsArray = ['Chung'];

  let fm = '---\n';
  fm += `title: "${escapeYaml(post.title)}"\n`;
  fm += `description: "${escapeYaml(post.description)}"\n`;
  fm += `pubDate: "${pubDate}"\n`;
  fm += 'tags:\n';
  for (const tag of tagsArray) {
    fm += `  - "${escapeYaml(tag)}"\n`;
  }
  fm += `readingTimeMinutes: ${readingTime}\n`;
  if (coverUrl !== '' && isSafeCoverUrl(coverUrl)) {
    fm += `cover: "${escapeYaml(coverUrl)}"\n`;
  }
  fm += '---\n\n';
  return `${fm}${cleanBody}\n`;
}

function getSafeGithubConfig(env: WorkerEnv) {
  const owner = (env.GITHUB_OWNER || '').trim();
  const repo = (env.GITHUB_REPO || '').trim();
  const branch = (env.GITHUB_BRANCH || 'main').trim();
  const contentPath = (env.GITHUB_CONTENT_PATH || 'src/content/blog').trim().replace(/^\/+|\/+$/g, '');
  const hasToken = Boolean(env.GITHUB_TOKEN && env.GITHUB_TOKEN.trim().length > 0);
  const hasRepo =
    Boolean(owner && repo) &&
    owner !== 'your-github-username' &&
    repo !== 'your-blog-repo' &&
    /^[a-zA-Z0-9._-]+$/.test(owner) &&
    /^[a-zA-Z0-9._-]+$/.test(repo);

  return {
    configured: hasToken && hasRepo,
    hasToken,
    hasRepo,
    owner: owner || '(chưa cấu hình)',
    repo: repo || '(chưa cấu hình)',
    branch,
    contentPath,
  };
}

function mapGitHubError(status: number, message?: string): string {
  if (status === 401) {
    return 'Token GitHub (PAT) không hợp lệ hoặc đã hết hạn. Vui lòng cập nhật Secret GITHUB_TOKEN.';
  }
  if (status === 403) {
    return 'Token GitHub (PAT) không đủ quyền Contents (Read and write) trên repository này.';
  }
  if (status === 404) {
    return 'Không tìm thấy repository, nhánh hoặc đường dẫn nội dung trên GitHub.';
  }
  if (status === 409 || status === 422) {
    return 'Xung đột phiên bản tệp trên GitHub. Vui lòng tải lại và thử lại.';
  }
  return message ? `Lỗi GitHub (${status}): ${message}` : `Lỗi kết nối GitHub API (HTTP ${status}).`;
}

async function githubRequest(
  env: WorkerEnv,
  method: 'GET' | 'PUT' | 'DELETE',
  endpoint: string,
  payload: Record<string, unknown> | null = null
): Promise<{ ok: boolean; status?: number; data?: Record<string, unknown>; error?: string }> {
  const cfg = getSafeGithubConfig(env);
  if (!cfg.hasToken) {
    return { ok: false, error: 'Chưa cấu hình Secret GITHUB_TOKEN trên máy chủ Cloudflare Worker.' };
  }
  if (!cfg.hasRepo) {
    return { ok: false, error: 'Chưa cấu hình hợp lệ GITHUB_OWNER và GITHUB_REPO trong wrangler.toml / biến môi trường.' };
  }

  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/${cleanEndpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.GITHUB_TOKEN!.trim()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'NDH-Cloudflare-CMS',
  };
  const init: RequestInit = { method, headers };
  if (payload !== null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(payload);
  }

  try {
    const res = await fetch(apiUrl, init);
    const text = await res.text();
    let data: Record<string, unknown> | undefined;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = undefined;
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: mapGitHubError(res.status, typeof data?.message === 'string' ? data.message : undefined),
      };
    }
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, error: 'Không thể kết nối tới GitHub API. Vui lòng kiểm tra mạng hoặc thử lại.' };
  }
}

function buildSafeGitHubFilePath(env: WorkerEnv, slug: string): string | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const dir = (env.GITHUB_CONTENT_PATH || 'src/content/blog')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (dir.includes('..')) return null;
  return dir ? `${dir}/${slug}.md` : `${slug}.md`;
}

async function getGitHubFileSha(env: WorkerEnv, filePath: string): Promise<string | null> {
  const branch = encodeURIComponent((env.GITHUB_BRANCH || 'main').trim());
  const encodedPath = filePath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const res = await githubRequest(env, 'GET', `contents/${encodedPath}?ref=${branch}`);
  return res.ok && typeof res.data?.sha === 'string' ? res.data.sha : null;
}

async function deletePostFromGitHub(env: WorkerEnv, slug: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!slug) return { ok: true };
  const filePath = buildSafeGitHubFilePath(env, slug);
  if (!filePath) return { ok: false, error: 'Slug bài viết không hợp lệ.' };

  const sha = await getGitHubFileSha(env, filePath);
  if (!sha) return { ok: true };

  const encodedPath = filePath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return githubRequest(env, 'DELETE', `contents/${encodedPath}`, {
    message: `cms: delete ${slug}.md`,
    sha,
    branch: (env.GITHUB_BRANCH || 'main').trim(),
  });
}

async function pushPostToGitHub(
  env: WorkerEnv,
  post: {
    title: string;
    slug: string;
    description: string;
    tags: string;
    cover: string;
    content: string;
    created_at?: string;
  },
  oldSlug: string | null = null
): Promise<{ ok: boolean; error?: string }> {
  const filePath = buildSafeGitHubFilePath(env, post.slug);
  if (!filePath) return { ok: false, error: 'Slug bài viết không hợp lệ.' };

  const sha = await getGitHubFileSha(env, filePath);
  const markdownFull = formatBlogMarkdown(post);
  const encodedPath = filePath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

  const payload: Record<string, unknown> = {
    message: `${sha ? 'cms: update ' : 'cms: publish '}${post.slug}.md`,
    content: utf8ToBase64(markdownFull),
    branch: (env.GITHUB_BRANCH || 'main').trim(),
  };
  if (sha) payload.sha = sha;

  // Push new/updated file FIRST so we never lose data if the PUT fails
  const putRes = await githubRequest(env, 'PUT', `contents/${encodedPath}`, payload);
  if (!putRes.ok) {
    return putRes;
  }

  // Only delete old slug file AFTER the new file is safely committed
  if (oldSlug && oldSlug !== post.slug) {
    await deletePostFromGitHub(env, oldSlug);
  }
  return { ok: true };
}

async function parseJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

// --- MAIN API ROUTER ---
export async function handleApi(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const isHttps =
    url.protocol === 'https:' || (request.headers.get('X-Forwarded-Proto') || '').toLowerCase() === 'https';
  const blogDomain = sanitizeBlogDomain(env.BLOG_DOMAIN);

  if (!env.DB) {
    return jsonResponse(
      { ok: false, error: 'Chưa gắn Cloudflare D1 Database (binding DB) cho Worker.' },
      500
    );
  }

  if (method !== 'GET' && method !== 'HEAD') {
    if (!verifyMutationCsrf(request, url)) {
      return jsonResponse({ ok: false, error: 'Yêu cầu không hợp lệ (CSRF check failed).' }, 403);
    }
  }

  try {
    // 0. Check whether first-run admin setup is needed
    if (path === '/api/setup/status' && method === 'GET') {
      const adminCount = await env.DB.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'").first<{
        cnt: number;
      }>();
      return jsonResponse({
        ok: true,
        needsAdminSetup: !adminCount || Number(adminCount.cnt) === 0,
        blogDomain,
      });
    }

    // 0b. First-run one-time Admin creation (permanently locked once 1 admin exists)
    if (path === '/api/setup/admin' && method === 'POST') {
      if (!env.JWT_SECRET) {
        return jsonResponse(
          { ok: false, error: 'Chưa cấu hình Secret JWT_SECRET trên máy chủ.' },
          500
        );
      }

      const adminCount = await env.DB.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'").first<{
        cnt: number;
      }>();
      if (adminCount && Number(adminCount.cnt) > 0) {
        return jsonResponse(
          { ok: false, error: 'Hệ thống đã có tài khoản Quản trị viên. Vui lòng đăng nhập.' },
          403
        );
      }

      const body = await parseJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'Dữ liệu không hợp lệ.' }, 400);

      const fullName = String(body.full_name || '').trim();
      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      if (!fullName || !username || !password) {
        return jsonResponse({ ok: false, error: 'Vui lòng điền đầy đủ họ tên, tên đăng nhập và mật khẩu.' }, 400);
      }
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        return jsonResponse(
          { ok: false, error: 'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu gạch dưới (3–30 ký tự).' },
          400
        );
      }
      if (password.length < 6) {
        return jsonResponse({ ok: false, error: 'Mật khẩu quản trị phải có ít nhất 6 ký tự.' }, 400);
      }

      const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
      if (exists) {
        return jsonResponse({ ok: false, error: 'Tên đăng nhập này đã tồn tại.' }, 400);
      }

      const passHash = await hashPassword(password);
      const now = nowVietnam();
      const insertRes = await env.DB.prepare(
        "INSERT INTO users (username, password_hash, full_name, role, created_at) VALUES (?, ?, ?, 'admin', ?)"
      )
        .bind(username, passHash, fullName, now)
        .run();

      const uid = Number(insertRes.meta?.last_row_id || 0);
      const token = await signSessionToken(
        { uid, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS },
        env.JWT_SECRET
      );

      return jsonResponse(
        {
          ok: true,
          token,
          user: { id: uid, username, full_name: fullName, role: 'admin' },
        },
        201,
        { 'Set-Cookie': buildCookieHeader(token, isHttps, SESSION_TTL_SECONDS) }
      );
    }

    // 1. Register member account
    if (path === '/api/register' && method === 'POST') {
      const body = await parseJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'Dữ liệu không hợp lệ.' }, 400);

      const fullName = String(body.full_name || '').trim();
      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      if (!fullName || !username || !password) {
        return jsonResponse({ ok: false, error: 'Vui lòng điền đầy đủ thông tin.' }, 400);
      }
      if (fullName.length > 80) {
        return jsonResponse({ ok: false, error: 'Họ và tên tối đa 80 ký tự.' }, 400);
      }
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        return jsonResponse(
          { ok: false, error: 'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu gạch dưới (3–30 ký tự).' },
          400
        );
      }
      if (password.length < 6) {
        return jsonResponse({ ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' }, 400);
      }

      const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
      if (exists) {
        return jsonResponse({ ok: false, error: 'Tên đăng nhập này đã được sử dụng.' }, 400);
      }

      const passHash = await hashPassword(password);
      await env.DB.prepare(
        "INSERT INTO users (username, password_hash, full_name, role, created_at) VALUES (?, ?, ?, 'member', ?)"
      )
        .bind(username, passHash, fullName, nowVietnam())
        .run();

      return jsonResponse({ ok: true }, 201);
    }

    // 2. Login
    if (path === '/api/login' && method === 'POST') {
      if (!env.JWT_SECRET) {
        return jsonResponse({ ok: false, error: 'Chưa cấu hình Secret JWT_SECRET trên máy chủ.' }, 500);
      }
      const body = await parseJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'Dữ liệu không hợp lệ.' }, 400);

      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      const u = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<UserRow>();
      if (!u) {
        return jsonResponse({ ok: false, error: 'Sai tên đăng nhập hoặc mật khẩu.' }, 401);
      }

      const check = await verifyPassword(password, u.password_hash);
      if (!check.valid) {
        return jsonResponse({ ok: false, error: 'Sai tên đăng nhập hoặc mật khẩu.' }, 401);
      }

      if (check.needsUpgrade) {
        const upgraded = await hashPassword(password);
        await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(upgraded, u.id).run();
      }

      const token = await signSessionToken(
        { uid: u.id, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS },
        env.JWT_SECRET
      );

      return jsonResponse(
        {
          ok: true,
          token,
          user: { id: u.id, username: u.username, full_name: u.full_name, role: u.role },
        },
        200,
        { 'Set-Cookie': buildCookieHeader(token, isHttps, SESSION_TTL_SECONDS) }
      );
    }

    // 3. Logout
    if (path === '/api/logout' && method === 'POST') {
      return jsonResponse({ ok: true }, 200, { 'Set-Cookie': buildCookieHeader('', isHttps, 0) });
    }

    // --- PROTECTED ROUTES ---
    const user = await getAuthUser(request, env);
    if (!user) {
      return jsonResponse({ ok: false, error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' }, 401);
    }

    // 4. Current user + unread notifications
    if (path === '/api/me' && method === 'GET') {
      const { results: notifications } = await env.DB.prepare(
        'SELECT id, post_title, action_type, message, created_at FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY id DESC LIMIT 50'
      )
        .bind(user.id)
        .all();

      return jsonResponse({
        ok: true,
        user,
        notifications: notifications || [],
        blogDomain,
        githubConfigured: user.role === 'admin' ? getSafeGithubConfig(env).configured : undefined,
      });
    }

    // 5. Mark single notification read
    if (path === '/api/notifications/read' && method === 'POST') {
      const body = await parseJsonBody(request);
      const id = Number(body?.id || 0);
      await env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
        .bind(id, user.id)
        .run();
      return jsonResponse({ ok: true });
    }

    // 5b. Mark all notifications read
    if (path === '/api/notifications/read-all' && method === 'POST') {
      await env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
        .bind(user.id)
        .run();
      return jsonResponse({ ok: true });
    }

    // 6. Account Profile & Password
    if (path === '/api/account/profile' && method === 'POST') {
      const body = await parseJsonBody(request);
      const fullName = String(body?.full_name || '').trim();
      const username = String(body?.username || '').trim();
      if (!fullName || !username) {
        return jsonResponse({ ok: false, error: 'Họ tên và tên đăng nhập không được để trống.' }, 400);
      }
      if (fullName.length > 80) {
        return jsonResponse({ ok: false, error: 'Họ và tên tối đa 80 ký tự.' }, 400);
      }
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        return jsonResponse({ ok: false, error: 'Tên đăng nhập không hợp lệ (3–30 ký tự không dấu).' }, 400);
      }
      const dup = await env.DB.prepare('SELECT id FROM users WHERE username = ? AND id != ?')
        .bind(username, user.id)
        .first();
      if (dup) {
        return jsonResponse({ ok: false, error: 'Tên đăng nhập này đã có người sử dụng.' }, 400);
      }
      await env.DB.prepare('UPDATE users SET full_name = ?, username = ? WHERE id = ?')
        .bind(fullName, username, user.id)
        .run();
      return jsonResponse({ ok: true, user: { ...user, full_name: fullName, username } });
    }

    if (path === '/api/account/password' && method === 'POST') {
      const body = await parseJsonBody(request);
      const currentPass = String(body?.current_password || '');
      const newPass = String(body?.new_password || '');
      if (newPass.length < 6) {
        return jsonResponse({ ok: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' }, 400);
      }
      const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
        .bind(user.id)
        .first<{ password_hash: string }>();
      const check = await verifyPassword(currentPass, row?.password_hash);
      if (!check.valid) {
        return jsonResponse({ ok: false, error: 'Mật khẩu hiện tại không chính xác.' }, 400);
      }
      const newHash = await hashPassword(newPass);
      await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, user.id).run();
      return jsonResponse({ ok: true });
    }

    // 6b. Admin GitHub status check (strictly non-secret metadata only)
    if (path === '/api/github/status' && method === 'GET') {
      if (user.role !== 'admin') return jsonResponse({ ok: false, error: 'Forbidden' }, 403);
      return jsonResponse({ ok: true, github: getSafeGithubConfig(env) });
    }

    // 6c. Admin User Management (list, promote, demote)
    if (path === '/api/users' && method === 'GET') {
      if (user.role !== 'admin') return jsonResponse({ ok: false, error: 'Forbidden' }, 403);
      const { results } = await env.DB.prepare(`
        SELECT u.id, u.username, u.full_name, u.role, u.created_at,
               (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS post_count
        FROM users u
        ORDER BY CASE u.role WHEN 'admin' THEN 0 ELSE 1 END, u.id ASC
      `).all();
      return jsonResponse({ ok: true, users: results || [] });
    }

    if (path === '/api/users/promote' && method === 'POST') {
      if (user.role !== 'admin') return jsonResponse({ ok: false, error: 'Forbidden' }, 403);
      const body = await parseJsonBody(request);
      const targetId = Number(body?.user_id || 0);
      const target = await env.DB.prepare("SELECT id, full_name FROM users WHERE id = ? AND role = 'member'")
        .bind(targetId)
        .first<{ id: number; full_name: string }>();
      if (!target) {
        return jsonResponse({ ok: false, error: 'Không tìm thấy thành viên hợp lệ.' }, 404);
      }
      await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(targetId).run();
      await env.DB.prepare(
        "INSERT INTO notifications (user_id, post_title, action_type, message, created_at) VALUES (?, 'Nâng cấp quyền hạn', 'promoted', ?, ?)"
      )
        .bind(
          targetId,
          `Tài khoản của bạn đã được Quản trị viên (${user.full_name}) phong quyền Admin.`,
          nowVietnam()
        )
        .run();
      return jsonResponse({ ok: true });
    }

    if (path === '/api/users/demote' && method === 'POST') {
      if (user.role !== 'admin') return jsonResponse({ ok: false, error: 'Forbidden' }, 403);
      const body = await parseJsonBody(request);
      const targetId = Number(body?.user_id || 0);
      if (targetId === user.id) {
        return jsonResponse({ ok: false, error: 'Bạn không thể tự hạ quyền tài khoản của chính mình.' }, 400);
      }
      const adminCount = await env.DB.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'").first<{
        cnt: number;
      }>();
      if (!adminCount || Number(adminCount.cnt) <= 1) {
        return jsonResponse({ ok: false, error: 'Hệ thống phải có ít nhất 1 Quản trị viên.' }, 400);
      }
      const target = await env.DB.prepare("SELECT id, full_name FROM users WHERE id = ? AND role = 'admin'")
        .bind(targetId)
        .first<{ id: number; full_name: string }>();
      if (!target) {
        return jsonResponse({ ok: false, error: 'Không tìm thấy Quản trị viên hợp lệ.' }, 404);
      }
      await env.DB.prepare("UPDATE users SET role = 'member' WHERE id = ?").bind(targetId).run();
      await env.DB.prepare(
        "INSERT INTO notifications (user_id, post_title, action_type, message, created_at) VALUES (?, 'Cập nhật quyền hạn', 'demoted', ?, ?)"
      )
        .bind(
          targetId,
          `Quyền tài khoản của bạn đã được Quản trị viên (${user.full_name}) chuyển về Thành viên.`,
          nowVietnam()
        )
        .run();
      return jsonResponse({ ok: true });
    }

    // 7. Unique slug check
    if (path === '/api/slug/check' && method === 'GET') {
      const text = url.searchParams.get('text') || '';
      const excludeId = Number(url.searchParams.get('exclude_id') || 0);
      const slug = await generateUniqueSlug(env.DB, text, excludeId);
      return jsonResponse({ ok: true, slug });
    }

    // 8. List posts
    if (path === '/api/posts' && method === 'GET') {
      const query =
        user.role === 'admin'
          ? env.DB.prepare(`
              SELECT p.id, p.title, p.slug, p.published_slug, p.description, p.tags, p.reading_time, p.status,
                     p.author_id, p.reject_reason, p.delete_requested, p.delete_reason, p.created_at, p.updated_at,
                     u.full_name AS author_name, u.role AS author_role
              FROM posts p
              JOIN users u ON p.author_id = u.id
              WHERE (p.status != 'draft' OR p.author_id = ?)
              ORDER BY p.delete_requested DESC,
                       CASE p.status WHEN 'pending' THEN 1 WHEN 'draft' THEN 2 WHEN 'published' THEN 3 ELSE 4 END,
                       p.updated_at DESC
            `).bind(user.id)
          : env.DB.prepare(`
              SELECT p.id, p.title, p.slug, p.published_slug, p.description, p.tags, p.reading_time, p.status,
                     p.author_id, p.reject_reason, p.delete_requested, p.delete_reason, p.created_at, p.updated_at,
                     u.full_name AS author_name, u.role AS author_role
              FROM posts p
              JOIN users u ON p.author_id = u.id
              WHERE p.author_id = ?
              ORDER BY CASE p.status WHEN 'draft' THEN 1 WHEN 'rejected' THEN 2 WHEN 'pending' THEN 3 ELSE 4 END,
                       p.updated_at DESC
            `).bind(user.id);

      const { results } = await query.all();
      return jsonResponse({ ok: true, posts: results || [] });
    }

    // 9. Post detail
    if (path === '/api/posts/detail' && method === 'GET') {
      const id = Number(url.searchParams.get('id') || 0);
      const post = await env.DB.prepare(`
        SELECT p.*, u.full_name AS author_name, u.role AS author_role
        FROM posts p
        JOIN users u ON p.author_id = u.id
        WHERE p.id = ?
      `)
        .bind(id)
        .first<PostRow>();
      if (!post) return jsonResponse({ ok: false, error: 'Không tìm thấy bài viết.' }, 404);
      if (user.role !== 'admin' && post.author_id !== user.id) {
        return jsonResponse({ ok: false, error: 'Bạn không có quyền truy cập bài viết này.' }, 403);
      }
      return jsonResponse({ ok: true, post });
    }

    // 10. Auto-save draft (5s debounce)
    if (path === '/api/posts/autosave' && method === 'POST') {
      const body = await parseJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'Dữ liệu không hợp lệ.' }, 400);

      const postId = Number(body.post_id || 0);
      const title = String(body.title || '').trim();
      const rawSlug = String(body.slug || '').trim();
      const description = String(body.description || '').trim();
      const tags = String(body.tags || '').trim();
      const cover = String(body.cover || '').trim();
      const content = String(body.content || '').replace(/\r\n?/g, '\n');

      if (!title && !content.trim()) {
        return jsonResponse({ ok: false, skipped: true });
      }
      if (!isSafeCoverUrl(cover)) {
        return jsonResponse({ ok: false, error: 'URL ảnh bìa không hợp lệ (chỉ hỗ trợ http://, https:// hoặc /...).' }, 400);
      }

      const saveTitle = title || `Bản nháp ngày ${nowVietnam().slice(0, 16)}`;
      const readingTime = estimateReadingTime(content);
      const now = nowVietnam();

      if (postId > 0) {
        const existing = await env.DB.prepare('SELECT id, author_id, status, published_slug FROM posts WHERE id = ?')
          .bind(postId)
          .first<PostRow>();
        if (!existing || (user.role !== 'admin' && existing.author_id !== user.id)) {
          return jsonResponse({ ok: false, error: 'Không có quyền chỉnh sửa.' }, 403);
        }
        // Do not silently overwrite live published or pending posts during autosave
        if (existing.status === 'published' || existing.status === 'pending') {
          return jsonResponse({ ok: true, mode: 'manual_required', saved_at: now.slice(11) });
        }

        const uniqueSlug = await generateUniqueSlug(env.DB, rawSlug || saveTitle, postId);
        await env.DB.prepare(
          'UPDATE posts SET title = ?, slug = ?, description = ?, tags = ?, cover = ?, reading_time = ?, content = ?, updated_at = ? WHERE id = ?'
        )
          .bind(saveTitle, uniqueSlug, description, tags, cover, readingTime, content, now, postId)
          .run();

        return jsonResponse({
          ok: true,
          mode: 'db',
          post_id: postId,
          slug: uniqueSlug,
          saved_at: now.slice(11),
        });
      }

      const uniqueSlug = await generateUniqueSlug(env.DB, rawSlug || saveTitle, 0);
      const res = await env.DB.prepare(
        "INSERT INTO posts (title, slug, description, tags, cover, reading_time, content, status, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)"
      )
        .bind(saveTitle, uniqueSlug, description, tags, cover, readingTime, content, user.id, now, now)
        .run();

      return jsonResponse({
        ok: true,
        mode: 'db',
        post_id: Number(res.meta?.last_row_id || 0),
        slug: uniqueSlug,
        saved_at: now.slice(11),
      });
    }

    // 11. Manual save draft / Submit for review / Publish to GitHub
    if (path === '/api/posts/save' && method === 'POST') {
      const body = await parseJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'Dữ liệu không hợp lệ.' }, 400);

      const postId = Number(body.post_id || 0);
      const isDraft = Boolean(body.is_draft);
      const title = String(body.title || '').trim();
      const rawSlug = String(body.slug || '').trim();
      const description = String(body.description || '').trim();
      const tags = String(body.tags || '').trim();
      const cover = String(body.cover || '').trim();
      const content = String(body.content || '').replace(/\r\n?/g, '\n');

      if (!isDraft && (!title || !content.trim())) {
        return jsonResponse({ ok: false, error: 'Vui lòng nhập đầy đủ Tiêu đề và Nội dung Markdown.' }, 400);
      }
      if (isDraft && !title && !content.trim()) {
        return jsonResponse({ ok: false, error: 'Vui lòng nhập ít nhất Tiêu đề hoặc Nội dung để lưu nháp.' }, 400);
      }
      if (!isSafeCoverUrl(cover)) {
        return jsonResponse(
          { ok: false, error: 'URL ảnh bìa không hợp lệ. Chỉ chấp nhận đường dẫn https://, http:// hoặc /...' },
          400
        );
      }

      let existing: PostRow | null = null;
      if (postId > 0) {
        existing = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(postId).first<PostRow>();
        if (!existing) return jsonResponse({ ok: false, error: 'Không tìm thấy bài viết.' }, 404);
        if (user.role !== 'admin' && existing.author_id !== user.id) {
          return jsonResponse({ ok: false, error: 'Không có quyền chỉnh sửa.' }, 403);
        }
        // Prevent accidentally turning a live published post back into a draft
        if (isDraft && existing.status === 'published') {
          return jsonResponse(
            {
              ok: false,
              error:
                user.role === 'admin'
                  ? 'Bài viết này đang xuất bản. Hãy bấm "Cập nhật lên GitHub" để lưu thay đổi.'
                  : 'Bài viết này đang xuất bản trên blog. Hãy bấm "Gửi bài chờ Admin duyệt" để đề xuất cập nhật.',
            },
            400
          );
        }
      }

      const finalTitle = title || `Bản nháp ngày ${nowVietnam().slice(0, 16)}`;
      const uniqueSlug = await generateUniqueSlug(env.DB, rawSlug || finalTitle, postId);
      const readingTime = estimateReadingTime(content);
      const now = nowVietnam();
      const createdAt = existing?.created_at || now;
      const liveSlugOnGithub =
        existing?.published_slug || (existing?.status === 'published' ? existing.slug : null);
      const newStatus: PostRow['status'] = isDraft
        ? 'draft'
        : user.role === 'admin'
          ? 'published'
          : 'pending';

      let nextPublishedSlug = liveSlugOnGithub;
      if (newStatus === 'published') {
        const gh = await pushPostToGitHub(
          env,
          { title: finalTitle, slug: uniqueSlug, description, tags, cover, content, created_at: createdAt },
          liveSlugOnGithub
        );
        if (!gh.ok) {
          return jsonResponse({ ok: false, error: gh.error || 'Không thể xuất bản lên GitHub.' }, 502);
        }
        nextPublishedSlug = uniqueSlug;
      }

      let savedPostId = postId;
      if (postId > 0) {
        await env.DB.prepare(
          'UPDATE posts SET title = ?, slug = ?, published_slug = ?, description = ?, tags = ?, cover = ?, reading_time = ?, content = ?, status = ?, approved_by = ?, reject_reason = NULL, updated_at = ? WHERE id = ?'
        )
          .bind(
            finalTitle,
            uniqueSlug,
            nextPublishedSlug,
            description,
            tags,
            cover,
            readingTime,
            content,
            newStatus,
            user.role === 'admin' && newStatus === 'published' ? user.id : existing?.approved_by ?? null,
            now,
            postId
          )
          .run();
      } else {
        const insertRes = await env.DB.prepare(
          'INSERT INTO posts (title, slug, published_slug, description, tags, cover, reading_time, content, status, author_id, approved_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
          .bind(
            finalTitle,
            uniqueSlug,
            nextPublishedSlug,
            description,
            tags,
            cover,
            readingTime,
            content,
            newStatus,
            user.id,
            user.role === 'admin' && newStatus === 'published' ? user.id : null,
            now,
            now
          )
          .run();
        savedPostId = Number(insertRes.meta?.last_row_id || 0);
      }

      if (user.role === 'member' && newStatus === 'pending') {
        const msg =
          postId > 0
            ? `Thành viên ${user.full_name} đã chỉnh sửa bài viết "${finalTitle}" và gửi lại chờ duyệt.`
            : `Thành viên ${user.full_name} đã gửi bài viết mới "${finalTitle}" chờ duyệt.`;
        await notifyAllAdmins(env.DB, finalTitle, postId > 0 ? 'edited' : 'submitted', msg);
      }

      return jsonResponse({
        ok: true,
        post_id: savedPostId,
        slug: uniqueSlug,
        message: isDraft
          ? 'Đã lưu bản nháp thành công!'
          : user.role === 'admin'
            ? `Đã xuất bản tệp ${uniqueSlug}.md lên GitHub thành công!`
            : 'Đã gửi bài viết thành công! Vui lòng chờ Admin phê duyệt.',
      });
    }

    // 12. Post moderation & deletion actions
    if (path === '/api/posts/action' && method === 'POST') {
      const body = await parseJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'Dữ liệu không hợp lệ.' }, 400);

      const postId = Number(body.post_id || 0);
      const action = String(body.action || '');
      const reason = String(body.reason || '').trim();

      const post = await env.DB.prepare(
        'SELECT p.*, u.full_name AS author_name, u.role AS author_role FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?'
      )
        .bind(postId)
        .first<PostRow>();

      if (!post) return jsonResponse({ ok: false, error: 'Không tìm thấy bài viết.' }, 404);
      const now = nowVietnam();

      // Admin approves pending post -> push to GitHub
      if (action === 'approve' && user.role === 'admin') {
        const gh = await pushPostToGitHub(env, post, post.published_slug || null);
        if (!gh.ok) {
          return jsonResponse({ ok: false, error: gh.error || 'Lỗi GitHub API khi duyệt bài.' }, 502);
        }
        await env.DB.prepare(
          "UPDATE posts SET status = 'published', published_slug = ?, approved_by = ?, reject_reason = NULL, updated_at = ? WHERE id = ?"
        )
          .bind(post.slug, user.id, now, postId)
          .run();

        if (post.author_role === 'member') {
          await env.DB.prepare(
            "INSERT INTO notifications (user_id, post_title, action_type, message, created_at) VALUES (?, ?, 'approved', ?, ?)"
          )
            .bind(
              post.author_id,
              post.title,
              `Bài viết "${post.title}" của bạn đã được Admin duyệt và xuất bản lên blog.`,
              now
            )
            .run();
        }
        return jsonResponse({ ok: true, message: `Đã duyệt và commit tệp ${post.slug}.md lên GitHub!` });
      }

      // Admin rejects pending post
      if (action === 'reject' && user.role === 'admin') {
        const rejectMsg = reason || 'Nội dung chưa đạt yêu cầu.';
        await env.DB.prepare("UPDATE posts SET status = 'rejected', reject_reason = ?, updated_at = ? WHERE id = ?")
          .bind(rejectMsg, now, postId)
          .run();

        if (post.author_role === 'member') {
          await env.DB.prepare(
            "INSERT INTO notifications (user_id, post_title, action_type, message, created_at) VALUES (?, ?, 'rejected', ?, ?)"
          )
            .bind(post.author_id, post.title, `Bài viết "${post.title}" bị từ chối. Lý do: ${rejectMsg}`, now)
            .run();
        }
        return jsonResponse({ ok: true, message: 'Đã từ chối bài viết và gửi thông báo cho tác giả.' });
      }

      // Member requests deletion of live published post
      if (action === 'request_delete' && post.author_id === user.id) {
        const delReason = reason || 'Tác giả yêu cầu gỡ bài viết.';
        await env.DB.prepare('UPDATE posts SET delete_requested = 1, delete_reason = ? WHERE id = ?')
          .bind(delReason, postId)
          .run();
        await notifyAllAdmins(
          env.DB,
          post.title,
          'delete_request',
          `Thành viên ${user.full_name} yêu cầu xóa bài viết "${post.title}". Lý do: ${delReason}`
        );
        return jsonResponse({ ok: true, message: 'Đã gửi yêu cầu xóa bài viết tới Quản trị viên.' });
      }

      // Member cancels delete request
      if (action === 'cancel_delete_request' && post.author_id === user.id) {
        await env.DB.prepare('UPDATE posts SET delete_requested = 0, delete_reason = NULL WHERE id = ?')
          .bind(postId)
          .run();
        return jsonResponse({ ok: true, message: 'Đã hủy yêu cầu xóa bài viết.' });
      }

      // Admin rejects delete request
      if (action === 'reject_delete' && user.role === 'admin') {
        await env.DB.prepare('UPDATE posts SET delete_requested = 0, delete_reason = NULL WHERE id = ?')
          .bind(postId)
          .run();
        if (post.author_role === 'member') {
          await env.DB.prepare(
            "INSERT INTO notifications (user_id, post_title, action_type, message, created_at) VALUES (?, ?, 'delete_rejected', ?, ?)"
          )
            .bind(
              post.author_id,
              post.title,
              `Yêu cầu xóa bài viết "${post.title}" của bạn không được Admin chấp thuận.`,
              now
            )
            .run();
        }
        return jsonResponse({ ok: true, message: 'Đã từ chối yêu cầu xóa bài viết.' });
      }

      // Delete post (Admin any; Member unpublished only)
      if (action === 'delete') {
        if (String(body.confirm_text || '') !== 'DELETE') {
          return jsonResponse(
            { ok: false, error: 'Vui lòng nhập chính xác chữ in hoa "DELETE" để xác nhận xóa.' },
            400
          );
        }

        const isLive = post.status === 'published' || Boolean(post.published_slug);
        const canDelete = user.role === 'admin' || (post.author_id === user.id && !isLive);
        if (!canDelete) {
          return jsonResponse({ ok: false, error: 'Bạn không có quyền xóa trực tiếp bài viết đã xuất bản.' }, 403);
        }

        if (isLive) {
          const gh = await deletePostFromGitHub(env, post.published_slug || post.slug);
          if (!gh.ok) {
            return jsonResponse({ ok: false, error: `Không thể xóa tệp trên GitHub: ${gh.error}` }, 502);
          }
        }

        await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(postId).run();

        if (user.role === 'admin' && post.author_role === 'member') {
          const msg =
            Number(post.delete_requested) === 1
              ? `Yêu cầu xóa bài viết "${post.title}" của bạn đã được Admin duyệt và xóa khỏi hệ thống.`
              : `Bài viết "${post.title}" của bạn đã bị Quản trị viên xóa khỏi hệ thống.`;
          await env.DB.prepare(
            "INSERT INTO notifications (user_id, post_title, action_type, message, created_at) VALUES (?, ?, 'deleted', ?, ?)"
          )
            .bind(post.author_id, post.title, msg, now)
            .run();
        }
        return jsonResponse({ ok: true, message: 'Đã xóa bài viết thành công.' });
      }

      return jsonResponse({ ok: false, error: 'Hành động không hợp lệ.' }, 400);
    }

    return jsonResponse({ ok: false, error: 'API endpoint not found.' }, 404);
  } catch (err) {
    console.error('[NDH CMS Worker Error]', err);
    return jsonResponse({ ok: false, error: 'Lỗi máy chủ nội bộ. Vui lòng thử lại sau.' }, 500);
  }
}
