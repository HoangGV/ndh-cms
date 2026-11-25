const RESERVED_SLUGS = ['tool', 'tag', 'gioi-thieu', 'tim-kiem', '404'];
const COOKIE_NAME = 'ndh_cms_session';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url);
    }
    return env.ASSETS.fetch(request);
  }
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });
}

function nowVietnam() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function todayVietnam() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

// --- MÃ HÓA MẬT KHẨU PBKDF2 & KÝ JWT BẰNG WEB CRYPTO ---
function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function hashPassword(password, saltBytes = null) {
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `pbkdf2$100000$${toHex(salt)}$${toHex(derivedBits)}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) return { valid: false, needsUpgrade: false };
  if (storedHash.startsWith('INIT:')) {
    const rawInit = storedHash.slice(5);
    return { valid: password === rawInit, needsUpgrade: password === rawInit };
  }
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return { valid: false, needsUpgrade: false };
  }
  const salt = fromHex(parts[2]);
  const computed = await hashPassword(password, salt);
  return { valid: computed === storedHash, needsUpgrade: false };
}

function base64UrlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function getJwtKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret || 'fallback-dev-secret-change-me'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signSessionToken(payload, secret) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const key = await getJwtKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${data}.${sigB64}`;
}

async function verifySessionToken(token, secret) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sigB64] = parts;
  const key = await getJwtKey(secret);
  const sigBin = atob(sigB64.replace(/-/g, '+').replace(/_/g, '/'));
  const sigBytes = new Uint8Array(sigBin.length);
  for (let i = 0; i < sigBin.length; i++) sigBytes[i] = sigBin.charCodeAt(i);

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    new TextEncoder().encode(`${header}.${body}`)
  );
  if (!valid) return null;

  const payload = JSON.parse(base64UrlDecode(body));
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;
  return payload;
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

