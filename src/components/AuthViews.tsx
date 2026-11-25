import { ShieldCheck } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { apiRequest, setSessionToken } from '../lib/api';
import type { AppView, User } from '../types';

interface AuthViewsProps {
  mode: 'login' | 'register';
  needsAdminSetup: boolean;
  onSwitchMode: (view: AppView) => void;
  onAuthenticated: (user: User, message?: string) => void;
  onNotify: (text: string, type: 'success' | 'error' | 'info') => void;
}

export function AuthViews({
  mode,
  needsAdminSetup,
  onSwitchMode,
  onAuthenticated,
  onNotify,
}: AuthViewsProps) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bannerError, setBannerError] = useState(false);

  const resetForm = () => {
    setPassword('');
    setConfirmPassword('');
  };

  const handleSetupAdmin = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      onNotify('Mật khẩu xác nhận không khớp.', 'error');
      return;
    }
    setSubmitting(true);
    const res = await apiRequest<{ user: User; token?: string }>('/api/setup/admin', {
      method: 'POST',
      body: { full_name: fullName, username, password },
    });
    setSubmitting(false);

    if (!res.ok || !res.data.user) {
      onNotify(res.data.error || 'Khởi tạo tài khoản quản trị thất bại.', 'error');
      return;
    }
    if (res.data.token) {
      setSessionToken(res.data.token);
    }
    onAuthenticated(res.data.user, 'Đã khởi tạo tài khoản Quản trị viên đầu tiên thành công!');
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await apiRequest<{ user: User; token?: string }>('/api/login', {
      method: 'POST',
      body: { username, password },
    });
    setSubmitting(false);

    if (!res.ok || !res.data.user) {
      onNotify(res.data.error || 'Đăng nhập thất bại.', 'error');
      return;
    }
    if (res.data.token) {
      setSessionToken(res.data.token);
    }
    onAuthenticated(res.data.user);
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      onNotify('Mật khẩu xác nhận không khớp.', 'error');
      return;
    }
    setSubmitting(true);
    const res = await apiRequest('/api/register', {
      method: 'POST',
      body: { full_name: fullName, username, password },
    });
    setSubmitting(false);

    if (!res.ok) {
      onNotify(res.data.error || 'Đăng ký thất bại.', 'error');
      return;
    }
    resetForm();
    onNotify('Đăng ký tài khoản thành công! Bạn có thể đăng nhập ngay bây giờ.', 'success');
    onSwitchMode('login');
  };

  const isFirstSetup = needsAdminSetup && mode === 'login';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Editorial Brand Column */}
        <div className="lg:col-span-6 space-y-5">
          {!bannerError ? (
            <img
              src="/src/ndh-cms.webp"
              alt="NDH CMS — Chia sẻ để cùng phát triển"
              referrerPolicy="no-referrer"
              onError={() => setBannerError(true)}
              className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white object-contain"
            />
          ) : (
            <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-8">
              <div className="text-2xl font-bold text-[#4169E1]">NDH Blog CMS</div>
              <p className="text-sm text-slate-500 mt-1">Chia sẻ để cùng phát triển</p>
            </div>
          )}

          <div className="space-y-2.5 max-w-md">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
              Hệ thống biên tập & xuất bản bài viết Người Đồng Hành
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Soạn thảo Markdown chuẩn mực với công thức toán KaTeX, mã nguồn có định dạng, tự động lưu nháp trên Cloudflare D1 và xuất bản trực tiếp lên kho lưu trữ GitHub.
            </p>
          </div>
        </div>

        {/* Right Form Card */}
        <div className="lg:col-span-6">
          <div className="w-full max-w-md mx-auto lg:ml-auto lg:mr-0 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
            {isFirstSetup ? (
              <>
                <div className="flex items-center gap-2 text-[#4169E1] dark:text-[#5B7FF0] text-sm font-semibold mb-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Thiết lập lần đầu</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Khởi tạo tài khoản Quản trị viên
                </h2>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                  Cơ sở dữ liệu chưa có tài khoản Admin. Tạo tài khoản quản trị đầu tiên để bắt đầu vận hành hệ thống.
                </p>

                <form onSubmit={handleSetupAdmin} className="mt-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Họ và tên hiển thị
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Quản trị viên NDH"
                      required
                      autoFocus
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Tên đăng nhập (Username)
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      required
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Mật khẩu (tối thiểu 6 ký tự)
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Nhập lại mật khẩu
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 rounded-lg bg-[#4169E1] hover:bg-[#3154C4] text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {submitting ? 'Đang khởi tạo...' : 'Tạo tài khoản Admin & Đăng nhập'}
                  </button>
                </form>
              </>
            ) : mode === 'login' ? (
              <>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Đăng nhập hệ thống</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Nhập tài khoản thành viên hoặc quản trị viên để tiếp tục.
                </p>

                <form onSubmit={handleLogin} className="mt-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Tên đăng nhập
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoFocus
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Mật khẩu
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 rounded-lg bg-[#4169E1] hover:bg-[#3154C4] text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
                  </button>
                </form>

                <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
                  Chưa có tài khoản?{' '}
                  <button
                    type="button"
                    onClick={() => onSwitchMode('register')}
                    className="font-semibold text-[#4169E1] dark:text-[#5B7FF0] hover:underline cursor-pointer"
                  >
                    Đăng ký thành viên
                  </button>
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Đăng ký tài khoản thành viên
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Tài khoản mới có quyền soạn thảo, lưu nháp và gửi bài chờ Admin phê duyệt.
                </p>

                <form onSubmit={handleRegister} className="mt-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Họ và tên hiển thị (Tác giả)
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Nguyễn Văn A"
                      required
                      autoFocus
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Tên đăng nhập (Username)
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="nguyenvana"
                      required
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Mật khẩu (tối thiểu 6 ký tự)
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Nhập lại mật khẩu
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 rounded-lg bg-[#4169E1] hover:bg-[#3154C4] text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {submitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
                  </button>
                </form>

                <p className="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
                  Đã có tài khoản?{' '}
                  <button
                    type="button"
                    onClick={() => onSwitchMode('login')}
                    className="font-semibold text-[#4169E1] dark:text-[#5B7FF0] hover:underline cursor-pointer"
                  >
                    Đăng nhập tại đây
                  </button>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
