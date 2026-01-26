# 🚀 HƯỚNG DẪN DEPLOY THỦ CÔNG LÊN VPS

Hướng dẫn chi tiết từng bước để deploy Backend và Frontend Laundry66 lên VPS (CentOS).

---

## 📋 MỤC LỤC

1. [Chuẩn bị](#1-chuẩn-bị)
2. [Deploy Backend](#2-deploy-backend)
3. [Deploy Frontend](#3-deploy-frontend)
4. [Cấu hình Nginx](#4-cấu-hình-nginx)
5. [Kiểm tra](#5-kiểm-tra)

---

## 1. CHUẨN BỊ

### 1.1. Yêu cầu trên VPS

- ✅ CentOS đã cài đặt
- ✅ Node.js đã cài đặt
- ✅ MySQL (MariaDB) đã cài đặt
- ✅ PM2 đã cài đặt
- ✅ Nginx đã cài đặt
- ✅ Git đã cài đặt

### 1.2. Thông tin cần có

- **VPS IP**: `xxx.xxx.xxx.xxx`
- **SSH User**: `root` (hoặc user khác)
- **GitHub Repository**: `https://github.com/YOUR_USERNAME/Laundry.git`
- **Branch**: `main` (hoặc `master`)

---

## 2. DEPLOY BACKEND

### Bước 1: Kết nối SSH vào VPS

```bash
ssh root@your-server-ip
# Nhập password khi được yêu cầu
```

### Bước 2: Tạo thư mục cho backend

```bash
# Tạo thư mục
sudo mkdir -p /var/www/laundry-backend

# Cấp quyền
sudo chown -R $USER:$USER /var/www/laundry-backend
```

### Bước 3: Clone code từ GitHub

```bash
# Di chuyển vào thư mục
cd /var/www/laundry-backend

# Clone repository
git clone https://github.com/nhathai3333/Laundry.git temp

# Copy code backend
cp -r temp/backend/* .
cp -r temp/backend/.* . 2>/dev/null || true

# Xóa thư mục temp
rm -rf temp
```

**Lưu ý:** Thay `YOUR_USERNAME` bằng username GitHub của bạn.

### Bước 4: Kiểm tra code đã được copy

```bash
# Kiểm tra các file
ls -la

# Phải thấy các file như: server.js, package.json, routes/, etc.
```

### Bước 5: Cài đặt dependencies

```bash
# Đảm bảo đang ở thư mục backend
cd /var/www/laundry-backend

# Cài đặt dependencies
npm install --production
```

**Chờ quá trình cài đặt hoàn tất** (có thể mất vài phút).

### Bước 6: Tạo file .env

```bash
# Tạo file .env
nano .env
```

**Copy và paste nội dung sau, sau đó sửa các giá trị:**

```env
# Server Configuration
PORT=5000
NODE_ENV=production

# JWT Configuration
JWT_SECRET=Nq6aFIR3++40BPvY01XAtIcxZDAX3aHipWk5OzBI6qU=
JWT_EXPIRE=7d

# MySQL Database
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=laundry_user
MYSQL_PASSWORD=sa2008
MYSQL_DATABASE=laundry66

# Frontend URL
# Nếu đã map domain:
FRONTEND_URL=http://quanlycuahangabc.id.vn
# Hoặc nếu chưa có domain, dùng IP:
# FRONTEND_URL=http://103.130.212.155
```

**Tạo JWT_SECRET mạnh:**

Mở terminal khác và chạy:
```bash
openssl rand -base64 32
```

Copy kết quả và paste vào `JWT_SECRET` trong file `.env`.

**Lưu file:** Nhấn `Ctrl + X`, sau đó `Y`, rồi `Enter`.

### Bước 7: Tạo database và user MySQL

```bash
# Đăng nhập MySQL
sudo mysql -u root -p
# Nhập password root MySQL
```

Trong MySQL console, chạy các lệnh sau:

```sql
-- Tạo database
CREATE DATABASE laundry66 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tạo user (thay 'your_secure_password' bằng mật khẩu mạnh)
CREATE USER 'laundry_user'@'localhost' IDENTIFIED BY 'sa2008';

-- Cấp quyền
GRANT ALL PRIVILEGES ON laundry66.* TO 'laundry_user'@'localhost';

-- Áp dụng thay đổi
FLUSH PRIVILEGES;

-- Thoát
EXIT;
```

**Cập nhật mật khẩu trong .env:**

```bash
nano /var/www/laundry-backend/.env
# Cập nhật MYSQL_PASSWORD với mật khẩu vừa tạo
```

### Bước 8: Khởi tạo database schema

```bash
cd /var/www/laundry-backend
npm run init-db
```

Nếu thành công, sẽ thấy thông báo:
```
✅ Database initialized successfully
```

**Lưu ý:** Nếu muốn **reset lại database hoàn toàn** (xóa tất cả dữ liệu và tạo lại từ đầu):

```bash
cd /var/www/laundry-backend
npm run reset-db
```

⚠️ **CẢNH BÁO:** Lệnh này sẽ **XÓA TẤT CẢ DỮ LIỆU** trong database và tạo lại từ đầu. Chỉ dùng khi:
- Muốn bắt đầu lại từ đầu
- Đang trong môi trường development/test
- Đã backup dữ liệu quan trọng

### Bước 9: Tạo root admin (tùy chọn)

```bash
cd /var/www/laundry-backend
npm run create-root-admin
```

Nhập thông tin khi được yêu cầu:
- Phone: `admin` (hoặc số điện thoại)
- Password: (mật khẩu mạnh)
- Name: `Admin`

### Bước 10: Khởi động Backend với PM2

```bash
cd /var/www/laundry-backend

# Khởi động ứng dụng
pm2 start server.js --name laundry-backend

# Lưu cấu hình PM2
pm2 save

# Thiết lập tự động khởi động khi server reboot
pm2 startup
```

**Chạy lệnh được PM2 cung cấp** (thường là: `sudo env PATH=...`)

### Bước 11: Kiểm tra Backend

```bash
# Xem trạng thái
pm2 status

# Xem logs
pm2 logs laundry-backend

# Test API
curl http://localhost:5000/api/health
```

Nếu thấy response JSON với `status: 'ok'` là thành công!

---

## 3. DEPLOY FRONTEND

### Bước 1: Trên máy local - Mở terminal

Mở terminal/PowerShell trên máy tính của bạn (không phải VPS).

### Bước 2: Di chuyển vào thư mục project

```bash
cd /path/to/Laundry
# Hoặc trên Windows:
# cd C:\Users\phamh\Documents\GitHub\Laundry
```

### Bước 3: Di chuyển vào thư mục frontend

```bash
cd frontend
```

### Bước 4: Cài đặt dependencies (nếu chưa có)

```bash
npm install
```

**Chờ quá trình cài đặt hoàn tất.**

### Bước 5: Build frontend

```bash
npm run build
```

**Chờ quá trình build hoàn tất.** Sau khi build, thư mục `dist/` sẽ được tạo.

### Bước 6: Kiểm tra thư mục dist

```bash
# Trên Windows
dir dist

# Trên Mac/Linux
ls -la dist
```

Phải thấy các file như: `index.html`, `assets/`, etc.

### Bước 7: Tạo thư mục trên VPS

**Quay lại terminal VPS** (hoặc mở SSH mới):

```bash
ssh root@your-server-ip

# Tạo thư mục frontend
sudo mkdir -p /var/www/laundry-frontend

# Cấp quyền
sudo chown -R $USER:$USER /var/www/laundry-frontend
```

### Bước 8: Upload file build lên VPS

**Quay lại terminal máy local:**

**Cách 1: Sử dụng SCP (khuyến nghị)**

```bash
# Từ thư mục frontend trên máy local
scp -r dist/* root@103.130.212.155:/var/www/laundry-frontend/
```

**Nhập password khi được yêu cầu.**

**Cách 2: Sử dụng FileZilla (GUI)**

1. Tải FileZilla: https://filezilla-project.org
2. Mở FileZilla
3. File → Site Manager → New Site
4. Nhập thông tin:
   - **Host**: `your-server-ip`
   - **Protocol**: `SFTP`
   - **Logon Type**: `Normal`
   - **User**: `root`
   - **Password**: (password VPS)
5. Click "Connect"
6. Kéo thả toàn bộ nội dung trong thư mục `dist/` lên `/var/www/laundry-frontend/`

### Bước 9: Cấp quyền cho Nginx

**Trên VPS:**

```bash
# Cấp quyền cho Nginx
sudo chown -R nginx:nginx /var/www/laundry-frontend
sudo chmod -R 755 /var/www/laundry-frontend
```

**Lưu ý:** Trên CentOS, user Nginx là `nginx` (không phải `www-data`).

---

## 4. CẤU HÌNH NGINX

### Bước 1: Tạo file cấu hình Nginx

```bash
sudo nano /etc/nginx/conf.d/laundry-frontend.conf
```

### Bước 2: Copy nội dung sau vào file

```nginx
server {
    listen 80;
    server_name quanlycuahangabc.id.vn www.quanlycuahangabc.id.vn;
    # Hoặc nếu chưa có domain, dùng IP:
    # server_name 103.130.212.155;

    root /var/www/laundry-frontend;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript 
               application/x-javascript application/xml+rss application/json;

    # Serve static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Proxy API requests to backend
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Lưu ý:**
- `server_name` đã được cấu hình cho domain `quanlycuahangabc.id.vn`
- Nếu chưa map domain, có thể tạm thời dùng IP `103.130.212.155` (uncomment dòng 348)
- Các phần khác thường không cần sửa

**Lưu file:** `Ctrl + X`, `Y`, `Enter`

### Bước 3: Kiểm tra cấu hình Nginx

```bash
sudo nginx -t
```

Nếu thấy `syntax is ok` và `test is successful` là OK.

### Bước 4: Restart Nginx

```bash
sudo systemctl restart nginx
```

### Bước 5: Kiểm tra Nginx đang chạy

```bash
sudo systemctl status nginx
```

---

## 5. KIỂM TRA

### Bước 1: Kiểm tra Backend

**Trên VPS:**

```bash
# Xem trạng thái PM2
pm2 status

# Xem logs
pm2 logs laundry-backend

# Test API
curl http://localhost:5000/api/health
```

**Kết quả mong đợi:** JSON response với `status: 'ok'`

### Bước 2: Kiểm tra Frontend

**Mở trình duyệt:**

1. Truy cập: `http://your-server-ip` hoặc `http://yourdomain.com`
2. Kiểm tra xem trang có load không
3. Mở Developer Tools (F12) → Console
4. Kiểm tra xem có lỗi không

### Bước 3: Test đăng nhập

1. Truy cập trang đăng nhập
2. Thử đăng nhập với tài khoản admin đã tạo
3. Kiểm tra xem có hoạt động không

### Bước 4: Kiểm tra API từ frontend

1. Mở Developer Tools (F12) → Network
2. Thực hiện một thao tác (ví dụ: đăng nhập)
3. Kiểm tra xem các request API có thành công không (status 200)

---

## 🔄 CẬP NHẬT CODE SAU NÀY

### Cập nhật Backend:

**Bước 1: Pull code mới từ GitHub**

```bash
# Trên VPS
cd /var/www/laundry-backend
git pull origin main
# Hoặc nếu code chưa có git:
# Clone lại như bước 3 phần Deploy Backend
```

**Bước 2: Cài đặt dependencies mới (nếu có)**

```bash
npm install --production
```

**Bước 3: Chạy database migration (nếu có thay đổi schema)**

Nếu có thay đổi về cấu trúc database (thêm cột, bảng mới), cần chạy migration:

```bash
# Chạy migration script cụ thể (ví dụ: thêm cột subscription)
cd /var/www/laundry-backend
node scripts/add_subscription_columns.js
```

Hoặc nếu có migration script khác:
```bash
node scripts/your_migration_script.js
```

**Bước 4: Restart PM2**

```bash
pm2 restart laundry-backend
```

### Cập nhật Frontend:

**Bước 1: Build lại trên máy local**

```bash
# Trên máy local
cd frontend
npm run build
```

**Bước 2: Upload lại lên VPS**

```bash
# Upload file mới
scp -r dist/* root@your-server-ip:/var/www/laundry-frontend/

# Cấp quyền lại
ssh root@your-server-ip "chown -R nginx:nginx /var/www/laundry-frontend"
```

---

## 🔧 TROUBLESHOOTING

### Backend không chạy

```bash
# Xem logs chi tiết
pm2 logs laundry-backend --lines 50

# Kiểm tra file .env
cat /var/www/laundry-backend/.env

# Chạy thủ công để xem lỗi
cd /var/www/laundry-backend
node server.js
```

**Lỗi thường gặp:**
- **Port đã được sử dụng**: Đổi PORT trong .env
- **Database connection failed**: Kiểm tra .env và MySQL
- **Module not found**: Chạy `npm install` lại

### Frontend không load

```bash
# Kiểm tra Nginx
sudo nginx -t
sudo tail -f /var/log/nginx/error.log

# Kiểm tra quyền file
ls -la /var/www/laundry-frontend
sudo chown -R nginx:nginx /var/www/laundry-frontend
```

### CORS Error

Cập nhật `FRONTEND_URL` trong `.env` và restart:

```bash
nano /var/www/laundry-backend/.env
# Cập nhật FRONTEND_URL
pm2 restart laundry-backend
```

### 404 Not Found khi truy cập route

Kiểm tra cấu hình Nginx có `try_files $uri $uri/ /index.html;` chưa.

---

## ✅ CHECKLIST HOÀN THÀNH

- [ ] Backend đã được clone từ GitHub
- [ ] Dependencies backend đã được cài đặt
- [ ] File .env đã được tạo và cấu hình
- [ ] Database đã được tạo và khởi tạo
- [ ] Backend chạy với PM2
- [ ] Frontend đã được build
- [ ] Frontend đã được upload lên VPS
- [ ] Nginx đã được cấu hình
- [ ] Đã test đăng nhập và các chức năng

---

## 🎉 HOÀN TẤT!

Sau khi hoàn thành tất cả các bước:
- ✅ Backend: `http://your-server-ip:5000` hoặc qua Nginx proxy
- ✅ Frontend: `http://your-server-ip` hoặc `http://yourdomain.com`
- ✅ Database: Đã được khởi tạo
- ✅ PM2: Đã được cấu hình tự động khởi động

**Hệ thống đã sẵn sàng sử dụng! 🚀**

---

## 📞 HỖ TRỢ

Nếu gặp vấn đề:
1. Kiểm tra logs: `pm2 logs`, `nginx error.log`
2. Kiểm tra firewall: `sudo firewall-cmd --list-all`
3. Kiểm tra file .env có đúng không
4. Xem file TROUBLESHOOTING.md
