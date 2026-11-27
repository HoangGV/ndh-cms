import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface DialogModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
  inputLabel?: string;
  inputPlaceholder?: string;
  defaultValue?: string;
  requiredConfirmText?: string;
  loading?: boolean;
  onConfirm: (inputValue: string, confirmText?: string) => void;
  onClose: () => void;
}

export function DialogModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Hủy',
  variant = 'primary',
  inputLabel,
  inputPlaceholder,
  defaultValue = '',
  requiredConfirmText,
  loading = false,
  onConfirm,
  onClose,
}: DialogModalProps) {
  const [value, setValue] = useState(defaultValue);
  const [confirmInput, setConfirmInput] = useState('');

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setConfirmInput('');
    }
  }, [open, defaultValue]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, loading, onClose]);

  if (!open) return null;

  const isConfirmMatched = !requiredConfirmText || confirmInput === requiredConfirmText;
  const hasCaseMismatch =
    Boolean(requiredConfirmText) &&
    confirmInput.length > 0 &&
    confirmInput !== requiredConfirmText &&
    confirmInput.toUpperCase() === requiredConfirmText;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <h3 id="modal-title" className="text-base font-semibold text-slate-900 dark:text-white">
            {title}
          </h3>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{description}</p>

        {inputLabel && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {inputLabel}
            </label>
            <textarea
              rows={3}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={inputPlaceholder}
              autoFocus={!requiredConfirmText}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#4169E1]"
            />
          </div>
        )}

        {requiredConfirmText && (
          <div className="mt-4">
            <label
              htmlFor="modal-confirm-phrase"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Nhập chính xác{' '}
              <code className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 font-mono text-xs font-semibold text-red-600 dark:text-red-400">
                {requiredConfirmText}
              </code>{' '}
              (viết hoa) để tiếp tục
            </label>
            <input
              id="modal-confirm-phrase"
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isConfirmMatched && !loading) {
                  e.preventDefault();
                  onConfirm(value, confirmInput);
                }
              }}
              placeholder={requiredConfirmText}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm font-mono tracking-wider text-slate-900 dark:text-slate-100 focus:outline-none focus:border-red-500"
            />
            {hasCaseMismatch && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                Cần bật Caps Lock / nhập đúng chữ in hoa "{requiredConfirmText}".
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading || !isConfirmMatched}
            onClick={() => onConfirm(value, confirmInput)}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#4169E1] hover:bg-[#3154C4]'
            }`}
          >
            {loading ? 'Đang xử lý...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
