import { CheckCircle2, GitBranch, KeyRound, ShieldAlert, UserCog } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import type { GitHubConfigStatus, User } from '../types';
import { DialogModal } from './DialogModal';

interface AccountViewProps {
  user: User;
  onUserUpdated: (updated: User) => void;
  onNotify: (text: string, type: 'success' | 'error' | 'info') => void;
}

export function AccountView({ user, onUserUpdated, onNotify }: AccountViewProps) {
  const [fullName, setFullName] = useState(user.full_name);
  const [username, setUsername] = useState(user.username);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [usersList, setUsersList] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [githubStatus, setGithubStatus] = useState<GitHubConfigStatus | null>(null);
  const [roleDialog, setRoleDialog] = useState<{
    action: 'promote' | 'demote';
    target: User;
  } | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);

  useEffect(() => {
    setFullName(user.full_name);
    setUsername(user.username);
  }, [user]);

  const loadAdminData = useCallback(async () => {
    if (user.role !== 'admin') return;
    setLoadingUsers(true);
    const [usersRes, ghRes] = await Promise.all([
      apiRequest<{ users: User[] }>('/api/users'),
      apiRequest<{ github: GitHubConfigStatus }>('/api/github/status'),
    ]);
    setLoadingUsers(false);
    if (usersRes.ok) {
      setUsersList(usersRes.data.users || []);
    }
    if (ghRes.ok && ghRes.data.github) {
      setGithubStatus(ghRes.data.github);
    }
  }, [user.role]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    const res = await apiRequest<{ user: User }>('/api/account/profile', {
      method: 'POST',
      body: { full_name: fullName, username },
    });
    setSavingProfile(false);
    if (!res.ok || !res.data.user) {
      onNotify(res.data.error || 'Cập nhật thông tin thất bại.', 'error');
      return;
    }
    onUserUpdated(res.data.user);
    onNotify('Đã cập nhật thông tin tài khoản thành công!', 'success');
    if (user.role === 'admin') {
      loadAdminData();
    }
  };

  const handleSavePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      onNotify('Mật khẩu mới xác nhận không khớp.', 'error');
      return;
    }
    setSavingPassword(true);
    const res = await apiRequest('/api/account/password', {
      method: 'POST',
      body: { current_password: currentPassword, new_password: newPassword },
    });
    setSavingPassword(false);
    if (!res.ok) {
      onNotify(res.data.error || 'Đổi mật khẩu thất bại.', 'error');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    onNotify('Đã đổi mật khẩu thành công!', 'success');
  };

  const handleConfirmRoleChange = async () => {
    if (!roleDialog) return;
    setRoleBusy(true);
    const endpoint = roleDialog.action === 'promote' ? '/api/users/promote' : '/api/users/demote';
    const res = await apiRequest(endpoint, {
      method: 'POST',
      body: { user_id: roleDialog.target.id },
    });
    setRoleBusy(false);

    if (!res.ok) {
      onNotify(res.data.error || 'Cập nhật quyền hạn thất bại.', 'error');
      setRoleDialog(null);
      return;
    }

    onNotify(
      roleDialog.action === 'promote'
        ? `Đã phong tài khoản "${roleDialog.target.full_name}" làm Admin!`
        : `Đã chuyển tài khoản "${roleDialog.target.full_name}" về vai trò Thành viên.`,
      'success'
    );
    setRoleDialog(null);
    await loadAdminData();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Quản lý tài khoản
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {user.full_name} · @{user.username} · {user.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}
        </p>
      </div>

      {/* Profile & Password Forms */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold mb-4">
            <UserCog className="w-4 h-4 text-[#4169E1] dark:text-[#5B7FF0]" />
            <h2>Thông tin cá nhân</h2>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Họ và tên hiển thị
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
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
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
              />
            </div>

            <button
              type="submit"
              disabled={savingProfile}
              className="px-4 py-2.5 rounded-lg bg-[#4169E1] hover:bg-[#3154C4] text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
            >
              {savingProfile ? 'Đang lưu...' : 'Lưu thông tin'}
            </button>
          </form>
        </section>

        <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold mb-4">
            <KeyRound className="w-4 h-4 text-[#4169E1] dark:text-[#5B7FF0]" />
            <h2>Đổi mật khẩu</h2>
          </div>

          <form onSubmit={handleSavePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Mật khẩu hiện tại
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Mật khẩu mới (tối thiểu 6 ký tự)
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Nhập lại mật khẩu mới
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
              disabled={savingPassword}
              className="px-4 py-2.5 rounded-lg bg-[#4169E1] hover:bg-[#3154C4] text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
            >
              {savingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
            </button>
          </form>
        </section>
      </div>

      {/* Admin-only GitHub Publishing Config Overview (Zero PAT Exposure) */}
      {user.role === 'admin' && githubStatus && (
        <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold">
              <GitBranch className="w-4 h-4 text-[#4169E1] dark:text-[#5B7FF0]" />
              <h2>Cấu hình xuất bản GitHub (Server-Side)</h2>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold">
              {githubStatus.configured ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Sẵn sàng commit lên GitHub</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Chưa cấu hình đầy đủ biến môi trường</span>
                </span>
              )}
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Repository</dt>
              <dd className="mt-1 font-mono text-slate-900 dark:text-slate-100 break-all">
                {githubStatus.owner}/{githubStatus.repo}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Nhánh (Branch)</dt>
              <dd className="mt-1 font-mono text-slate-900 dark:text-slate-100">
                {githubStatus.branch}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Thư mục bài viết</dt>
              <dd className="mt-1 font-mono text-slate-900 dark:text-slate-100">
                {githubStatus.contentPath}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Secret GITHUB_TOKEN (PAT)</dt>
              <dd
                className={`mt-1 font-medium ${
                  githubStatus.hasToken
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {githubStatus.hasToken ? 'Đã thiết lập bảo mật trên máy chủ' : 'Chưa thiết lập'}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            PAT luôn được lưu trữ riêng tư trong Cloudflare Worker Secret (<code>wrangler secret put GITHUB_TOKEN</code>) và tuyệt đối không truyền xuống trình duyệt.
          </p>
        </section>
      )}

      {/* Admin-only Team & Role Management */}
      {user.role === 'admin' && (
        <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Quản lý tài khoản & Phân quyền Admin
            </h2>
          </div>

          {loadingUsers ? (
            <div className="p-6 text-sm text-slate-500 dark:text-slate-400">Đang tải danh sách tài khoản...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="hidden sm:table-header-group border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
                  <tr className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-6">Họ và tên</th>
                    <th className="py-3 px-4">Tên đăng nhập</th>
                    <th className="py-3 px-4">Vai trò</th>
                    <th className="py-3 px-4 text-right">Số bài</th>
                    <th className="py-3 px-4">Ngày tham gia</th>
                    <th className="py-3 px-6 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80 text-sm">
                  {usersList.map((u) => (
                    <tr
                      key={u.id}
                      className="block sm:table-row p-4 sm:p-0 hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                    >
                      <td className="block sm:table-cell sm:py-3.5 sm:px-6 font-medium text-slate-900 dark:text-white">
                        {u.full_name}{' '}
                        {u.id === user.id && (
                          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                            (Bạn)
                          </span>
                        )}
                      </td>
                      <td className="block sm:table-cell mt-1 sm:mt-0 sm:py-3.5 sm:px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                        @{u.username}
                      </td>
                      <td className="block sm:table-cell mt-1 sm:mt-0 sm:py-3.5 sm:px-4 text-xs">
                        <span
                          className={
                            u.role === 'admin'
                              ? 'font-semibold text-[#4169E1] dark:text-[#5B7FF0]'
                              : 'text-slate-600 dark:text-slate-400'
                          }
                        >
                          {u.role === 'admin' ? 'Quản trị viên' : 'Thành viên'}
                        </span>
                      </td>
                      <td className="block sm:table-cell mt-1 sm:mt-0 sm:py-3.5 sm:px-4 sm:text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                        <span className="sm:hidden text-slate-400 mr-1 font-sans">Số bài:</span>
                        {u.post_count ?? 0}
                      </td>
                      <td className="block sm:table-cell mt-1 sm:mt-0 sm:py-3.5 sm:px-4 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {u.created_at}
                      </td>
                      <td className="block sm:table-cell mt-2.5 sm:mt-0 sm:py-3.5 sm:px-6 sm:text-right">
                        {u.role === 'member' ? (
                          <button
                            type="button"
                            onClick={() => setRoleDialog({ action: 'promote', target: u })}
                            className="px-3 py-1.5 rounded-md bg-[#4169E1] hover:bg-[#3154C4] text-white text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
                          >
                            Phong làm Admin
                          </button>
                        ) : u.id !== user.id ? (
                          <button
                            type="button"
                            onClick={() => setRoleDialog({ action: 'demote', target: u })}
                            className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-amber-500 hover:text-amber-600 transition-colors whitespace-nowrap cursor-pointer"
                          >
                            Hạ về Thành viên
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Quản trị hiện tại</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <DialogModal
        open={roleDialog !== null}
        loading={roleBusy}
        title={
          roleDialog?.action === 'promote'
            ? 'Xác nhận phong quyền Admin'
            : 'Xác nhận thay đổi vai trò'
        }
        description={
          roleDialog?.action === 'promote'
            ? `Phong tài khoản "${roleDialog.target.full_name}" làm Admin? Người này sẽ có quyền duyệt, xuất bản lên GitHub và quản lý bài viết.`
            : `Chuyển tài khoản "${roleDialog?.target.full_name || ''}" về vai trò Thành viên? Tài khoản này sẽ không còn quyền xuất bản trực tiếp lên GitHub.`
        }
        confirmLabel={roleDialog?.action === 'promote' ? 'Phong làm Admin' : 'Chuyển về Thành viên'}
        variant={roleDialog?.action === 'promote' ? 'primary' : 'danger'}
        onClose={() => setRoleDialog(null)}
        onConfirm={handleConfirmRoleChange}
      />
    </div>
  );
}
