# Hướng dẫn Khắc phục Lỗi

## Lỗi CORS: "CORS request did not succeed" với Status code: (null)

### Nguyên nhân:
Lỗi này thường xảy ra khi **backend server không chạy** hoặc **không thể kết nối được**.

### Cách khắc phục:

#### Bước 1: Kiểm tra Backend có đang chạy không

**Windows:**
```powershell
# Kiểm tra process Node.js
Get-Process node -ErrorAction SilentlyContinue

# Kiểm tra port 5000
netstat -ano | findstr :5000
```

**Linux/Mac:**
```bash
# Kiểm tra process Node.js
ps aux | grep node

# Kiểm tra port 5000
lsof -i :5000
# hoặc
netstat -tulpn | grep :5000
```

#### Bước 2: Kiểm tra cấu hình Backend

Chạy script kiểm tra:
```bash
cd backend
node check-server.js
```

Script này sẽ kiểm tra:
- ✅ Environment variables
- ✅ MySQL connection
- ✅ Port availability

#### Bước 3: Khởi động Backend

**Cách 1: Sử dụng start.bat (Windows)**
```bash
# Từ thư mục gốc
start.bat
```

**Cách 2: Khởi động thủ công**
```bash
# Terminal 1 - Backend
cd backend
npm install
npm run dev

# Terminal 2 - Frontend
cd frontend
npm install
npm run dev
```

#### Bước 4: Kiểm tra MySQL

**Windows:**
1. Mở **Services** (Win + R → `services.msc`)
2. Tìm **MySQL** service
3. Đảm bảo service đang **Running**

**Linux:**
```bash
sudo systemctl status mysql
# Nếu không chạy:
sudo systemctl start mysql
```

**Kiểm tra kết nối MySQL:**
```bash
mysql -u root -p
# Hoặc với user từ .env
mysql -u your_user -p -h localhost
```

#### Bước 5: Kiểm tra file .env

Tạo file `backend/.env` nếu chưa có:
```env
PORT=5000
NODE_ENV=development

# MySQL Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=laundry66

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRE=7d
```

#### Bước 6: Test Backend API

Mở browser hoặc dùng curl:
```bash
# Test health endpoint
curl http://localhost:5000/api/health

# Hoặc mở browser:
# http://localhost:5000/api/health
```

**Kết quả mong đợi:**
```json
{
  "status": "ok",
  "database": "connected",
  "memory": {...},
  "uptime": "...",
  "timestamp": "..."
}
```

#### Bước 7: Kiểm tra Browser Console

1. Mở Browser DevTools (F12)
2. Tab **Console** - xem có lỗi gì không
3. Tab **Network** - xem request có được gửi không
   - Nếu request có status `(failed)` hoặc `(pending)` → Backend không chạy
   - Nếu request có status `CORS error` → Vấn đề CORS (đã fix)

---

## Lỗi MySQL Connection

### Lỗi: "ECONNREFUSED" hoặc "Access denied"

**Nguyên nhân:**
- MySQL không chạy
- Sai username/password
- Database chưa được tạo

**Khắc phục:**

1. **Kiểm tra MySQL đang chạy:**
   ```bash
   # Windows
   Get-Service MySQL*
   
   # Linux
   sudo systemctl status mysql
   ```

2. **Tạo database:**
   ```sql
   CREATE DATABASE IF NOT EXISTS laundry66 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. **Kiểm tra user và quyền:**
   ```sql
   -- Xem users
   SELECT user, host FROM mysql.user;
   
   -- Tạo user mới (nếu cần)
   CREATE USER 'your_user'@'localhost' IDENTIFIED BY 'your_password';
   GRANT ALL PRIVILEGES ON laundry66.* TO 'your_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

---

## Lỗi Port đã được sử dụng

### Lỗi: "EADDRINUSE: address already in use :::5000"

**Khắc phục:**

**Windows:**
```powershell
# Tìm process đang dùng port 5000
netstat -ano | findstr :5000

# Kill process (thay PID bằng số từ lệnh trên)
taskkill /PID <PID> /F
```

**Linux/Mac:**
```bash
# Tìm process
lsof -i :5000

# Kill process
kill -9 <PID>
```

---

## Lỗi Frontend không kết nối được Backend

### Kiểm tra API URL

File `frontend/src/utils/api.js`:
```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
```

**Nếu backend chạy trên port khác:**
1. Tạo file `frontend/.env.local`:
   ```env
   VITE_API_URL=http://localhost:5000/api
   ```
2. Restart frontend dev server

---

## Checklist Debug

Khi gặp lỗi CORS, kiểm tra theo thứ tự:

- [ ] Backend server có đang chạy? (`http://localhost:5000/api/health`)
- [ ] MySQL có đang chạy?
- [ ] File `.env` có đúng cấu hình?
- [ ] Database `laundry66` đã được tạo?
- [ ] Port 5000 có bị chiếm bởi process khác?
- [ ] Frontend đang gọi đúng URL? (`http://localhost:5000/api`)
- [ ] Browser console có lỗi gì khác không?

---

## Liên hệ hỗ trợ

Nếu vẫn không giải quyết được:
1. Chạy `node backend/check-server.js` và gửi kết quả
2. Kiểm tra logs của backend (terminal nơi chạy `npm run dev`)
3. Kiểm tra browser console (F12)
4. Kiểm tra Network tab trong DevTools
