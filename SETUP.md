# Hướng dẫn cài đặt Laundry66

## Yêu cầu hệ thống

- Node.js 16+ 
- npm hoặc yarn
- MySQL 5.7+ hoặc MariaDB 10.2+

## Cài đặt nhanh

### Windows

Chạy file `start.bat` hoặc chạy từng bước:

```bash
# Backend
cd backend
npm install
npm run init-db
npm run dev

# Frontend (terminal mới)
cd frontend
npm install
npm run dev
```

### Linux/Mac

```bash
chmod +x start.sh
./start.sh
```

Hoặc chạy từng bước:

```bash
# Backend
cd backend
npm install
npm run init-db
npm run dev

# Frontend (terminal mới)
cd frontend
npm install
npm run dev
```

## Truy cập

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000

## Đăng nhập lần đầu

- **Số điện thoại**: `admin`
- **Mật khẩu**: `admin123`

## Cấu hình

### Backend

Tạo file `.env` trong thư mục `backend/` (hoặc copy từ `.env.example`):

```
PORT=5000
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRE=7d
NODE_ENV=development

# MySQL Database Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your-mysql-password
MYSQL_DATABASE=laundry66
```

### Database

1. **Cài đặt MySQL**: Đảm bảo MySQL đã được cài đặt và đang chạy.

2. **Tạo database** (tùy chọn): Database sẽ được tạo tự động nếu chưa tồn tại khi server khởi động. Hoặc bạn có thể tạo thủ công:
   ```sql
   CREATE DATABASE laundry66 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. **Cấu hình kết nối**: Cập nhật thông tin MySQL trong file `.env`:
   - `MYSQL_HOST`: Địa chỉ MySQL server (mặc định: localhost)
   - `MYSQL_PORT`: Port MySQL (mặc định: 3306)
   - `MYSQL_USER`: Tên người dùng MySQL
   - `MYSQL_PASSWORD`: Mật khẩu MySQL
   - `MYSQL_DATABASE`: Tên database (mặc định: laundry66)

4. **Khởi tạo database**: Schema và dữ liệu mẫu sẽ được tạo tự động khi server khởi động lần đầu, hoặc chạy:
   ```bash
   npm run init-db
   ```

## Khắc phục sự cố

### Lỗi "Cannot find module"

Chạy lại `npm install` trong thư mục backend và frontend.

### Lỗi database

1. **Lỗi kết nối MySQL**: Kiểm tra MySQL đã chạy chưa và thông tin trong `.env` có đúng không.
2. **Lỗi quyền truy cập**: Đảm bảo MySQL user có quyền tạo database và table.
3. **Lỗi schema**: Xóa database và tạo lại:
   ```sql
   DROP DATABASE IF EXISTS laundry66;
   CREATE DATABASE laundry66 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
   Sau đó chạy lại `npm run init-db`.

### Port đã được sử dụng

Thay đổi PORT trong file `.env` của backend hoặc trong `vite.config.js` của frontend.

## Tính năng chính

✅ Đăng nhập/Phân quyền
✅ Quản lý nhân viên (Admin)
✅ Quản lý sản phẩm & bảng giá (Admin)
✅ Quản lý đơn hàng (Tạo, cập nhật trạng thái)
✅ Quản lý khách hàng
✅ Check-in/Check-out giờ làm
✅ Báo cáo & thống kê (Admin)
✅ Export CSV
✅ Audit log

## Hỗ trợ

Nếu gặp vấn đề, vui lòng kiểm tra:
1. Node.js version (cần 16+)
2. Port 3000 và 5000 có đang được sử dụng không
3. Đã cài đặt đầy đủ dependencies chưa

