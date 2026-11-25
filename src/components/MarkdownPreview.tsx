import { ImageOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { enhancePreviewContainer, renderSafeMarkdownHtml } from '../lib/markdown';
import { calculateReadingTime, isSafeDisplayUrl } from '../lib/slug';

interface MarkdownPreviewProps {
  title?: string;
  description?: string;
  cover?: string;
  tags?: string;
  content: string;
  authorName?: string;
  updatedAt?: string;
  emptyPlaceholder?: string;
}

export function MarkdownPreview({
  title,
  description,
  cover,
  tags,
  content,
  authorName,
  updatedAt,
  emptyPlaceholder = 'Chưa có nội dung để hiển thị...',
}: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [coverFailed, setCoverFailed] = useState(false);

  const safeCover = cover && isSafeDisplayUrl(cover) ? cover.trim() : '';
  const readingTime = useMemo(() => calculateReadingTime(content), [content]);
  const tagList = useMemo(
    () =>
      String(tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    [tags]
  );

  const sanitizedHtml = useMemo(() => {
    const source = content.trim() ? content : `*${emptyPlaceholder}*`;
    return renderSafeMarkdownHtml(source);
  }, [content, emptyPlaceholder]);

  useEffect(() => {
    setCoverFailed(false);
  }, [safeCover]);

  useEffect(() => {
    if (containerRef.current) {
      enhancePreviewContainer(containerRef.current);
    }
  }, [sanitizedHtml]);

  return (
    <article className="text-slate-900 dark:text-slate-100">
      {safeCover && (
        <div className="mb-5">
          {!coverFailed ? (
            <img
              src={safeCover}
              alt={title || 'Ảnh bìa bài viết'}
              referrerPolicy="no-referrer"
              onError={() => setCoverFailed(true)}
              className="w-full max-h-80 object-cover rounded-lg border border-slate-200 dark:border-slate-800"
            />
          ) : (
            <div className="w-full h-36 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <ImageOff className="w-5 h-5" />
              <span>Không thể tải ảnh bìa từ đường dẫn đã nhập</span>
            </div>
          )}
        </div>
      )}

      {title?.trim() && (
        <header className="pb-4 mb-5 border-b border-slate-200 dark:border-slate-800">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight [text-wrap:balance]">
            {title.trim()}
          </h1>
          {description?.trim() && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {description.trim()}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span>{readingTime} phút đọc</span>
            {authorName && (
              <>
                <span aria-hidden="true">·</span>
                <span>Tác giả: {authorName}</span>
              </>
            )}
            {updatedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{updatedAt}</span>
              </>
            )}
            {tagList.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{tagList.join(' / ')}</span>
              </>
            )}
          </div>
        </header>
      )}

      <div
        ref={containerRef}
        className="markdown-preview"
        // Safe: sanitized strictly via DOMPurify in renderSafeMarkdownHtml()
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </article>
  );
}
