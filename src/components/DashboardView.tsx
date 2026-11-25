import {
  Bell,
  Check,
  CheckCheck,
  Eye,
  FileEdit,
  PenSquare,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';
import type {
  NotificationItem,
  PostDetail,
  PostStatus,
  PostSummary,
  User,
} from '../types';
import { DialogModal } from './DialogModal';
import { MarkdownPreview } from './MarkdownPreview';

type FilterKey = 'all' | PostStatus | 'delete_requested';

interface DashboardViewProps {
  user: User;
  blogDomain: string;
  notifications: NotificationItem[];
  onNotificationsChange: (next: NotificationItem[]) => void;
  onEditPost: (postId: number | null) => void;
  onNotify: (text: string, type: 'success' | 'error' | 'info') => void;
}

const STATUS_META: Record<PostStatus, { label: string; className: string }> = {
  published: {
    label: 'Đã đăng',
    className: 'text-emerald-700 dark:text-emerald-400 font-semibold',
  },
  pending: {
    label: 'Chờ duyệt',
    className: 'text-amber-700 dark:text-amber-400 font-semibold',
  },
  draft: {
    label: 'Bản nháp',
    className: 'text-slate-600 dark:text-slate-400 font-medium',
  },
  rejected: {
    label: 'Bị từ chối',
    className: 'text-red-600 dark:text-red-400 font-semibold',
  },
};

type ModalState =
  | null
  | {
      type: 'reject' | 'request_delete' | 'delete' | 'approve_delete';
      post: PostSummary;
    };

export function DashboardView({
  user,
  blogDomain,
  notifications,
  onNotificationsChange,
  onEditPost,
  onNotify,
}: DashboardViewProps) {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [modalState, setModalState] = useState<ModalState>(null);

  // Quick preview modal state
  const [previewPost, setPreviewPost] = useState<PostDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const res = await apiRequest<{ posts: PostSummary[] }>('/api/posts');
    setLoading(false);
    if (!res.ok) {
      onNotify(res.data.error || 'Không thể tải danh sách bài viết.', 'error');
      return;
    }
    setPosts(res.data.posts || []);
  }, [onNotify]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const counts = useMemo(() => {
    const c = {
      all: posts.length,
      draft: 0,
      pending: 0,
      published: 0,
      rejected: 0,
      delete_requested: 0,
    };
    posts.forEach((p) => {
      if (p.status in c) c[p.status] += 1;
      if (Number(p.delete_requested) === 1) c.delete_requested += 1;
    });
    return c;
  }, [posts]);

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts.filter((p) => {
      if (filter === 'delete_requested' && Number(p.delete_requested) !== 1) return false;
      if (filter !== 'all' && filter !== 'delete_requested' && p.status !== filter) return false;
      if (!q) return true;
      return (
        (p.title || '').toLowerCase().includes(q) ||
        (p.slug || '').toLowerCase().includes(q) ||
        (p.author_name || '').toLowerCase().includes(q) ||
        (p.tags || '').toLowerCase().includes(q)
      );
    });
  }, [posts, filter, searchQuery]);

  const handleMarkNotifRead = async (id: number) => {
    await apiRequest('/api/notifications/read', { method: 'POST', body: { id } });
    onNotificationsChange(notifications.filter((n) => n.id !== id));
  };

  const handleMarkAllRead = async () => {
    await apiRequest('/api/notifications/read-all', { method: 'POST' });
    onNotificationsChange([]);
  };

  const executePostAction = async (postId: number, action: string, reason = '') => {
    setActionBusyId(postId);
    const res = await apiRequest('/api/posts/action', {
      method: 'POST',
      body: { post_id: postId, action, reason },
    });
    setActionBusyId(null);
    setModalState(null);

    if (!res.ok) {
      onNotify(res.data.error || 'Thao tác thất bại.', 'error');
      return;
    }
    onNotify(res.data.message || 'Thao tác thành công!', 'success');
    if (previewPost && previewPost.id === postId) {
      setPreviewPost(null);
    }
    await loadPosts();
  };

  const openQuickPreview = async (postId: number) => {
    setPreviewLoading(true);
    setPreviewPost(null);
    const res = await apiRequest<{ post: PostDetail }>(`/api/posts/detail?id=${postId}`);
    setPreviewLoading(false);
    if (!res.ok || !res.data.post) {
      onNotify(res.data.error || 'Không thể tải nội dung bài viết.', 'error');
      return;
    }
    setPreviewPost(res.data.post);
  };

  const filterTabs: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'draft', label: 'Bản nháp' },
    { key: 'pending', label: 'Chờ duyệt' },
    { key: 'published', label: 'Đã đăng' },
    { key: 'rejected', label: 'Bị từ chối' },
    { key: 'delete_requested', label: 'Yêu cầu xóa' },
  ];

  return (
    <div className="space-y-6">
      {/* Unread Notifications Panel */}
      {notifications.length > 0 && (
        <section
          aria-label="Thông báo mới"
          className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden"
        >
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Bell className="w-4 h-4 text-[#4169E1] dark:text-[#5B7FF0]" />
              <span className="tabular-nums">Thông báo mới ({notifications.length})</span>
            </div>
            {notifications.length > 1 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#4169E1] dark:text-[#5B7FF0] hover:underline cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Đọc tất cả</span>
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm text-slate-800 dark:text-slate-200">{n.message}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {n.created_at}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleMarkNotifRead(n.id)}
                  className="self-start sm:self-center shrink-0 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#4169E1] hover:text-[#4169E1] transition-colors cursor-pointer"
                >
                  Đã hiểu
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Posts Workspace */}
      <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
        {/* Header & Search */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {user.role === 'admin' ? 'Quản lý bài viết' : 'Bài viết của bạn'}
              </h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {user.full_name} · {user.role === 'admin' ? 'Quản trị viên' : 'Thành viên'} ·{' '}
                {counts.published} đã đăng · {counts.pending} chờ duyệt · {counts.draft} bản nháp
              </p>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm tiêu đề, slug, tác giả..."
                  aria-label="Tìm kiếm bài viết"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#4169E1]"
                />
              </div>
              <button
                type="button"
                onClick={() => onEditPost(null)}
                className="sm:hidden inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#4169E1] hover:bg-[#3154C4] text-white text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                <PenSquare className="w-4 h-4" />
                <span>Viết bài</span>
              </button>
            </div>
          </div>

          {/* Interactive Segmented Filter Tabs */}
          <div
            className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 w-fit max-w-full"
            role="tablist"
            aria-label="Lọc trạng thái bài viết"
          >
            {filterTabs.map((tab) => {
              const active = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(tab.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                    active
                      ? 'bg-[#4169E1] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={active ? 'text-white/85' : 'text-slate-400 dark:text-slate-500'}>
                    ({counts[tab.key]})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[1, 2, 3].map((row) => (
              <div key={row} className="px-6 py-4 animate-pulse flex items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-2/5 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-3 w-1/3 bg-slate-100 dark:bg-slate-800/60 rounded" />
                </div>
                <div className="h-7 w-24 bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="px-6 py-14 text-center space-y-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {searchQuery.trim()
                ? 'Không tìm thấy bài viết nào khớp với từ khóa tìm kiếm.'
                : 'Chưa có bài viết nào trong mục này.'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bắt đầu viết bài mới bằng Markdown kèm công thức LaTeX và tự động lưu nháp.
            </p>
            {!searchQuery.trim() && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => onEditPost(null)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4169E1] hover:bg-[#3154C4] text-white text-sm font-medium transition-colors cursor-pointer"
                >
                  <PenSquare className="w-4 h-4" />
                  <span>Viết bài đầu tiên</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="hidden md:table-header-group border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
                <tr className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-5">Tiêu đề & Đường dẫn</th>
                  <th className="py-3 px-4 w-44">Tác giả</th>
                  <th className="py-3 px-4 w-36">Trạng thái</th>
                  <th className="py-3 px-4 w-40">Cập nhật</th>
                  <th className="py-3 px-5 text-right w-56">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80 text-sm">
                {filteredPosts.map((post) => {
                  const isLive = post.status === 'published' || Boolean(post.published_slug);
                  const isDelReq = Number(post.delete_requested) === 1;
                  const statusMeta = STATUS_META[post.status] || STATUS_META.draft;
                  const busy = actionBusyId === post.id;

                  return (
                    <tr
                      key={post.id}
                      className="block md:table-row p-4 md:p-0 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      {/* Title & Metadata */}
                      <td className="block md:table-cell md:py-3.5 md:px-5 align-top">
                        <button
                          type="button"
                          onClick={() => openQuickPreview(post.id)}
                          className="text-left font-semibold text-slate-900 dark:text-white hover:text-[#4169E1] dark:hover:text-[#5B7FF0] transition-colors cursor-pointer leading-snug"
                        >
                          {post.title || '(Bản nháp chưa đặt tiêu đề)'}
                        </button>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          <span className="font-mono break-all">
                            {blogDomain.replace(/^https?:\/\//, '')}/{post.slug}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{post.reading_time || 1} phút đọc</span>
                          {post.published_slug && post.status !== 'published' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-emerald-700 dark:text-emerald-400">
                                Đang có bản xuất bản
                              </span>
                            </>
                          )}
                        </div>
                        {post.status === 'rejected' && post.reject_reason && (
                          <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                            Lý do từ chối: {post.reject_reason}
                          </p>
                        )}
                        {isDelReq && (
                          <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                            Yêu cầu xóa: {post.delete_reason || 'Tác giả đề nghị gỡ bài viết'}
                          </p>
                        )}
                      </td>

                      {/* Author */}
                      <td className="block md:table-cell mt-2 md:mt-0 md:py-3.5 md:px-4 align-top">
                        <span className="md:hidden text-xs text-slate-400 mr-1.5">Tác giả:</span>
                        <span className="text-slate-800 dark:text-slate-200 font-medium">
                          {post.author_name}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                          ({post.author_role === 'admin' ? 'Admin' : 'Thành viên'})
                        </span>
                      </td>

                      {/* Status */}
                      <td className="block md:table-cell mt-1.5 md:mt-0 md:py-3.5 md:px-4 align-top">
                        <span className="md:hidden text-xs text-slate-400 mr-1.5">Trạng thái:</span>
                        <div className="inline-flex md:flex flex-col gap-0.5 text-xs">
                          <span className={statusMeta.className}>{statusMeta.label}</span>
                          {isDelReq && (
                            <span className="text-red-600 dark:text-red-400 font-medium">
                              Chờ duyệt xóa
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Updated */}
                      <td className="block md:table-cell mt-1 md:mt-0 md:py-3.5 md:px-4 align-top">
                        <span className="md:hidden text-xs text-slate-400 mr-1.5">Cập nhật:</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {post.updated_at}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="block md:table-cell mt-3 md:mt-0 md:py-3.5 md:px-5 align-top">
                        <div className="flex flex-wrap items-center md:justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openQuickPreview(post.id)}
                            title="Xem trước bài viết"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#4169E1] hover:text-[#4169E1] transition-colors whitespace-nowrap cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Xem</span>
                          </button>

                          {(user.role === 'admin' || post.author_id === user.id) && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onEditPost(post.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#4169E1] hover:text-[#4169E1] transition-colors whitespace-nowrap cursor-pointer"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                              <span>{post.status === 'draft' ? 'Viết tiếp' : 'Sửa'}</span>
                            </button>
                          )}

                          {user.role === 'admin' && post.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => executePostAction(post.id, 'approve')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Duyệt</span>
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setModalState({ type: 'reject', post })}
                                className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-amber-500 hover:text-amber-600 transition-colors whitespace-nowrap cursor-pointer"
                              >
                                Từ chối
                              </button>
                            </>
                          )}

                          {user.role === 'admin' && isDelReq && (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setModalState({ type: 'approve_delete', post })}
                                className="px-2.5 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
                              >
                                Duyệt xóa
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => executePostAction(post.id, 'reject_delete')}
                                className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-slate-400 transition-colors whitespace-nowrap cursor-pointer"
                              >
                                Giữ bài
                              </button>
                            </>
                          )}

                          {user.role === 'admin' && !isDelReq && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setModalState({ type: 'delete', post })}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Xóa</span>
                            </button>
                          )}

                          {user.role === 'member' && post.author_id === user.id && (
                            <>
                              {!isLive ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setModalState({ type: 'delete', post })}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Xóa</span>
                                </button>
                              ) : !isDelReq ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setModalState({ type: 'request_delete', post })}
                                  className="px-2.5 py-1.5 rounded-md border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  Yêu cầu xóa
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => executePostAction(post.id, 'cancel_delete_request')}
                                  className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-slate-400 transition-colors whitespace-nowrap cursor-pointer"
                                >
                                  Hủy yêu cầu xóa
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Quick Preview Modal */}
      {(previewLoading || previewPost) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-[1px] p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Xem trước bài viết"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPreviewPost(null);
              setPreviewLoading(false);
            }
          }}
        >
          <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  Xem trước bài viết
                </div>
                {previewPost && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                    {blogDomain}/{previewPost.slug}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {previewPost && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const id = previewPost.id;
                        setPreviewPost(null);
                        onEditPost(id);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#4169E1] hover:text-[#4169E1] cursor-pointer"
                    >
                      Mở trình soạn thảo
                    </button>
                    {user.role === 'admin' && previewPost.status === 'pending' && (
                      <button
                        type="button"
                        disabled={actionBusyId === previewPost.id}
                        onClick={() => executePostAction(previewPost.id, 'approve')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                      >
                        Duyệt & Xuất bản
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPreviewPost(null);
                    setPreviewLoading(false);
                  }}
                  aria-label="Đóng xem trước"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto">
              {previewLoading ? (
                <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  Đang tải nội dung bài viết...
                </div>
              ) : previewPost ? (
                <MarkdownPreview
                  title={previewPost.title}
                  description={previewPost.description}
                  cover={previewPost.cover}
                  tags={previewPost.tags}
                  content={previewPost.content}
                  authorName={previewPost.author_name}
                  updatedAt={previewPost.updated_at}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Action Confirmation / Reason Dialog */}
      <DialogModal
        open={modalState !== null}
        loading={modalState ? actionBusyId === modalState.post.id : false}
        title={
          modalState?.type === 'reject'
            ? 'Từ chối bài viết'
            : modalState?.type === 'request_delete'
              ? 'Gửi yêu cầu xóa bài viết'
              : modalState?.type === 'approve_delete'
                ? 'Duyệt yêu cầu xóa bài viết'
                : 'Xác nhận xóa bài viết'
        }
        description={
          modalState?.type === 'reject'
            ? `Nhập lý do từ chối bài "${modalState.post.title}" để hệ thống gửi thông báo cho tác giả chỉnh sửa.`
            : modalState?.type === 'request_delete'
              ? `Bài "${modalState.post.title}" đang xuất bản trên blog. Nhập lý do gỡ bài để gửi Quản trị viên phê duyệt.`
              : modalState?.type === 'approve_delete'
                ? `Chấp thuận yêu cầu và xóa vĩnh viễn "${modalState.post.title}" khỏi cơ sở dữ liệu cũng như tệp Markdown trên GitHub?`
                : `Bạn chắc chắn muốn xóa bài viết "${modalState?.post.title || ''}"? Hành động này không thể hoàn tác.`
        }
        confirmLabel={
          modalState?.type === 'reject'
            ? 'Xác nhận từ chối'
            : modalState?.type === 'request_delete'
              ? 'Gửi yêu cầu xóa'
              : 'Xóa vĩnh viễn'
        }
        variant={modalState?.type === 'reject' ? 'primary' : 'danger'}
        inputLabel={
          modalState?.type === 'reject'
            ? 'Lý do từ chối'
            : modalState?.type === 'request_delete'
              ? 'Lý do đề nghị gỡ bài'
              : undefined
        }
        inputPlaceholder={
          modalState?.type === 'reject'
            ? 'Ví dụ: Cần bổ sung ví dụ minh họa và kiểm tra lại công thức ở mục 2...'
            : 'Ví dụ: Bài viết trùng nội dung hoặc cần gỡ bỏ...'
        }
        onClose={() => setModalState(null)}
        onConfirm={(inputVal) => {
          if (!modalState) return;
          if (modalState.type === 'reject') {
            executePostAction(
              modalState.post.id,
              'reject',
              inputVal.trim() || 'Nội dung chưa đạt yêu cầu.'
            );
          } else if (modalState.type === 'request_delete') {
            executePostAction(
              modalState.post.id,
              'request_delete',
              inputVal.trim() || 'Tác giả yêu cầu gỡ bài viết.'
            );
          } else {
            executePostAction(modalState.post.id, 'delete');
          }
        }}
      />
    </div>
  );
}
