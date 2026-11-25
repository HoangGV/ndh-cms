import {
  ArrowLeft,
  Bold,
  Code,
  Columns2,
  Eye,
  Heading2,
  Heading3,
  Italic,
  Link2,
  PenLine,
  Quote,
  RotateCw,
  Save,
  Send,
  Sigma,
  Table2,
  UploadCloud,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { calculateReadingTime, toVietnameseSlug } from '../lib/slug';
import type { PostDetail, PostStatus, User } from '../types';
import { MarkdownPreview } from './MarkdownPreview';

interface EditorViewProps {
  user: User;
  postId: number | null;
  blogDomain: string;
  onPostIdChange: (newId: number) => void;
  onBack: (flashMessage?: string) => void;
  onNotify: (text: string, type: 'success' | 'error' | 'info') => void;
}

type EditorPaneMode = 'write' | 'split' | 'preview';

export function EditorView({
  user,
  postId: initialPostId,
  blogDomain,
  onPostIdChange,
  onBack,
  onNotify,
}: EditorViewProps) {
  const [currentPostId, setCurrentPostId] = useState<number>(initialPostId || 0);
  const [postStatus, setPostStatus] = useState<PostStatus | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(initialPostId));

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [cover, setCover] = useState('');
  const [content, setContent] = useState('');

  const [paneMode, setPaneMode] = useState<EditorPaneMode>('write');
  const [slugStatusText, setSlugStatusText] = useState(`${blogDomain}/...`);
  const [autosaveText, setAutosaveText] = useState('');
  const [autosaveTone, setAutosaveTone] = useState<'muted' | 'success' | 'warning'>('muted');
  const [submitting, setSubmitting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slugManuallyEditedRef = useRef<boolean>(Boolean(initialPostId));
  const isDirtyRef = useRef<boolean>(false);
  const isSavingRef = useRef<boolean>(false);
  const isSubmittingRef = useRef<boolean>(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest form values in a ref for debounced autosave without stale closures
  const formRef = useRef({ currentPostId, title, slug, description, tags, cover, content });
  formRef.current = { currentPostId, title, slug, description, tags, cover, content };

  const readingTime = useMemo(() => calculateReadingTime(content), [content]);
  const isLivePublished = postStatus === 'published' || Boolean(publishedSlug);

  useEffect(() => {
    let active = true;
    const loadDetail = async () => {
      if (!initialPostId) {
        setLoading(false);
        setSlugStatusText(`${blogDomain}/...`);
        return;
      }
      setLoading(true);
      const res = await apiRequest<{ post: PostDetail }>(`/api/posts/detail?id=${initialPostId}`);
      if (!active) return;
      setLoading(false);

      if (!res.ok || !res.data.post) {
        onNotify(res.data.error || 'Không tìm thấy bài viết hoặc bạn không có quyền truy cập.', 'error');
        onBack();
        return;
      }

      const p = res.data.post;
      setCurrentPostId(p.id);
      setPostStatus(p.status);
      setPublishedSlug(p.published_slug);
      setTitle(p.title || '');
      setSlug(p.slug || '');
      setDescription(p.description || '');
      setTags(p.tags || '');
      setCover(p.cover || '');
      setContent(p.content || '');
      slugManuallyEditedRef.current = true;
      setSlugStatusText(`${blogDomain}/${p.slug}`);
    };

    loadDetail();
    return () => {
      active = false;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    };
  }, [initialPostId, blogDomain, onBack, onNotify]);

  const checkUniqueSlug = useCallback(
    (rawText: string, excludeId: number) => {
      if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
      if (!rawText.trim()) {
        setSlugStatusText(`${blogDomain}/...`);
        return;
      }
      setSlugStatusText(`Đang kiểm tra: ${blogDomain}/${rawText}...`);
      slugTimerRef.current = setTimeout(async () => {
        const res = await apiRequest<{ slug: string }>(
          `/api/slug/check?text=${encodeURIComponent(rawText)}&exclude_id=${excludeId}`
        );
        if (res.ok && res.data.slug) {
          setSlug(res.data.slug);
          setSlugStatusText(`${blogDomain}/${res.data.slug}`);
        }
      }, 350);
    },
    [blogDomain]
  );

  const runAutoSave = useCallback(async () => {
    const snap = formRef.current;
    if (!isDirtyRef.current || isSubmittingRef.current || isSavingRef.current) return;
    if (!snap.title.trim() && !snap.content.trim()) return;

    isSavingRef.current = true;
    isDirtyRef.current = false;
    setAutosaveTone('muted');
    setAutosaveText('Đang tự động lưu...');

    const res = await apiRequest<{
      mode?: string;
      post_id?: number;
      slug?: string;
      saved_at?: string;
    }>('/api/posts/autosave', {
      method: 'POST',
      body: {
        post_id: snap.currentPostId,
        title: snap.title,
        slug: snap.slug,
        description: snap.description,
        tags: snap.tags,
        cover: snap.cover,
        content: snap.content,
      },
    });

    isSavingRef.current = false;

    if (res.ok && res.data.mode === 'db') {
      if (snap.currentPostId === 0 && res.data.post_id) {
        setCurrentPostId(res.data.post_id);
        setPostStatus('draft');
        onPostIdChange(res.data.post_id);
      }
      if (!slugManuallyEditedRef.current && res.data.slug) {
        setSlug(res.data.slug);
        setSlugStatusText(`${blogDomain}/${res.data.slug}`);
      }
      setAutosaveTone('success');
      setAutosaveText(`Đã lưu nháp lúc ${res.data.saved_at}`);
    } else if (res.ok && res.data.mode === 'manual_required') {
      setAutosaveTone('muted');
      setAutosaveText('Bài đã xuất bản/chờ duyệt — bấm nút bên dưới để lưu');
    } else if (res.data.error) {
      setAutosaveTone('warning');
      setAutosaveText(res.data.error);
    } else {
      setAutosaveText('');
    }
  }, [blogDomain, onPostIdChange]);

  const scheduleAutoSave = useCallback(() => {
    isDirtyRef.current = true;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(runAutoSave, 5000);
  }, [runAutoSave]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    scheduleAutoSave();
    if (!slugManuallyEditedRef.current) {
      const nextSlug = toVietnameseSlug(val);
      setSlug(nextSlug);
      checkUniqueSlug(nextSlug, currentPostId);
    }
  };

  const handleSlugChange = (val: string) => {
    slugManuallyEditedRef.current = true;
    const cleaned = toVietnameseSlug(val);
    setSlug(cleaned);
    checkUniqueSlug(cleaned, currentPostId);
    scheduleAutoSave();
  };

  const handleResetSlug = () => {
    slugManuallyEditedRef.current = false;
    const base = toVietnameseSlug(title);
    setSlug(base);
    checkUniqueSlug(base, currentPostId);
    scheduleAutoSave();
  };

  const insertSnippet = (before: string, after = '', placeholder = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const selected = content.slice(start, end) || placeholder;
    const nextContent = `${content.slice(0, start)}${before}${selected}${after}${content.slice(end)}`;
    setContent(nextContent);
    scheduleAutoSave();
    requestAnimationFrame(() => {
      el.focus();
      const cursorStart = start + before.length;
      const cursorEnd = cursorStart + selected.length;
      el.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const submitPost = async (isDraft: boolean) => {
    if (isSubmittingRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    isSubmittingRef.current = true;
    setSubmitting(true);

    const res = await apiRequest<{ post_id?: number; message?: string }>('/api/posts/save', {
      method: 'POST',
      body: {
        post_id: currentPostId,
        is_draft: isDraft,
        title,
        slug,
        description,
        tags,
        cover,
        content,
      },
    });

    setSubmitting(false);
    isSubmittingRef.current = false;

    if (!res.ok) {
      onNotify(res.data.error || 'Không thể lưu bài viết.', 'error');
      return;
    }

    onBack(res.data.message || 'Đã lưu bài viết thành công!');
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitPost(false);
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
        Đang tải nội dung bài viết...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onBack()}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-[#4169E1] dark:hover:text-[#5B7FF0] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại danh sách bài viết</span>
        </button>

        <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {currentPostId > 0 ? `Mã bài #${currentPostId}` : 'Bài viết mới'}
        </div>
      </div>

      {user.role === 'member' && isLivePublished && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Bài viết này đã xuất bản trên blog. Mọi chỉnh sửa sẽ được gửi tới Quản trị viên phê duyệt trước khi cập nhật lên trang chính.
        </div>
      )}

      <form
        onSubmit={handleFormSubmit}
        className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5"
      >
        {/* Metadata Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              Tiêu đề bài viết <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Nhập tiêu đề bài viết..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              Đường dẫn tĩnh (Slug)
            </label>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="duong-dan-bai-viet"
                className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
              />
              <button
                type="button"
                onClick={handleResetSlug}
                title="Tạo lại slug từ tiêu đề"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#4169E1] hover:text-[#4169E1] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Tạo lại</span>
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
              {slugStatusText}
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              Mô tả ngắn (Description)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                scheduleAutoSave();
              }}
              placeholder="Tóm tắt ngắn gọn nội dung bài viết..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              Thẻ (Tags — cách nhau bởi dấu phẩy)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => {
                setTags(e.target.value);
                scheduleAutoSave();
              }}
              placeholder="Sư phạm số, Giáo dục, Đổi mới"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
              URL Ảnh bìa (Cover — tùy chọn)
            </label>
            <input
              type="text"
              value={cover}
              onChange={(e) => {
                setCover(e.target.value);
                scheduleAutoSave();
              }}
              placeholder="https://example.com/anh-bia.webp"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
            />
          </div>
        </div>

        {/* Markdown Editor Toolbar & View Switcher */}
        <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* View Mode Tabs */}
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPaneMode('write')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  paneMode === 'write'
                    ? 'bg-[#4169E1] text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <PenLine className="w-3.5 h-3.5" />
                <span>Viết Markdown</span>
              </button>
              <button
                type="button"
                onClick={() => setPaneMode('split')}
                className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  paneMode === 'split'
                    ? 'bg-[#4169E1] text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span>Chia đôi</span>
              </button>
              <button
                type="button"
                onClick={() => setPaneMode('preview')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  paneMode === 'preview'
                    ? 'bg-[#4169E1] text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Xem trước</span>
              </button>
            </div>

            {/* Autosave & Reading Time Metadata */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
              {autosaveText && (
                <span
                  className={
                    autosaveTone === 'success'
                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                      : autosaveTone === 'warning'
                        ? 'text-amber-600 dark:text-amber-400 font-medium'
                        : 'text-slate-500 dark:text-slate-400'
                  }
                >
                  {autosaveText}
                </span>
              )}
              <span className="text-slate-500 dark:text-slate-400">~{readingTime} phút đọc</span>
            </div>
          </div>

          {/* Formatting Quick Toolbar (visible in Write / Split modes) */}
          {paneMode !== 'preview' && (
            <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <ToolbarBtn
                label="Đề mục H2"
                onClick={() => insertSnippet('\n## ', '\n', 'Tiêu đề mục')}
                icon={<Heading2 className="w-4 h-4" />}
              />
              <ToolbarBtn
                label="Đề mục H3"
                onClick={() => insertSnippet('\n### ', '\n', 'Tiêu đề mục con')}
                icon={<Heading3 className="w-4 h-4" />}
              />
              <ToolbarBtn
                label="In đậm"
                onClick={() => insertSnippet('**', '**', 'văn bản đậm')}
                icon={<Bold className="w-4 h-4" />}
              />
              <ToolbarBtn
                label="In nghiêng"
                onClick={() => insertSnippet('*', '*', 'văn bản nghiêng')}
                icon={<Italic className="w-4 h-4" />}
              />
              <ToolbarBtn
                label="Trích dẫn"
                onClick={() => insertSnippet('\n> ', '\n', 'Nội dung trích dẫn')}
                icon={<Quote className="w-4 h-4" />}
              />
              <ToolbarBtn
                label="Chèn liên kết"
                onClick={() => insertSnippet('[', '](https://)', 'tên liên kết')}
                icon={<Link2 className="w-4 h-4" />}
              />
              <ToolbarBtn
                label="Khối mã nguồn"
                onClick={() => insertSnippet('\n```python\n', '\n```\n', 'print("Xin chào NDH")')}
                icon={<Code className="w-4 h-4" />}
              />
              <ToolbarBtn
                label="Công thức LaTeX"
                onClick={() => insertSnippet('\n$$\n', '\n$$\n', 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}')}
                icon={<Sigma className="w-4 h-4" />}
              />
              <ToolbarBtn
                label="Chèn bảng Markdown"
                onClick={() =>
                  insertSnippet(
                    '\n| Cột 1 | Cột 2 | Ghi chú |\n| :--- | :--- | :--- |\n| ',
                    ' | Nội dung | - |\n',
                    'Mục 1'
                  )
                }
                icon={<Table2 className="w-4 h-4" />}
              />
            </div>
          )}

          {/* Editor / Preview Panes */}
          <div
            className={
              paneMode === 'split' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch' : ''
            }
          >
            {paneMode !== 'preview' && (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  scheduleAutoSave();
                }}
                placeholder="Viết nội dung bài viết bằng cú pháp Markdown, hỗ trợ công thức LaTeX ($...$, $$...$$), bảng GFM và khối mã nguồn..."
                className="w-full min-h-[440px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4 text-sm font-mono leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1] resize-y"
              />
            )}

            {paneMode !== 'write' && (
              <div className="min-h-[440px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/60 p-5 overflow-y-auto">
                <MarkdownPreview
                  title={title}
                  description={description}
                  cover={cover}
                  tags={tags}
                  content={content}
                  authorName={user.full_name}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => onBack()}
            className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Hủy
          </button>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {postStatus !== 'published' && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => submitPost(true)}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-[#4169E1] hover:text-[#4169E1] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>Lưu tạm</span>
              </button>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#4169E1] hover:bg-[#3154C4] text-white text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              {user.role === 'admin' ? (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>
                    {submitting
                      ? 'Đang đẩy lên GitHub...'
                      : isLivePublished
                        ? 'Cập nhật lên GitHub'
                        : 'Xuất bản lên GitHub'}
                  </span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{submitting ? 'Đang gửi duyệt...' : 'Gửi bài chờ Admin duyệt'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ToolbarBtn({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-[#4169E1] dark:hover:text-[#5B7FF0] transition-colors cursor-pointer"
    >
      {icon}
    </button>
  );
}
