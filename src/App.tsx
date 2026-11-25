import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { AccountView } from './components/AccountView';
import { AuthViews } from './components/AuthViews';
import { DashboardView } from './components/DashboardView';
import { EditorView } from './components/EditorView';
import { GuideView } from './components/GuideView';
import { Navbar } from './components/Navbar';
import { apiRequest, clearSessionToken } from './lib/api';
import type { AppView, FlashMessage, NotificationItem, User } from './types';

function parseRouteFromUrl(): { view: AppView; postId: number | null } {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(window.location.search);
  const idParam = Number(params.get('id') || 0);

  if (pathname === '/editor' || pathname === '/editor.html') {
    return { view: 'editor', postId: idParam > 0 ? idParam : null };
  }
  if (pathname === '/account' || pathname === '/account.html') {
    return { view: 'account', postId: null };
  }
  if (pathname === '/guide' || pathname === '/guide.html') {
    return { view: 'guide', postId: null };
  }
  if (pathname === '/register' || pathname === '/register.html') {
    return { view: 'register', postId: null };
  }
  return { view: 'dashboard', postId: null };
}

function buildUrlForRoute(view: AppView, postId?: number | null): string {
  switch (view) {
    case 'editor':
      return postId && postId > 0 ? `/editor?id=${postId}` : '/editor';
    case 'account':
      return '/account';
    case 'guide':
      return '/guide';
    case 'register':
      return '/register';
    case 'login':
    case 'dashboard':
    default:
      return '/';
  }
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('cms_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [blogDomain, setBlogDomain] = useState('https://ndh.io.vn');

  const initialRoute = parseRouteFromUrl();
  const [activeView, setActiveView] = useState<AppView>(initialRoute.view);
  const [editingPostId, setEditingPostId] = useState<number | null>(initialRoute.postId);
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  // Sync light/dark theme to <html>
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    localStorage.setItem('cms_theme', theme);
  }, [theme]);

  const showFlash = useCallback((text: string, type: FlashMessage['type'] = 'info') => {
    setFlash({ text, type });
  }, []);

  const loadSession = useCallback(async () => {
    const [meRes, setupRes] = await Promise.all([
      apiRequest<{
        user: User;
        notifications: NotificationItem[];
        blogDomain?: string;
      }>('/api/me'),
      apiRequest<{ needsAdminSetup: boolean; blogDomain?: string }>('/api/setup/status'),
    ]);

    if (setupRes.ok) {
      setNeedsAdminSetup(Boolean(setupRes.data.needsAdminSetup));
      if (setupRes.data.blogDomain) setBlogDomain(setupRes.data.blogDomain);
    }

    if (meRes.ok && meRes.data.user) {
      setUser(meRes.data.user);
      setNotifications(meRes.data.notifications || []);
      if (meRes.data.blogDomain) setBlogDomain(meRes.data.blogDomain);
      setActiveView((prev) => (prev === 'login' || prev === 'register' ? 'dashboard' : prev));
    } else {
      setUser(null);
      setNotifications([]);
      setActiveView((prev) => (prev === 'register' ? 'register' : 'login'));
    }
    setBooting(false);
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Browser back/forward navigation support
  useEffect(() => {
    const onPopState = () => {
      const parsed = parseRouteFromUrl();
      setEditingPostId(parsed.postId);
      setActiveView(user ? parsed.view : parsed.view === 'register' ? 'register' : 'login');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [user]);

  const navigate = useCallback((view: AppView, postId?: number | null) => {
    setFlash(null);
    const nextPostId = view === 'editor' ? (postId ?? null) : null;
    setEditingPostId(nextPostId);
    setActiveView(view);
    const nextUrl = buildUrlForRoute(view, nextPostId);
    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.pushState(null, '', nextUrl);
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const handleLogout = useCallback(async () => {
    await apiRequest('/api/logout', { method: 'POST' });
    clearSessionToken();
    setUser(null);
    setNotifications([]);
    setActiveView('login');
    window.history.pushState(null, '', '/');
    showFlash('Bạn đã đăng xuất khỏi hệ thống.', 'info');
  }, [showFlash]);

  const handleAuthenticated = useCallback(
    async (loggedInUser: User, message?: string) => {
      setUser(loggedInUser);
      setNeedsAdminSetup(false);
      setActiveView('dashboard');
      window.history.pushState(null, '', '/');
      if (message) {
        showFlash(message, 'success');
      } else {
        setFlash(null);
      }
      const meRes = await apiRequest<{
        notifications: NotificationItem[];
        blogDomain?: string;
      }>('/api/me');
      if (meRes.ok) {
        setNotifications(meRes.data.notifications || []);
        if (meRes.data.blogDomain) setBlogDomain(meRes.data.blogDomain);
      }
    },
    [showFlash]
  );

  const handleEditorBack = useCallback(
    (message?: string) => {
      setEditingPostId(null);
      setActiveView('dashboard');
      window.history.pushState(null, '', '/');
      if (message) {
        showFlash(message, 'success');
      } else {
        setFlash(null);
      }
    },
    [showFlash]
  );

  const handleEditorPostIdCreated = useCallback((newId: number) => {
    setEditingPostId(newId);
    window.history.replaceState(null, '', `/editor?id=${newId}`);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar
        user={user}
        activeView={activeView}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigate={navigate}
        onLogout={handleLogout}
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Dismissible Flash Alert (Hairline border, no thick left stripe) */}
        {flash && (
          <div
            role="status"
            className={`mb-5 rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-4 ${
              flash.type === 'error'
                ? 'bg-red-50/80 dark:bg-red-950/30 border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300'
                : flash.type === 'success'
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                  : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
            }`}
          >
            <span>{flash.text}</span>
            <button
              type="button"
              onClick={() => setFlash(null)}
              aria-label="Đóng thông báo"
              className="p-1 rounded-md opacity-70 hover:opacity-100 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {booting ? (
          <div className="py-20 text-center text-sm text-slate-500 dark:text-slate-400">
            Đang kiểm tra phiên đăng nhập...
          </div>
        ) : !user ? (
          <AuthViews
            mode={activeView === 'register' ? 'register' : 'login'}
            needsAdminSetup={needsAdminSetup}
            onSwitchMode={(view) => navigate(view)}
            onAuthenticated={handleAuthenticated}
            onNotify={showFlash}
          />
        ) : activeView === 'editor' ? (
          <EditorView
            user={user}
            postId={editingPostId}
            blogDomain={blogDomain}
            onPostIdChange={handleEditorPostIdCreated}
            onBack={handleEditorBack}
            onNotify={showFlash}
          />
        ) : activeView === 'account' ? (
          <AccountView user={user} onUserUpdated={setUser} onNotify={showFlash} />
        ) : activeView === 'guide' ? (
          <GuideView />
        ) : (
          <DashboardView
            user={user}
            blogDomain={blogDomain}
            notifications={notifications}
            onNotificationsChange={setNotifications}
            onEditPost={(id) => navigate('editor', id)}
            onNotify={showFlash}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-5 px-4 sm:px-6 text-center text-xs text-slate-500 dark:text-slate-400">
        NDH Blog CMS · Người Đồng Hành
      </footer>
    </div>
  );
}
