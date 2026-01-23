# Hướng dẫn Deploy Web lên Hosting

## Tổng quan

Ứng dụng này gồm 2 phần:
- **Backend**: Node.js/Express API (port 5000)
- **Frontend**: React/Vite (port 3000)

## Các phương án deploy

### Phương án 1: Deploy lên VPS/Cloud Server (Khuyến nghị)

#### Yêu cầu:
- VPS với Ubuntu/Debian (tối thiểu 1GB RAM, 1 CPU)
- Domain name (tùy chọn)
- MySQL database (có thể dùng MySQL trên VPS hoặc database service)

#### Bước 1: Chuẩn bị VPS

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài đặt Node.js (version 18 hoặc cao hơn)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Cài đặt MySQL
sudo apt install -y mysql-server
sudo mysql_secure_installation

# Cài đặt Nginx (reverse proxy)
sudo apt install -y nginx

# Cài đặt PM2 (process manager)
sudo npm install -g pm2
```

#### Bước 2: Upload code lên VPS

**Cách 1: Sử dụng Git**
```bash
# Trên VPS
cd /var/www
sudo git clone <your-repo-url> laundry66
cd laundry66
```

**Cách 2: Sử dụng SCP/SFTP**
```bash
# Từ máy local
scp -r Laundry66 user@your-server-ip:/var/www/
```

#### Bước 3: Cấu hình Backend

```bash
cd /var/www/laundry66/backend

# Cài đặt dependencies
npm install

# Tạo file .env
nano .env
```

**Nội dung file `.env`:**
```env
PORT=5000
NODE_ENV=production

# MySQL Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_db_user
MYSQL_PASSWORD=your_db_password
MYSQL_DATABASE=laundry66

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-to-random-string
JWT_EXPIRE=7d
```

**Khởi tạo database:**
```bash
# Tạo database
mysql -u root -p
CREATE DATABASE laundry66 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'your_db_user'@'localhost' IDENTIFIED BY 'your_db_password';
GRANT ALL PRIVILEGES ON laundry66.* TO 'your_db_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;

# Chạy migration (database sẽ tự động tạo tables khi backend khởi động)
# Hoặc chạy thủ công:
cd /var/www/laundry66/backend
node scripts/initDatabase.js
```

**Chạy backend với PM2:**
```bash
pm2 start server.js --name "laundry66-backend" --cwd /var/www/laundry66/backend
pm2 save
pm2 startup
```

#### Bước 4: Build và cấu hình Frontend

```bash
cd /var/www/laundry66/frontend

# Cài đặt dependencies
npm install

