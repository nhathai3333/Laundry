# Hướng dẫn Bảo mật Đăng nhập

## Các tính năng bảo mật đã được thêm

### 1. Rate Limiting (Giới hạn số lần thử)
- **Giới hạn:** 5 lần đăng nhập trong 15 phút từ cùng một IP
- **Hành động:** Sau 5 lần thử, phải đợi 15 phút mới được thử lại
- **Bảo vệ:** Chống brute force attack từ cùng một IP

### 2. Account Lockout (Khóa tài khoản)
- **Số lần thử:** 5 lần đăng nhập sai
- **Thời gian khóa:** 30 phút
- **Tự động mở khóa:** Sau 30 phút, tài khoản tự động được mở khóa
- **Bảo vệ:** Chống brute force attack trên từng tài khoản cụ thể

### 3. Login Attempt Logging (Ghi log đăng nhập)
- **Ghi lại:** Tất cả các lần đăng nhập (thành công và thất bại)
- **Thông tin:** Phone, IP address, success/failure, lý do thất bại, user agent
- **Mục đích:** Theo dõi và phân tích các cuộc tấn công

### 4. Timing Attack Protection
- **Delay:** Thêm delay 1 giây khi đăng nhập sai
- **Bảo vệ:** Ngăn chặn timing attack để đoán username

### 5. Security Best Practices
- **Không tiết lộ:** Không cho biết user có tồn tại hay không khi đăng nhập sai
- **Thông báo rõ ràng:** Thông báo số lần thử còn lại
- **Tự động reset:** Tự động reset failed attempts khi đăng nhập thành công

---

## Cài đặt

### Bước 1: Chạy migration script

```bash
cd backend
npm run migrate-login-security
```

Script này sẽ:
- Tạo table `login_attempts` để ghi log
- Thêm các cột bảo mật vào table `users`:
  - `locked_until`: Thời gian khóa tài khoản
  - `failed_login_attempts`: Số lần đăng nhập sai
  - `last_failed_login`: Thời gian đăng nhập sai cuối cùng

### Bước 2: Restart backend server

```bash
npm run dev
```

---

## Cách hoạt động

### Khi đăng nhập sai:

1. **Lần 1-4:** 
   - Thông báo: "Sai mật khẩu. Còn X lần thử."
   - Ghi log vào `login_attempts`
   - Tăng `failed_login_attempts` trong `users`

2. **Lần 5:**
   - Khóa tài khoản trong 30 phút
   - Thông báo: "Tài khoản đã bị khóa do quá nhiều lần đăng nhập sai. Vui lòng thử lại sau X phút."
   - Ghi log vào `login_attempts`

### Khi đăng nhập thành công:

1. Reset `failed_login_attempts` về 0
2. Xóa `locked_until`
3. Reset rate limit cho IP
4. Ghi log thành công vào `login_attempts`

### Khi vượt quá rate limit (từ IP):

1. Thông báo: "Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau X phút."
2. Phải đợi 15 phút mới được thử lại từ IP đó

---

## Xem log đăng nhập

### Query login attempts:

```sql
-- Xem tất cả các lần đăng nhập thất bại
SELECT * FROM login_attempts 
WHERE success = FALSE 
ORDER BY created_at DESC 
LIMIT 50;

-- Xem các lần đăng nhập từ một IP cụ thể
SELECT * FROM login_attempts 
WHERE ip_address = '192.168.1.100' 
ORDER BY created_at DESC;

-- Xem các tài khoản bị khóa
SELECT id, name, phone, failed_login_attempts, locked_until 
FROM users 
WHERE locked_until IS NOT NULL AND locked_until > NOW();

-- Xem số lần đăng nhập thất bại theo phone
SELECT phone, COUNT(*) as failed_attempts 
FROM login_attempts 
WHERE success = FALSE 
  AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY phone 
ORDER BY failed_attempts DESC;
```

---

## Cấu hình

### Thay đổi số lần thử tối đa:

Sửa trong `backend/routes/auth.js`:
```javascript
const { currentAttempts, isLocked, lockedUntil } = await incrementFailedAttempts(user.id, 5, 30);
//                                                                    ↑      ↑
//                                                          max attempts  lockout minutes
```

### Thay đổi rate limit:

Sửa trong `backend/routes/auth.js`:
```javascript
router.post('/login', loginRateLimiter(5, 15 * 60 * 1000), async (req, res) => {
//                              ↑              ↑
//                        max attempts    window (ms)
```

---

## Monitoring và Alerting

### Tạo view để monitor:

```sql
CREATE OR REPLACE VIEW login_security_summary AS
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN success = TRUE THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN success = FALSE THEN 1 ELSE 0 END) as failed,
  COUNT(DISTINCT ip_address) as unique_ips,
  COUNT(DISTINCT phone) as unique_users
FROM login_attempts
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Query để cảnh báo:

```sql
-- Cảnh báo khi có nhiều lần đăng nhập thất bại từ một IP
SELECT ip_address, COUNT(*) as attempts
FROM login_attempts
WHERE success = FALSE 
  AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY ip_address
HAVING attempts >= 10
ORDER BY attempts DESC;

-- Cảnh báo khi có tài khoản bị khóa
SELECT id, name, phone, failed_login_attempts, locked_until
FROM users
WHERE locked_until IS NOT NULL 
  AND locked_until > NOW();
```

---

## Best Practices

1. **Không chia sẻ thông tin đăng nhập:** 
   - Mỗi user nên có tài khoản riêng
   - Không dùng chung password

2. **Sử dụng mật khẩu mạnh:**
   - Tối thiểu 8 ký tự
   - Kết hợp chữ hoa, chữ thường, số, ký tự đặc biệt
   - Không dùng thông tin cá nhân

3. **Theo dõi log định kỳ:**
   - Kiểm tra `login_attempts` hàng ngày
   - Phát hiện các IP đáng ngờ
   - Xử lý các tài khoản bị khóa thường xuyên

4. **Backup database:**
   - Backup định kỳ table `login_attempts`
   - Có thể xóa log cũ sau 90 ngày để tiết kiệm dung lượng

---

## Troubleshooting

### Tài khoản bị khóa nhưng cần mở ngay:

```sql
-- Mở khóa tài khoản ngay lập tức
UPDATE users 
SET locked_until = NULL,
    failed_login_attempts = 0,
    last_failed_login = NULL
WHERE phone = 'your_phone_number';
```

### Reset rate limit cho một IP:

Rate limit được lưu trong memory, sẽ tự động reset sau 15 phút. Nếu cần reset ngay, restart backend server.

### Xóa log cũ:

```sql
-- Xóa log cũ hơn 90 ngày
DELETE FROM login_attempts 
WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
```

---

## Tương lai (Có thể thêm)

- [ ] Two-Factor Authentication (2FA)
- [ ] CAPTCHA sau 3 lần thử sai
- [ ] Email/SMS notification khi tài khoản bị khóa
- [ ] IP whitelist/blacklist
- [ ] Device fingerprinting
- [ ] Redis-based rate limiting (cho production scale)
- [ ] Password strength meter
- [ ] Password expiration policy