function buildCookieHeader(token, isHttps, maxAge = 604800) {
  const secureFlag = isHttps ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureFlag}`;
}

async function getAuthUser(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  const session = await verifySessionToken(token, env.JWT_SECRET);
  if (!session || !session.uid) return null;
  return env.DB.prepare('SELECT id, username, full_name, role FROM users WHERE id = ?')
    .bind(session.uid)
    .first();
}

// --- SLUG & THỜI GIAN ĐỌC ---
function vietnameseToSlug(str) {
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

async function generateUniqueSlug(db, rawInput, excludePostId = 0) {
  const baseSlug = vietnameseToSlug(rawInput);
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    if (!RESERVED_SLUGS.includes(slug)) {
      const row = await db
        .prepare('SELECT COUNT(*) AS cnt FROM posts WHERE slug = ? AND id != ?')
        .bind(slug, excludePostId)
        .first();
      if (!row || Number(row.cnt) === 0) {
        return slug;
      }
    }
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

function estimateReadingTime(markdown) {
  const text = String(markdown || '');
  let codeLines = 0;
  const blocks = text.match(/```[\s\S]*?```/g) || [];
  for (const b of blocks) {
    const lines = b.split('\n').filter(l => l.trim() !== '' && !l.trim().startsWith('```'));
    codeLines += lines.length;
  }
  const prose = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' congthuc ')
    .replace(/\$[^\n$]+?\$/g, ' congthuc ')
    .replace(/[#*`>\-\|\[\]\(\)]+/g, ' ')
    .trim();
  const words = prose ? prose.split(/\s+/).length : 0;
  return Math.max(1, Math.ceil(words / 200 + codeLines / 15));
}

async function notifyAllAdmins(db, postTitle, actionType, message) {
  const { results } = await db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
  if (!results || results.length === 0) return;
  const now = nowVietnam();
  const stmt = db.prepare(
    'INSERT INTO notifications (user_id, post_title, action_type, message, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  await db.batch(results.map(adm => stmt.bind(adm.id, postTitle, actionType, message, now)));
}

// --- GITHUB API (CHỈ CHẠY KHI ADMIN DUYỆT / XUẤT BẢN / XÓA BÀI ĐÃ ĐĂNG) ---
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function formatBlogMarkdown(post) {
  const escapeYaml = val =>
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
    .map(t => t.trim())
    .filter(Boolean);
  if (tagsArray.length === 0) tagsArray = ['Chung'];

  let fm = '---\n';
  fm += `title: "${escapeYaml(post.title)}"\n`;
  fm += `description: "${escapeYaml(post.description)}"\n`;
  fm += `pubDate: "${pubDate}"\n`;
  fm += 'tags:\n';
  for (const tag of tagsArray) {
    fm += `  - ${tag.replace(/\s+/g, ' ')}\n`;
  }
  fm += `readingTimeMinutes: ${readingTime}\n`;
  if (coverUrl !== '') {
    fm += `cover: "${escapeYaml(coverUrl)}"\n`;
  }
  fm += '---\n\n';
  return `${fm}${cleanBody}\n`;
}

async function githubRequest(env, method, endpoint, payload = null) {
  if (!env.GITHUB_TOKEN) {
    return { ok: false, error: 'Chưa cấu hình Secret GITHUB_TOKEN trên Cloudflare Worker.' };
  }
  const url = `[https://api.github.com/repos/$](https://api.github.com/repos/$){env.GITHUB_OWNER}/${env.GITHUB_REPO}/${endpoint.replace(/^\/+/, '')}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'NDH-Cloudflare-CMS'
  };
  const init = { method, headers };
  if (payload !== null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(payload);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    return { ok: false, error: data?.message || `GitHub API HTTP ${res.status}` };
  }
  return { ok: true, data };
}

async function getGitHubFileSha(env, filePath) {
  const branch = encodeURIComponent(env.GITHUB_BRANCH || 'main');
  const res = await githubRequest(env, 'GET', `contents/${filePath}?ref=${branch}`);
  return res.ok && res.data?.sha ? res.data.sha : null;
}

async function deletePostFromGitHub(env, slug) {
  if (!slug) return { ok: true };
  const dir = (env.GITHUB_CONTENT_PATH || 'src/content/blog').replace(/^\/+|\/+$/g, '');
  const filePath = `${dir}/${slug}.md`;
  const sha = await getGitHubFileSha(env, filePath);
  if (!sha) return { ok: true };

  return githubRequest(env, 'DELETE', `contents/${filePath}`, {
    message: `cms: delete ${slug}.md`,
    sha,
    branch: env.GITHUB_BRANCH || 'main'
  });
}

async function pushPostToGitHub(env, post, oldSlug = null) {
  if (oldSlug && oldSlug !== post.slug) {
    await deletePostFromGitHub(env, oldSlug);
  }
  const dir = (env.GITHUB_CONTENT_PATH || 'src/content/blog').replace(/^\/+|\/+$/g, '');
  const filePath = `${dir}/${post.slug}.md`;
  const sha = await getGitHubFileSha(env, filePath);
  const markdownFull = formatBlogMarkdown(post);

  const payload = {
    message: `${sha ? 'cms: update ' : 'cms: publish '}${post.slug}.md`,
    content: utf8ToBase64(markdownFull),
    branch: env.GITHUB_BRANCH || 'main'
  };
  if (sha) payload.sha = sha;

  return githubRequest(env, 'PUT', `contents/${filePath}`, payload);
}

// --- ROUTER API ---
async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const isHttps = url.protocol === 'https:';

  try {
    // 1. Đăng ký tài khoản
    if (path === '/api/register' && method === 'POST') {
      const body = await request.json();
      const fullName = String(body.full_name || '').trim();
      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      if (!fullName || !username || !password) {
        return jsonResponse({ ok: false, error: 'Vui lòng điền đầy đủ thông tin.' }, 400);
      }
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        return jsonResponse({ ok: false, error: 'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu gạch dưới (3–30 ký tự).' }, 400);
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

      return jsonResponse({ ok: true });
    }

    // 2. Đăng nhập
    if (path === '/api/login' && method === 'POST') {
      const body = await request.json();
      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      const u = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
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
        { uid: u.id, exp: Math.floor(Date.now() / 1000) + 604800 },
        env.JWT_SECRET
      );

      return jsonResponse(
        {
          ok: true,
          user: { id: u.id, username: u.username, full_name: u.full_name, role: u.role }
        },
        200,
        { 'Set-Cookie': buildCookieHeader(token, isHttps, 604800) }
      );
    }

    // 3. Đăng xuất
    if (path === '/api/logout' && method === 'POST') {
      return jsonResponse({ ok: true }, 200, { 'Set-Cookie': buildCookieHeader('', isHttps, 0) });
    }

    // --- CÁC API BÊN DƯỚI YÊU CẦU ĐĂNG NHẬP ---
    const user = await getAuthUser(request, env);
    if (!user) {
      return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
    }

    // 4. Lấy thông tin người dùng hiện tại + danh sách thông báo
    if (path === '/api/me' && method === 'GET') {
      const { results: notifications } = await env.DB.prepare(
        'SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY id DESC'
      )
        .bind(user.id)
        .all();

      return jsonResponse({
        ok: true,
        user,
        notifications: notifications || [],
        blogDomain: env.BLOG_DOMAIN || '[https://ndh.io.vn](https://ndh.io.vn)'
      });
    }

    // 5. Đánh dấu đã đọc thông báo
    if (path === '/api/notifications/read' && method === 'POST') {
      const body = await request.json();
      const id = Number(body.id || 0);
      await env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
        .bind(id, user.id)
        .run();
      return jsonResponse({ ok: true });
    }

    // 6. Quản lý tài khoản (Đổi tên/username, đổi mật khẩu, danh sách thành viên, phong Admin)
    if (path === '/api/account/profile' && method === 'POST') {
      const body = await request.json();
      const fullName = String(body.full_name || '').trim();
      const username = String(body.username || '').trim();
      if (!fullName || !username) {
        return jsonResponse({ ok: false, error: 'Họ tên và tên đăng nhập không được để trống.' }, 400);
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
      const body = await request.json();
      const currentPass = String(body.current_password || '');
      const newPass = String(body.new_password || '');
      if (newPass.length < 6) {
        return jsonResponse({ ok: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' }, 400);
      }
      const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first();
      const check = await verifyPassword(currentPass, row?.password_hash);
      if (!check.valid) {
        return jsonResponse({ ok: false, error: 'Mật khẩu hiện tại không chính xác.' }, 400);
      }
      const newHash = await hashPassword(newPass);
      await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, user.id).run();
      return jsonResponse({ ok: true });
    }

    if (path === '/api/users' && method === 'GET') {
      if (user.role !== 'admin') return jsonResponse({ ok: false, error: 'Forbidden' }, 403);
      const { results } = await env.DB.prepare(
        "SELECT id, username, full_name, role, created_at FROM users ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, id ASC"
      ).all();
      return jsonResponse({ ok: true, users: results || [] });
    }

    if (path === '/api/users/promote' && method === 'POST') {
      if (user.role !== 'admin') return jsonResponse({ ok: false, error: 'Forbidden' }, 403);
      const body = await request.json();
      const targetId = Number(body.user_id || 0);
      const target = await env.DB.prepare("SELECT * FROM users WHERE id = ? AND role = 'member'")
        .bind(targetId)
        .first();
      if (!target) {
        return jsonResponse({ ok: false, error: 'Không tìm thấy thành viên hợp lệ.' }, 404);
      }
      await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(targetId).run();
      await env.DB.prepare(
        "INSERT INTO notifications (user_id, post_title, action_type, message, created_at) VALUES (?, 'Nâng cấp quyền hạn', 'promoted', ?, ?)"
      )
        .bind(
          targetId,
          `Chúc mừng! Tài khoản của bạn đã được Quản trị viên (${user.full_name}) phong quyền Admin.`,
          nowVietnam()
        )
        .run();
      return jsonResponse({ ok: true });
    }

    // 7. Kiểm tra Slug không trùng
    if (path === '/api/slug/check' && method === 'GET') {
      const text = url.searchParams.get('text') || '';
      const excludeId = Number(url.searchParams.get('exclude_id') || 0);
      const slug = await generateUniqueSlug(env.DB, text, excludeId);
      return jsonResponse({ ok: true, slug });
    }

    // 8. Lấy danh sách bài viết
    if (path === '/api/posts' && method === 'GET') {
      let query;
      if (user.role === 'admin') {
        query = env.DB.prepare(`
          SELECT p.id, p.title, p.slug, p.published_slug, p.reading_time, p.status, p.author_id,
                 p.reject_reason, p.delete_requested, p.delete_reason, p.updated_at,
                 u.full_name AS author_name, u.role AS author_role
          FROM posts p
          JOIN users u ON p.author_id = u.id
          WHERE (p.status != 'draft' OR p.author_id = ?)
          ORDER BY p.delete_requested DESC,
                   CASE p.status WHEN 'pending' THEN 1 WHEN 'draft' THEN 2 WHEN 'published' THEN 3 ELSE 4 END,
                   p.updated_at DESC
        `).bind(user.id);
      } else {
        query = env.DB.prepare(`
          SELECT p.id, p.title, p.slug, p.published_slug, p.reading_time, p.status, p.author_id,
                 p.reject_reason, p.delete_requested, p.delete_reason, p.updated_at,
                 u.full_name AS author_name, u.role AS author_role
          FROM posts p
          JOIN users u ON p.author_id = u.id
          WHERE p.author_id = ?
          ORDER BY CASE p.status WHEN 'draft' THEN 1 WHEN 'rejected' THEN 2 WHEN 'pending' THEN 3 ELSE 4 END,
                   p.updated_at DESC
        `).bind(user.id);
      }
      const { results } = await query.all();
      return jsonResponse({ ok: true, posts: results || [] });
    }

    // 9. Lấy chi tiết 1 bài viết để chỉnh sửa
    if (path === '/api/posts/detail' && method === 'GET') {
      const id = Number(url.searchParams.get('id') || 0);
      const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
      if (!post) return jsonResponse({ ok: false, error: 'Không tìm thấy bài viết.' }, 404);
      if (user.role !== 'admin' && post.author_id !== user.id) {
        return jsonResponse({ ok: false, error: 'Bạn không có quyền truy cập bài viết này.' }, 403);
      }
      return jsonResponse({ ok: true, post });
    }

    // 10. Tự động lưu bản nháp sau 5s ngừng gõ
    if (path === '/api/posts/autosave' && method === 'POST') {
      const body = await request.json();
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

      const saveTitle = title || `Bản nháp ngày ${nowVietnam().slice(0, 16)}`;
      const readingTime = estimateReadingTime(content);
      const now = nowVietnam();

      if (postId > 0) {
        const existing = await env.DB.prepare('SELECT id, author_id, status FROM posts WHERE id = ?')
          .bind(postId)
          .first();
        if (!existing || (user.role !== 'admin' && existing.author_id !== user.id)) {
          return jsonResponse({ ok: false, error: 'Không có quyền chỉnh sửa.' }, 403);
        }
        if (existing.status === 'published') {
          return jsonResponse({ ok: true, mode: 'local_only', saved_at: now.slice(11) });
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
          saved_at: now.slice(11)
        });
      } else {
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
          saved_at: now.slice(11)
        });
      }
    }

    // 11. Lưu tạm thủ công / Gửi duyệt / Xuất bản lên GitHub
    if (path === '/api/posts/save' && method === 'POST') {
      const body = await request.json();
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
        return jsonResponse({ ok: false, error: 'Vui lòng nhập ít nhất Tiêu đề hoặc Nội dung để lưu tạm.' }, 400);
      }

      let existing = null;
      if (postId > 0) {
        existing = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(postId).first();
        if (!existing) return jsonResponse({ ok: false, error: 'Không tìm thấy bài viết.' }, 404);
        if (user.role !== 'admin' && existing.author_id !== user.id) {
          return jsonResponse({ ok: false, error: 'Không có quyền chỉnh sửa.' }, 403);
        }
      }

      const finalTitle = title || `Bản nháp ngày ${nowVietnam().slice(0, 16)}`;
      const uniqueSlug = await generateUniqueSlug(env.DB, rawSlug || finalTitle, postId);
      const readingTime = estimateReadingTime(content);
      const now = nowVietnam();
      const createdAt = existing?.created_at || now;
      const liveSlugOnGithub = existing?.published_slug || (existing?.status === 'published' ? existing.slug : null);
      const newStatus = isDraft ? 'draft' : user.role === 'admin' ? 'published' : 'pending';

      let nextPublishedSlug = liveSlugOnGithub;
      if (newStatus === 'published') {
        const gh = await pushPostToGitHub(
          env,
          { title: finalTitle, slug: uniqueSlug, description, tags, cover, content, created_at: createdAt },
          liveSlugOnGithub
        );
        if (!gh.ok) {
          return jsonResponse({ ok: false, error: `Lỗi GitHub API: ${gh.error}` }, 502);
        }
        nextPublishedSlug = uniqueSlug;
      }

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
            user.role === 'admin' && newStatus === 'published' ? user.id : existing.approved_by,
            now,
            postId
          )
          .run();
      } else {
        await env.DB.prepare(
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
        message: isDraft
          ? 'Đã lưu bản nháp thành công!'
          : user.role === 'admin'
            ? `Đã xuất bản tệp ${uniqueSlug}.md lên GitHub thành công!`
            : 'Đã gửi bài viết thành công! Vui lòng chờ Admin phê duyệt.'
      });
    }

    // 12. Các hành động quản trị trên danh sách bài viết (Duyệt / Từ chối / Yêu cầu xóa / Xóa)
    if (path === '/api/posts/action' && method === 'POST') {
      const body = await request.json();
      const postId = Number(body.post_id || 0);
      const action = String(body.action || '');
      const reason = String(body.reason || '').trim();

      const post = await env.DB.prepare(
        'SELECT p.*, u.full_name AS author_name, u.role AS author_role FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?'
      )
        .bind(postId)
        .first();

      if (!post) return jsonResponse({ ok: false, error: 'Không tìm thấy bài viết.' }, 404);
      const now = nowVietnam();

      // Admin duyệt bài
      if (action === 'approve' && user.role === 'admin') {
        const gh = await pushPostToGitHub(env, post, post.published_slug || null);
        if (!gh.ok) {
          return jsonResponse({ ok: false, error: `Lỗi GitHub API: ${gh.error}` }, 502);
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

      // Admin từ chối bài
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
        return jsonResponse({ ok: true, message: 'Đã từ chối bài viết và gửi thông báo cho thành viên.' });
      }

      // Thành viên gửi yêu cầu xóa bài đã xuất bản
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

      // Thành viên hủy yêu cầu xóa
      if (action === 'cancel_delete_request' && post.author_id === user.id) {
        await env.DB.prepare('UPDATE posts SET delete_requested = 0, delete_reason = NULL WHERE id = ?')
          .bind(postId)
          .run();
        return jsonResponse({ ok: true, message: 'Đã hủy yêu cầu xóa bài viết.' });
      }

      // Admin từ chối yêu cầu xóa
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

      // Xóa bài viết (Admin xóa bất kỳ; Thành viên xóa bài chưa xuất bản)
      if (action === 'delete') {
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

    return jsonResponse({ ok: false, error: 'Not Found' }, 404);
  } catch (err) {
    return jsonResponse({ ok: false, error: err?.message || 'Lỗi máy chủ nội bộ' }, 500);
  }
}