# Tạo file .env.production
nano .env.production
```

**Nội dung file `.env.production`:**
```env
VITE_API_URL=http://your-domain.com/api
# hoặc
VITE_API_URL=http://your-server-ip:5000/api
```

**Build frontend:**
```bash
npm run build
```

**Copy build files vào Nginx:**
```bash
sudo cp -r dist/* /var/www/html/
# hoặc tạo thư mục riêng
sudo mkdir -p /var/www/laundry66-frontend
sudo cp -r dist/* /var/www/laundry66-frontend/
```

#### Bước 5: Cấu hình Nginx

```bash
sudo nano /etc/nginx/sites-available/laundry66
```

**Cấu hình Nginx:**
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    # hoặc dùng IP: server_name _;

    # Frontend
    root /var/www/laundry66-frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
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

    # Static files
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Kích hoạt site:**
```bash
sudo ln -s /etc/nginx/sites-available/laundry66 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### Bước 6: Cấu hình Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

#### Bước 7: SSL Certificate (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

---

### Phương án 2: Deploy lên Railway/Render/Fly.io

#### Railway (Khuyến nghị cho người mới)

**Backend:**
1. Đăng ký tại [railway.app](https://railway.app)
2. Tạo project mới
3. Add MySQL database service
4. Add Node.js service, connect GitHub repo
5. Set root directory: `backend`
6. Set start command: `npm start`
7. Add environment variables:
   - `PORT` (auto)
   - `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` (từ MySQL service)
   - `JWT_SECRET`, `JWT_EXPIRE`, `NODE_ENV=production`

**Frontend:**
1. Add Static site serviceadd
2. Connect GitHub repo
3. Set root directory: `frontend`
4. Set build command: `npm run build`
5. Set output directory: `dist`
6. Add environment variable: `VITE_API_URL=https://your-backend.railway.app/api`

#### Render

**Backend:**
1. Đăng ký tại [render.com](https://render.com)
2. Tạo Web Service
3. Connect GitHub repo
4. Settings:
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`
   - Environment: Node
5. Add MySQL database service
6. Add environment variables

**Frontend:**
1. Tạo Static Site
2. Connect GitHub repo
3. Build Command: `cd frontend && npm install && npm run build`
4. Publish Directory: `frontend/dist`

---

### Phương án 3: Deploy lên Hosting Việt Nam

Các nhà cung cấp hosting Việt Nam phổ biến hỗ trợ Node.js và MySQL:

#### 1. Hostinger Vietnam

**Đặc điểm:**
- Hỗ trợ Node.js trên gói Business/Cloud
- MySQL database đi kèm
- Giao diện hPanel dễ sử dụng
- Giá từ ~150,000đ/tháng

**Các bước deploy:**

1. **Đăng ký gói hosting:**
   - Chọn gói Business hoặc Cloud (hỗ trợ Node.js)
   - Đăng ký tại [hostinger.vn](https://www.hostinger.vn)

2. **Tạo Node.js App:**
   - Đăng nhập hPanel
   - Vào **Websites** → **Add Website** → Chọn **Node.js Apps**
   - Kết nối GitHub repo hoặc upload file ZIP

3. **Cấu hình Backend:**
   - **Root Directory:** `backend`
   - **Node.js Version:** 18.x hoặc 20.x
   - **Start Command:** `npm start`
   - **Build Command:** `npm install`
   - **Port:** Để trống (hệ thống tự gán)

4. **Cấu hình Environment Variables:**
   - Vào **Environment Variables** trong hPanel
   - Thêm các biến:
     ```
     NODE_ENV=production
     MYSQL_HOST=localhost (hoặc IP MySQL từ hPanel)
     MYSQL_PORT=3306
     MYSQL_USER=your_db_user
     MYSQL_PASSWORD=your_db_password
     MYSQL_DATABASE=laundry66
     JWT_SECRET=your-secret-key
     JWT_EXPIRE=7d
     ```

5. **Tạo MySQL Database:**
   - Vào **Databases** → **MySQL Databases**
   - Tạo database mới: `laundry66`
   - Tạo user và gán quyền
   - Lưu thông tin connection

6. **Deploy Frontend:**
   - Tạo thêm một Node.js App khác cho frontend
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run preview` (hoặc dùng static hosting)
   - **Environment Variable:** `VITE_API_URL=https://your-backend-domain.hostingerapp.com/api`

**Lưu ý:**
- Hostinger có thể giới hạn số lượng Node.js apps trên một gói
- Nếu chỉ có 1 app, có thể build frontend thành static files và serve qua backend

---

#### 2. Matbao

**Đặc điểm:**
- Hỗ trợ Node.js trên gói Cloud
- MySQL database
- Giao diện quản lý đơn giản
- Giá từ ~200,000đ/tháng

**Các bước deploy:**

1. **Đăng ký gói Cloud:**
   - Chọn gói có hỗ trợ Node.js
   - Đăng ký tại [matbao.net](https://www.matbao.net)

2. **Upload code:**
   - Sử dụng File Manager hoặc FTP
   - Upload toàn bộ project vào thư mục `public_html` hoặc thư mục riêng

3. **Cấu hình qua SSH (nếu có quyền):**
   ```bash
   cd /path/to/your/project/backend
   npm install
   # Tạo file .env với thông tin database
   ```

4. **Cấu hình Process Manager:**
   - Sử dụng PM2 hoặc process manager của Matbao
   - Đảm bảo app tự động restart khi server reboot

5. **Cấu hình Domain:**
   - Trỏ domain về hosting
   - Cấu hình reverse proxy nếu cần

---

#### 3. P.A Vietnam (PA Vietnam)

**Đặc điểm:**
- VPS và Cloud Server
- Full quyền root access
- Hỗ trợ cài đặt tự do
- Giá từ ~100,000đ/tháng (VPS)

**Các bước deploy:**

1. **Đăng ký VPS/Cloud:**
   - Chọn gói phù hợp (tối thiểu 1GB RAM)
   - Đăng ký tại [pavietnam.vn](https://www.pavietnam.vn)

2. **Cài đặt môi trường (qua SSH):**
   ```bash
   # Cập nhật hệ thống
   sudo apt update && sudo apt upgrade -y
   
   # Cài Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs
   
   # Cài MySQL
   sudo apt install -y mysql-server
   
   # Cài PM2
   sudo npm install -g pm2
   
   # Cài Nginx
   sudo apt install -y nginx
   ```

3. **Upload code và cấu hình:**
   - Theo hướng dẫn **Phương án 1: Deploy lên VPS/Cloud Server** ở trên

---

#### 4. Azdigi

**Đặc điểm:**
- VPS và Cloud Server chất lượng cao
- Hỗ trợ tốt cho Node.js
- Giá từ ~150,000đ/tháng

**Các bước deploy:**
- Tương tự như P.A Vietnam (VPS)
- Hoặc sử dụng Cloud Server với hướng dẫn VPS ở trên

---

#### 5. BKNS

**Đặc điểm:**
- VPS và Cloud Server
- Giá rẻ, phù hợp startup
- Giá từ ~80,000đ/tháng

**Các bước deploy:**
- Tương tự như P.A Vietnam (VPS)

---

#### 6. StableHost Vietnam

**Đặc điểm:**
- Shared hosting và VPS
- Hỗ trợ Node.js trên một số gói
- Giá từ ~120,000đ/tháng

**Các bước deploy:**
- Kiểm tra gói hosting có hỗ trợ Node.js
- Nếu có: tương tự Hostinger
- Nếu không: nâng cấp lên VPS và làm theo hướng dẫn VPS

---

#### 7. Viettel IDC / FPT Cloud (Enterprise)

**Đặc điểm:**
- Cloud Server enterprise
- Hỗ trợ đầy đủ Node.js, MySQL
- Phù hợp cho doanh nghiệp
- Giá từ ~500,000đ/tháng

**Các bước deploy:**
- Tương tự như VPS/Cloud Server
- Có thể sử dụng Docker nếu cần

---

### So sánh Hosting Việt Nam

| Nhà cung cấp | Loại | Giá/tháng | Node.js | MySQL | Khuyến nghị |
|--------------|------|-----------|---------|-------|-------------|
| **Hostinger** | Shared/Cloud | 150k-500k | ✅ | ✅ | ⭐⭐⭐⭐⭐ Dễ dùng nhất |
| **Matbao** | Cloud | 200k-800k | ✅ | ✅ | ⭐⭐⭐⭐ |
| **P.A Vietnam** | VPS | 100k-500k | ✅ (tự cài) | ✅ (tự cài) | ⭐⭐⭐⭐ Tự chủ cao |
| **Azdigi** | VPS/Cloud | 150k-1M | ✅ (tự cài) | ✅ (tự cài) | ⭐⭐⭐⭐⭐ Chất lượng tốt |
| **BKNS** | VPS | 80k-300k | ✅ (tự cài) | ✅ (tự cài) | ⭐⭐⭐ Giá rẻ |
| **StableHost** | Shared/VPS | 120k-400k | ⚠️ (một số gói) | ✅ | ⭐⭐⭐ |
| **Viettel/FPT** | Cloud | 500k+ | ✅ | ✅ | ⭐⭐⭐⭐⭐ Enterprise |

---

### Lưu ý khi deploy lên Hosting Việt Nam

1. **Kiểm tra hỗ trợ Node.js:**
   - Một số gói shared hosting không hỗ trợ Node.js
   - Cần gói Business/Cloud hoặc VPS

2. **Database:**
   - Đa số hosting Việt Nam cung cấp MySQL đi kèm
   - Kiểm tra giới hạn số lượng database
   - Lưu ý về backup tự động

3. **Domain:**
   - Nhiều hosting Việt Nam tặng domain .vn hoặc .com.vn
   - Kiểm tra SSL certificate (Let's Encrypt thường miễn phí)

4. **Hỗ trợ:**
   - Hỗ trợ tiếng Việt, dễ liên hệ
   - Thời gian hỗ trợ: thường 24/7 hoặc giờ hành chính

5. **Performance:**
   - Server đặt tại Việt Nam → tốc độ truy cập nhanh
   - Phù hợp cho người dùng trong nước

6. **Thanh toán:**
   - Hỗ trợ thanh toán VNĐ
   - Có thể thanh toán qua chuyển khoản, thẻ nội địa

---

### Phương án 4: Deploy lên Vercel/Netlify (Frontend) + Backend riêng

**Frontend lên Vercel:**
```bash
# Cài đặt Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel
```

**Cấu hình:**
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variable: `VITE_API_URL=https://your-backend-url.com/api`

**Backend:** Deploy lên Railway/Render như trên

---

## Cập nhật code sau khi deploy

### Trên VPS:
```bash
cd /var/www/laundry66
git pull origin main
cd backend
npm install
pm2 restart laundry66-backend
cd ../frontend
npm install
npm run build
sudo cp -r dist/* /var/www/laundry66-frontend/
```

### Trên Railway/Render:
- Tự động deploy khi push code lên GitHub (nếu đã connect)

---

## Kiểm tra sau khi deploy

1. **Backend health check:**
   ```bash
   curl http://your-domain.com/api/health
   ```

2. **Frontend:** Mở browser và truy cập domain

3. **Database:** Kiểm tra kết nối từ backend logs

---

## Troubleshooting

### Backend không chạy:
```bash
# Kiểm tra PM2
pm2 list
pm2 logs laundry66-backend

# Kiểm tra port
sudo netstat -tlnp | grep 5000
```

### Frontend không load:
```bash
# Kiểm tra Nginx
sudo nginx -t
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### Database connection error:
- Kiểm tra credentials trong `.env` (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE)
- Kiểm tra MySQL service: `sudo systemctl status mysql`
- Kiểm tra firewall cho MySQL port (3306)
- Test connection: `mysql -u your_db_user -p -h localhost laundry66`

---

## Bảo mật

1. **Đổi JWT_SECRET** thành một chuỗi ngẫu nhiên mạnh
2. **Cấu hình CORS** trong backend nếu cần
3. **Sử dụng HTTPS** (Let's Encrypt)
4. **Backup database** định kỳ
5. **Giới hạn rate limiting** cho API

---

## Backup

### Backup database:
```bash
mysqldump -u your_db_user -p laundry66 > backup_$(date +%Y%m%d).sql
```

### Restore database:
```bash
mysql -u your_db_user -p laundry66 < backup_20240118.sql
```

---

## Đo lường RAM cần thiết

### Ước tính RAM cho từng component

**Ứng dụng Laundry66:**
- **Backend (Node.js/Express):** 100-300 MB
- **Frontend (React build - static files):** 10-50 MB (khi serve qua Nginx)
- **MySQL Database:** 200-500 MB (tùy số lượng dữ liệu)
- **Nginx (reverse proxy):** 20-50 MB
- **Hệ điều hành (Ubuntu/Debian):** 200-400 MB
- **Buffer/Cache:** 100-200 MB

**Tổng ước tính:**
- **Tối thiểu:** 1 GB RAM (cho development/small scale)
- **Khuyến nghị:** 2 GB RAM (cho production, 1-5 cửa hàng)
- **Tối ưu:** 4 GB RAM (cho production, nhiều cửa hàng, nhiều user đồng thời)

---

### Cách đo lường RAM hiện tại

#### 1. Đo trên máy local (Windows)

**Sử dụng Task Manager:**
1. Mở Task Manager (Ctrl + Shift + Esc)
2. Tab **Details** → Tìm các process:
   - `node.exe` (Backend)
   - `mysqld.exe` hoặc MySQL service (Database)
   - Browser process (Frontend khi dev)
3. Cộng tổng **Memory (private working set)**

**Sử dụng PowerShell:**
```powershell
# Xem RAM của Node.js processes
Get-Process node | Select-Object ProcessName, @{Name="RAM(MB)";Expression={[math]::Round($_.WS/1MB,2)}}

# Xem RAM của MySQL
Get-Process mysqld | Select-Object ProcessName, @{Name="RAM(MB)";Expression={[math]::Round($_.WS/1MB,2)}}

# Xem tổng RAM đang dùng
Get-CimInstance Win32_OperatingSystem | Select-Object @{Name="TotalRAM(GB)";Expression={[math]::Round($_.TotalVisibleMemorySize/1GB,2)}}, @{Name="FreeRAM(GB)";Expression={[math]::Round($_.FreePhysicalMemory/1GB,2)}}
```

---

#### 2. Đo trên VPS/Server (Linux)

**Sử dụng `htop` (khuyến nghị):**
```bash
# Cài đặt htop
sudo apt install htop

# Chạy htop
htop
```
- Nhấn `F5` để xem tree view
- Tìm các process: `node`, `mysqld`, `nginx`
- Xem cột **RES** (Resident Memory) - đây là RAM thực tế đang dùng

**Sử dụng `free` command:**
```bash
# Xem RAM tổng quan
free -h

# Xem chi tiết
free -m
```

**Sử dụng `ps` command:**
```bash
# Xem RAM của Node.js
ps aux | grep node | awk '{sum+=$6} END {print "Node.js RAM: " sum/1024 " MB"}'

# Xem RAM của MySQL
ps aux | grep mysqld | awk '{sum+=$6} END {print "MySQL RAM: " sum/1024 " MB"}'

# Xem RAM của Nginx
ps aux | grep nginx | awk '{sum+=$6} END {print "Nginx RAM: " sum/1024 " MB"}'

# Xem tất cả processes và RAM
ps aux --sort=-%mem | head -20
```

**Sử dụng PM2 (nếu dùng PM2):**
```bash
# Xem thông tin chi tiết của app
pm2 show laundry66-backend

# Xem monitoring real-time
pm2 monit

# Xem stats
pm2 list
```

---

#### 3. Đo trong code (Node.js)

**Thêm monitoring vào backend:**

Tạo file `backend/utils/memoryMonitor.js`:
```javascript
export const getMemoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    rss: `${Math.round(usage.rss / 1024 / 1024)} MB`, // Total memory
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(usage.external / 1024 / 1024)} MB`,
  };
};

// Log memory mỗi 5 phút
setInterval(() => {
  console.log('Memory Usage:', getMemoryUsage());
}, 5 * 60 * 1000);
```

**Thêm endpoint để check memory:**
```javascript
// Trong backend/routes/settings.js hoặc tạo route mới
router.get('/health/memory', (req, res) => {
  const usage = process.memoryUsage();
  res.json({
    memory: {
      rss: `${Math.round(usage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(usage.external / 1024 / 1024)} MB`,
    },
    uptime: `${Math.round(process.uptime())} seconds`,
  });
});
```

---

#### 4. Đo MySQL RAM

**Kiểm tra MySQL memory:**
```bash
# Đăng nhập MySQL
mysql -u root -p

# Xem các biến memory
SHOW VARIABLES LIKE '%buffer%';
SHOW VARIABLES LIKE '%cache%';

# Xem memory đang dùng
SHOW STATUS LIKE 'Innodb_buffer_pool%';
```

**Các biến quan trọng:**
- `innodb_buffer_pool_size`: RAM cho InnoDB (thường 50-70% tổng RAM)
- `key_buffer_size`: RAM cho MyISAM
- `max_connections`: Số kết nối tối đa

---

### Công cụ monitoring nâng cao

#### 1. PM2 Plus (miễn phí)
```bash
# Đăng ký PM2 Plus
pm2 link <secret_key> <public_key>

# Xem dashboard online
# Truy cập https://app.pm2.io
```

#### 2. Netdata (Real-time monitoring)
```bash
# Cài đặt Netdata
bash <(curl -Ss https://my-netdata.io/kickstart.sh)

# Truy cập http://your-server-ip:19999
```

#### 3. Grafana + Prometheus (Enterprise)
- Cài đặt phức tạp hơn
- Phù hợp cho hệ thống lớn

---

### Test load để đo RAM

**Tạo script test:**
```bash
# Tạo file test-load.sh
#!/bin/bash
for i in {1..100}; do
  curl http://localhost:5000/api/orders &
done
wait
```

**Sử dụng Apache Bench (ab):**
```bash
# Cài đặt
sudo apt install apache2-utils

# Test 1000 requests, 10 concurrent
ab -n 1000 -c 10 http://localhost:5000/api/orders
```

**Sử dụng Artillery (Node.js load testing):**
```bash
npm install -g artillery

# Tạo file test.yml
# Chạy test
artillery run test.yml
```

Trong khi test, monitor RAM bằng `htop` hoặc `pm2 monit`.

---

### Tối ưu RAM

#### 1. Giới hạn Node.js memory
```bash
# Chạy với giới hạn memory
node --max-old-space-size=512 server.js

# Hoặc trong PM2 ecosystem file
# ecosystem.config.js
module.exports = {
  apps: [{
    name: 'laundry66-backend',
    script: 'server.js',
    max_memory_restart: '500M', // Tự động restart nếu vượt 500MB
  }]
};
```

#### 2. Tối ưu MySQL
```bash
# Chỉnh sửa /etc/mysql/mysql.conf.d/mysqld.cnf
[mysqld]
innodb_buffer_pool_size = 256M  # Cho server 1GB RAM
max_connections = 50
```

#### 3. Cleanup định kỳ
- Xóa logs cũ
- Xóa cache không cần thiết
- Optimize database tables

---

### Bảng tham khảo RAM theo quy mô

| Quy mô | Số cửa hàng | Users đồng thời | RAM khuyến nghị | RAM tối thiểu |
|--------|-------------|-----------------|-----------------|---------------|
| **Nhỏ** | 1-2 | 1-5 | 2 GB | 1 GB |
| **Vừa** | 3-10 | 5-20 | 4 GB | 2 GB |
| **Lớn** | 10-50 | 20-100 | 8 GB | 4 GB |
| **Rất lớn** | 50+ | 100+ | 16 GB+ | 8 GB |

**Lưu ý:**
- RAM tối thiểu chỉ đủ để chạy, không có buffer
- Nên có ít nhất 20-30% RAM trống để hệ thống hoạt động tốt
- Nếu dùng Docker, cần thêm 200-500 MB cho Docker daemon

---

### Kiểm tra RAM trước khi deploy

**Checklist:**
1. ✅ Đo RAM trên local khi chạy đầy đủ
2. ✅ Test với số lượng requests tương đương production
3. ✅ Kiểm tra MySQL memory settings
4. ✅ Tính toán buffer cho hệ điều hành (20-30%)
5. ✅ Chọn gói hosting có RAM >= (RAM cần thiết × 1.3)

**Ví dụ:**
- Ứng dụng cần: 800 MB
- Buffer hệ thống: 200 MB
- **Tổng cần:** 1 GB
- **Nên chọn:** 2 GB (để có buffer và scale sau này)

---

## Chi phí ước tính

- **VPS**: $5-10/tháng (DigitalOcean, Linode, Vultr)
- **Railway**: Free tier (có giới hạn), $5-20/tháng
- **Render**: Free tier, $7-25/tháng
- **Domain**: $10-15/năm
- **SSL**: Miễn phí (Let's Encrypt)

**Hosting Việt Nam (theo RAM):**
- **1 GB RAM:** 100k-200k/tháng
- **2 GB RAM:** 150k-300k/tháng
- **4 GB RAM:** 300k-600k/tháng
- **8 GB RAM:** 600k-1.2M/tháng

---

## Hỗ trợ

Nếu gặp vấn đề, kiểm tra:
1. Logs của backend (PM2 hoặc hosting service)
2. Logs của Nginx
3. Browser console (F12)
4. Network tab để xem API calls
