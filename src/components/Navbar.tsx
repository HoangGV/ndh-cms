import { LogOut, Menu, Moon, PenSquare, Sun, X } from 'lucide-react';
import { useState } from 'react';
import type { AppView, User } from '../types';

interface NavbarProps {
  user: User | null;
  activeView: AppView;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onNavigate: (view: AppView, postId?: number | null) => void;
  onLogout: () => void;
}

export function Navbar({
  user,
  activeView,
  theme,
  onToggleTheme,
  onNavigate,
  onLogout,
}: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [iconError, setIconError] = useState(false);

  const handleNav = (view: AppView, postId?: number | null) => {
    setMobileOpen(false);
    onNavigate(view, postId);
  };

  const navLinkClass = (active: boolean) =>
    `whitespace-nowrap shrink-0 text-sm font-medium transition-colors py-1 border-b-2 ${
      active
        ? 'text-[#4169E1] dark:text-[#5B7FF0] border-[#4169E1] dark:border-[#5B7FF0]'
        : 'text-slate-600 dark:text-slate-300 border-transparent hover:text-slate-900 dark:hover:text-white'
    }`;

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleNav(user ? 'dashboard' : 'login')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4169E1] rounded-md"
        >
          {!iconError ? (
            <img
              src="/src/icon-ndh-cms.webp"
              alt="NDH CMS"
              referrerPolicy="no-referrer"
              onError={() => setIconError(true)}
              className="w-7 h-7 object-contain shrink-0"
            />
          ) : (
            <span className="w-7 h-7 rounded-md bg-[#4169E1] text-white text-xs font-bold inline-flex items-center justify-center shrink-0">
              NDH
            </span>
          )}
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
            NDH Blog CMS
          </span>
        </button>

        {/* Zone 2: Primary Navigation Links */}
        {user ? (
          <nav className="hidden md:flex items-center gap-7" aria-label="Điều hướng chính">
            <button
              type="button"
              onClick={() => handleNav('dashboard')}
              className={navLinkClass(activeView === 'dashboard')}
            >
              Bài viết
            </button>
            <button
              type="button"
              onClick={() => handleNav('guide')}
              className={navLinkClass(activeView === 'guide')}
            >
              Hướng dẫn
            </button>
            <button
              type="button"
              onClick={() => handleNav('account')}
              className={navLinkClass(activeView === 'account')}
            >
              Tài khoản
            </button>
          </nav>
        ) : (
          <div className="hidden md:block" />
        )}

        {/* Zone 3: Primary Action & Utility Controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#4169E1] hover:text-[#4169E1] dark:hover:text-[#5B7FF0] transition-colors shrink-0"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {user ? (
            <>
              <button
                type="button"
                onClick={() => handleNav('editor', null)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#4169E1] hover:bg-[#3154C4] text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <PenSquare className="w-4 h-4" />
                <span>Viết bài mới</span>
              </button>

              <button
                type="button"
                onClick={onLogout}
                title={`Đăng xuất (${user.full_name})`}
                aria-label="Đăng xuất"
                className="hidden md:inline-flex w-9 h-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors shrink-0 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setMobileOpen((prev) => !prev)}
                aria-label="Mở menu điều hướng"
                className="md:hidden w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shrink-0"
              >
                {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => handleNav(activeView === 'register' ? 'login' : 'register')}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-[#4169E1] hover:text-[#4169E1] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {activeView === 'register' ? 'Đăng nhập' : 'Đăng ký'}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Drawer */}
      {user && mobileOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] px-4 py-3 space-y-1">
          <div className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 mb-2">
            {user.full_name} · {user.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}
          </div>
          <button
            type="button"
            onClick={() => handleNav('dashboard')}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium ${
              activeView === 'dashboard'
                ? 'bg-[#4169E1]/10 text-[#4169E1] dark:text-[#5B7FF0]'
                : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            Bài viết
          </button>
          <button
            type="button"
            onClick={() => handleNav('editor', null)}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium ${
              activeView === 'editor'
                ? 'bg-[#4169E1]/10 text-[#4169E1] dark:text-[#5B7FF0]'
                : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            Viết bài mới
          </button>
          <button
            type="button"
            onClick={() => handleNav('guide')}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium ${
              activeView === 'guide'
                ? 'bg-[#4169E1]/10 text-[#4169E1] dark:text-[#5B7FF0]'
                : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            Hướng dẫn viết bài
          </button>
          <button
            type="button"
            onClick={() => handleNav('account')}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium ${
              activeView === 'account'
                ? 'bg-[#4169E1]/10 text-[#4169E1] dark:text-[#5B7FF0]'
                : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            Tài khoản
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              onLogout();
            }}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400"
          >
            Đăng xuất
          </button>
        </div>
      )}
    </header>
  );
}
