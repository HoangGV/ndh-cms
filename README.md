# Người Đồng Hành CMS
Hệ thống quản trị bài viết cho Người đồng hành.
---
## Hướng dẫn cài đặt trên Website Cloudflare
### Bước 1: Tạo Database D1 trên Cloudflare & chạy `schema.sql`

1. Đăng nhập [Cloudflare Dashboard](https://dash.cloudflare.com/) ➔ **Storage & Databases** ➔ **D1 SQL Database** ➔ bấm **Create**.
2. Đặt tên database là `ndh-cms-db` ➔ bấm **Create**.
3. Mở database `ndh-cms-db` vừa tạo:
   - Sao chép **Database ID** (hiển thị ngay đầu trang) để dùng ở Bước 2.
   - Chuyển sang tab **Console** ➔ copy toàn bộ nội dung file `schema.sql` dán vào ô nhập lệnh ➔ bấm **Execute** để tạo sẵn các bảng (`users`, `posts`, `notifications`).

---

### Bước 2: Chỉnh sửa file `wrangler.toml`
Thay thế `DÁN_DATABASE_ID_VỪA_COPY_Ở_BƯỚC_1`, `ten-github-cua-ban`, `ten-repo-blog-cua-ban`, `https://domain.vn`
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "ndh-cms-db"
   database_id = "DÁN_DATABASE_ID_VỪA_COPY_Ở_BƯỚC_1"

   [vars]
   GITHUB_OWNER = "ten-github-cua-ban"
   GITHUB_REPO = "ten-repo-blog-cua-ban"
   GITHUB_BRANCH = "main"
   GITHUB_CONTENT_PATH = "src/content/blog"
   BLOG_DOMAIN = "https://domain.vn"
   ```
---

### Bước 3: Kết nối GitHub & Deploy trên Cloudflare Dashboard

1. Vào **Cloudflare Dashboard** ➔ **Compute (Workers)** ➔ **Create** ➔ **Import a repository** ➔ chọn repo `ndh-blog-cms` vừa tạo.
2. Để mặc định và nhấn **deploy**
---

### Bước 4: Gắn D1 & thêm 2 biến Secret (`GITHUB_TOKEN`, `JWT_SECRET`)

Sau khi deploy xong lần đầu, mở trang quản lý Worker `ndh-blog-cms` ➔ vào tab **Settings**:

1. **Bindings** ➔ kiểm tra mục **D1 Database** đã có biến `DB` trỏ vào `ndh-cms-db` (nếu chưa có thì bấm **Add** ➔ chọn **D1 Database** ➔ Variable name: `DB` ➔ chọn `ndh-cms-db`).
2. **Runtime variables and secrets** ➔ bấm **Add variable** để thêm **2 biến dạng Secret** *(nhớ tích chọn vào ô **Secret** ở ô Value)*:
   - **`GITHUB_TOKEN`**: Dán **Fine-grained PAT** của GitHub (`github_pat_...`).
     > Cách tạo PAT an toàn trên GitHub: **Settings ➔ Developer settings ➔ Personal access tokens ➔ Fine-grained tokens ➔ Generate new token** ➔ chọn **Only select repositories** (chỉ chọn đúng repo blog) ➔ mục **Repository permissions ➔ Contents** chọn **Read and write** ➔ tạo và copy token.
   - **`JWT_SECRET`**: Nhập một chuỗi bí mật ngẫu nhiên dài tối thiểu 32 ký tự (ví dụ tự gõ chuỗi ký tự chữ + số ngẫu nhiên thật dài).
3. Bấm **Deploy** / **Save** để áp dụng Secret.

---

### Bước 5: Gắn tên miền phụ `cms.ndh.io.vn`

1. Trong trang Worker `ndh-blog-cms` ➔ tab **Settings** ➔ **Domains & Routes** ➔ bấm **Add** ➔ chọn **Custom Domain**.
2. Nhập `cms.ndh.io.vn` ➔ bấm **Add Custom Domain**.
3. Cloudflare sẽ tự động tạo bản ghi DNS và cấp chứng chỉ SSL HTTPS sau vài giây.

---

### Bước 6: Tạo tài khoản Admin đầu tiên & sử dụng

1. Truy cập `https://cms.ndh.io.vn`.
2. Vì cơ sở dữ liệu chưa có Admin nào, giao diện sẽ tự động hiện màn hình **Khởi tạo tài khoản Quản trị viên** — bạn nhập Họ tên, Username và Mật khẩu cá nhân của mình rồi bấm tạo.
   - Sau khi tạo xong tài khoản Admin đầu tiên, màn hình khởi tạo sẽ **tự khóa vĩnh viễn** (an toàn hơn việc dùng mật khẩu mặc định cố định).
3. Vào mục **Tài khoản** trên thanh menu để kiểm tra phần **Cấu hình xuất bản GitHub** đã báo **Sẵn sàng commit lên GitHub** là hoàn tất!
