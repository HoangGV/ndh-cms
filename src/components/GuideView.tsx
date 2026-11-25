import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { MarkdownPreview } from './MarkdownPreview';

const SAMPLE_STRUCTURE = `# Tiêu đề bài viết

Đoạn văn mở đầu giới thiệu nội dung chính của bài viết.

## 1. Ứng dụng công nghệ trong lớp học

Nội dung phân tích và ví dụ minh họa.

### 1.1. Triển khai thực tế

Chi tiết các bước thực hiện.

## 2. Tổng kết

Tóm tắt những điểm quan trọng cần ghi nhớ.`;

const SAMPLE_LATEX = `$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$`;

const SAMPLE_CODE = `\`\`\`python
def chao_mung(ten):
    return f"Xin chào {ten} đến với NDH!"
\`\`\``;

const SAMPLE_TABLE = `| Bước | Hành động | Thời lượng | Ghi chú |
| :--- | :--- | :--- | :--- |
| **01** | Chọn 1 nhiệm vụ duy nhất | - | Không làm đa nhiệm |
| **02** | Cài đặt bộ đếm | 25 phút | Tắt mọi thông báo |`;

function CopyableBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="my-4 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-[#0d1117]">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#161b22] border-b border-[#30363d] text-xs font-mono text-slate-400">
        <span>{lang}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#30363d] text-slate-200 hover:border-[#5B7FF0] hover:text-white transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs sm:text-sm font-mono leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function GuideView() {
  return (
    <article className="max-w-4xl mx-auto rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-8">
      <header className="pb-5 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Hướng dẫn viết bài chuẩn trên NDH Blog CMS
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Quy chuẩn soạn thảo Markdown, công thức toán học LaTeX (KaTeX), khung mã nguồn và bảng dữ liệu cho hệ thống Người Đồng Hành.
        </p>
      </header>

      <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-slate-800">
          1. Hướng dẫn tạo bài đăng mới
        </h2>
        <p>
          Bấm <strong>Viết bài mới</strong> ở thanh điều hướng trên cùng, điền các trường thông tin (Tiêu đề, Slug, Mô tả ngắn, Thẻ, Ảnh bìa) và soạn nội dung bằng cú pháp <strong>Markdown</strong>. Hệ thống tự động đóng gói YAML frontmatter (<code>--- ... ---</code>) khi xuất bản lên GitHub và tự động lưu nháp sau 5 giây ngừng gõ.
        </p>

        <h3 className="text-base font-semibold text-slate-900 dark:text-white pt-2">
          Cấu trúc nội dung mẫu chuẩn
        </h3>
        <p>
          Chia bài viết theo các đề mục <code>##</code> và <code>###</code> để blog tự động tạo khung <strong>Mục lục</strong> rõ ràng cho người đọc:
        </p>
        <CopyableBlock lang="markdown" code={SAMPLE_STRUCTURE} />

        <h3 className="text-base font-semibold text-slate-900 dark:text-white pt-2">
          Lưu ý khi đặt đường dẫn và thẻ
        </h3>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Đường dẫn tĩnh (<strong>Slug</strong>) viết thường, không dấu, nối bằng dấu gạch ngang (ví dụ: <code>bai-viet-so-1</code>). Slug tương ứng đường dẫn trên blog (<code>/bai-viet-so-1</code>).
          </li>
          <li>
            Không đặt slug trùng với các trang hệ thống: <code>tool</code>, <code>tag</code>, <code>gioi-thieu</code>, <code>tim-kiem</code>, <code>404</code>, <code>api</code>, <code>admin</code>.
          </li>
          <li>
            Các thẻ nhập ở ô <strong>Tags</strong> (cách nhau bởi dấu phẩy) sẽ tự động tổng hợp vào trang <code>/tag</code> và bộ lọc ở trang chủ.
          </li>
          <li>
            Thành viên sau khi gửi bài sẽ chuyển trạng thái <strong>Chờ duyệt</strong>; Quản trị viên sẽ kiểm tra, phê duyệt và hệ thống tự động commit tệp <code>.md</code> lên kho GitHub.
          </li>
        </ul>
      </section>

      <section className="space-y-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-slate-800">
          2. Công thức toán học LaTeX (KaTeX)
        </h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <strong>Công thức trong dòng:</strong> đặt giữa hai dấu <code>$</code> — ví dụ <code>$E = mc^2$</code> hoặc <code>$\Delta = b^2 - 4ac$</code>.
          </li>
          <li>
            <strong>Khối công thức độc lập:</strong> đặt giữa hai cặp dấu <code>$$</code> để căn giữa thành một khối riêng:
          </li>
        </ol>
        <CopyableBlock lang="markdown" code={SAMPLE_LATEX} />

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Kết quả hiển thị thực tế
          </div>
          <MarkdownPreview content={`Công thức trong dòng $E = mc^2$ và khối công thức:\n\n${SAMPLE_LATEX}`} />
        </div>
      </section>

      <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-slate-800">
          3. Khối mã nguồn có nút sao chép & Bảng dữ liệu
        </h2>
        <p>
          Đặt đoạn mã giữa cặp ba dấu backtick (<code>```</code>) kèm tên ngôn ngữ như <code>python</code>, <code>typescript</code>, <code>html</code>, <code>css</code>, <code>bash</code>. Khung mã sẽ tự động tô màu cú pháp và gắn nút <strong>Sao chép</strong>.
        </p>
        <CopyableBlock lang="markdown" code={SAMPLE_CODE} />

        <h3 className="text-base font-semibold text-slate-900 dark:text-white pt-2">
          Bảng dữ liệu Markdown (GFM)
        </h3>
        <p>Luôn để trống một dòng phía trên bảng để trình phân tích nhận diện chính xác các cột:</p>
        <CopyableBlock lang="markdown" code={SAMPLE_TABLE} />

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Kết quả bảng hiển thị thực tế
          </div>
          <MarkdownPreview content={SAMPLE_TABLE} />
        </div>
      </section>
    </article>
  );
}
