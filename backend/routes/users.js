import express from 'express';
import { query, queryOne, execute } from '../database/db.js';
import { hashPassword } from '../utils/helpers.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';
import { validatePositiveNumber, sanitizeString, validateRequiredString } from '../utils/validators.js';
import { validatePasswordStrength, containsUserInfo } from '../utils/passwordValidator.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all users (Admin only)
router.get('/', authorize('admin'), async (req, res) => {
  try {
    let users;
    try {
      if (req.user.role === 'root') {
        users = await query(`
          SELECT u.id, u.name, u.phone, u.role, u.status, u.started_at, u.hourly_rate, u.shift_rate, 
                 u.created_at, u.updated_at, u.store_id, s.name as store_name,
                 u.subscription_expires_at, u.subscription_package
          FROM users u
          LEFT JOIN stores s ON u.store_id = s.id
          WHERE u.role IN ('admin', 'root')
          ORDER BY u.created_at DESC
        `);
      } else if (req.user.role === 'admin' && req.user.role !== 'root') {
        // Admin can only see users from stores in their chain (stores with admin_id = user.id)
        // Exclude admin/root users - only show employer users (tài khoản tiệm)
        users = await query(`
          SELECT u.id, u.name, u.phone, u.role, u.status, u.started_at, u.hourly_rate, u.shift_rate, 
                 u.created_at, u.updated_at, u.store_id, s.name as store_name,
                 u.subscription_expires_at, u.subscription_package
          FROM users u
          LEFT JOIN stores s ON u.store_id = s.id
          WHERE s.admin_id = ?
            AND u.role = 'employer'
          ORDER BY u.created_at DESC
        `, [req.user.id]);
      } else {
        // Admin without proper setup (should not happen, but handle gracefully)
        users = [];
      }
    } catch (error) {
      // If stores table doesn't exist or error occurs, handle gracefully
      // Error log removed for security
      if (req.user.role === 'root') {
        // Root can only see admin accounts even if stores table has issues
        users = await query(`
          SELECT u.id, u.name, u.phone, u.role, u.status, u.started_at, u.hourly_rate, u.shift_rate, 
                 u.created_at, u.updated_at, u.store_id, NULL as store_name,
                 u.subscription_expires_at, u.subscription_package
          FROM users u
          WHERE u.role IN ('admin', 'root')
          ORDER BY u.created_at DESC
        `);
      } else if (req.user.role === 'admin' && req.user.role !== 'root') {
        // Admin: return empty array if we can't verify store ownership
        // This is safer than showing all users
        users = [];
      } else {
        // For other roles, return empty array
        users = [];
      }
    }

    res.json({ data: users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single user
router.get('/:id', authorize('admin'), async (req, res) => {
  try {
    const user = await queryOne(`
      SELECT id, name, phone, role, status, started_at, hourly_rate, shift_rate, created_at, updated_at
      FROM users
      WHERE id = ?
    `, [req.params.id]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ data: user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create user (Root or Admin)
router.post('/', authorize('admin'), auditLog('create', 'user', (req) => req.body.id || null), async (req, res) => {
  try {
    const { name, phone, password, role, started_at, status, hourly_rate, shift_rate, store_id } = req.body;

    if (!name || !password || !role) {
      return res.status(400).json({ error: 'Name, password, and role are required' });
    }

    // Phone validation - không bắt buộc cho admin, chỉ check duplicate nếu có
    let phoneValue = phone ? phone.trim() : '';
    
    // Nếu role là admin, phone có thể để trống
    if (role !== 'admin' && !phoneValue) {
      return res.status(400).json({ error: 'Số điện thoại là bắt buộc' });
    }
    
    // Check duplicate phone chỉ khi phone được cung cấp
    if (phoneValue) {
      const existing = await queryOne('SELECT id, name, role FROM users WHERE phone = ?', [phoneValue]);
      if (existing) {
        return res.status(400).json({ 
          error: `Số điện thoại "${phoneValue}" đã được sử dụng bởi ${existing.name} (${existing.role})` 
        });
      }
    }

    // Only root can create admin users
    if (role === 'admin' && req.user.role !== 'root') {
      return res.status(403).json({ error: 'Chỉ root admin mới có thể tạo admin mới' });
    }

    // Only root can create root users
    if (role === 'root' && req.user.role !== 'root') {
      return res.status(403).json({ error: 'Chỉ root admin mới có thể tạo root admin' });
    }

    // Store ID handling
    let storeId = null;
    if (role === 'employer') {
      // Employer requires store_id
      if (!store_id) {
        return res.status(400).json({ error: 'Store ID is required. Please select a store.' });
      }

      // Verify store exists in stores table
      const storeExists = await queryOne('SELECT id FROM stores WHERE id = ?', [store_id]);
      if (!storeExists) {
        return res.status(400).json({ error: 'Selected store does not exist' });
      }

      storeId = parseInt(store_id);
    } else if (role === 'admin') {
      // Admin thường không có store_id
      // Admin chỉ được quản lý bởi root admin, không xuất hiện trong danh sách stores/users/employees
      storeId = null;
    }

    const password_hash = await hashPassword(password);

    // Admin mới tạo bởi root sẽ có status 'pending', cần được root phê duyệt
    // Root và employer tạo bởi admin sẽ có status 'active'
    let userStatus = status || 'active';
    if (role === 'admin' && req.user.role === 'root') {
      userStatus = 'pending'; // Admin mới tạo bởi root sẽ pending
    }

    // Password validation removed - no requirements

    const nameSanitized = sanitizeString(name);
    if (!nameSanitized.valid || nameSanitized.value === '') {
      return res.status(400).json({ error: 'Tên người dùng không được để trống' });
    }

    // Validate hourly_rate and shift_rate if provided
    let hourlyRateValue = null;
    if (hourly_rate !== undefined && hourly_rate !== null && hourly_rate !== '') {
      const rateValidation = validatePositiveNumber(hourly_rate, true);
      if (!rateValidation.valid) {
        return res.status(400).json({ error: `Mức lương theo giờ: ${rateValidation.error}` });
      }
      hourlyRateValue = rateValidation.value;
    }

    let shiftRateValue = null;
    if (shift_rate !== undefined && shift_rate !== null && shift_rate !== '') {
      const rateValidation = validatePositiveNumber(shift_rate, true);
      if (!rateValidation.valid) {
        return res.status(400).json({ error: `Mức lương theo ca: ${rateValidation.error}` });
      }
      shiftRateValue = rateValidation.value;
    }

    const result = await execute(`
      INSERT INTO users (name, phone, password_hash, role, started_at, status, hourly_rate, shift_rate, store_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      nameSanitized.value,
      phoneValue || null,
      password_hash,
      role,
      started_at || null,
      userStatus,
      hourlyRateValue,
      shiftRateValue,
      storeId
    ]);

    const newUser = await queryOne(`
      SELECT id, name, phone, role, status, started_at, hourly_rate, shift_rate, created_at, updated_at
      FROM users
      WHERE id = ?
    `, [result.insertId]);

    res.status(201).json({ data: newUser });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user (Admin only)
router.patch('/:id', authorize('admin'), auditLog('update', 'user'), async (req, res) => {
  try {
    const { name, phone, password, role, started_at, status, hourly_rate, shift_rate, subscription_package, subscription_expires_at } = req.body;

    // Get old data for audit
    const oldUser = await queryOne('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!oldUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only root can update admin users
    if (oldUser.role === 'admin' && req.user.role !== 'root') {
      return res.status(403).json({ error: 'Chỉ root admin mới có thể cập nhật thông tin admin' });
    }

    // Check if phone exists (if changed)
    // Không bắt buộc phone cho admin, chỉ check duplicate nếu có
    if (phone !== undefined) {
      const trimmedPhone = phone ? phone.trim() : '';
      
      // Nếu role là admin, phone có thể để trống
      if (oldUser.role !== 'admin' && !trimmedPhone) {
        return res.status(400).json({ error: 'Số điện thoại là bắt buộc' });
      }
      
      // Check duplicate chỉ khi phone được cung cấp và khác với phone hiện tại
      if (trimmedPhone && trimmedPhone !== oldUser.phone) {
        const existing = await queryOne('SELECT id, name, role FROM users WHERE phone = ?', [trimmedPhone]);
        if (existing) {
          return res.status(400).json({ 
            error: `Số điện thoại "${trimmedPhone}" đã được sử dụng bởi ${existing.name} (${existing.role})` 
          });
        }
      }
    }

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
    if (phone !== undefined) { 
      const trimmedPhone = phone ? phone.trim() : '';
      
      // Nếu role là admin, phone có thể để trống
      if (oldUser.role !== 'admin' && !trimmedPhone) {
        return res.status(400).json({ error: 'Số điện thoại không được để trống' });
      }
      
      updates.push('phone = ?'); 
      values.push(trimmedPhone || null); 
    }
    if (role !== undefined) { updates.push('role = ?'); values.push(role); }
    if (started_at !== undefined) { 
      updates.push('started_at = ?'); 
      // Convert empty string to null for datetime field
      values.push(started_at === '' || started_at === null ? null : started_at); 
    }
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    if (hourly_rate !== undefined) {
      if (hourly_rate === '' || hourly_rate === null) {
        updates.push('hourly_rate = ?');
        values.push(null);
      } else {
        const rateValidation = validatePositiveNumber(hourly_rate, true); // Allow zero
        if (!rateValidation.valid) {
          return res.status(400).json({ error: `Mức lương theo giờ: ${rateValidation.error}` });
        }
        updates.push('hourly_rate = ?');
        values.push(rateValidation.value);
      }
    }
    
    if (shift_rate !== undefined) {
      if (shift_rate === '' || shift_rate === null) {
        updates.push('shift_rate = ?');
        values.push(null);
      } else {
        const rateValidation = validatePositiveNumber(shift_rate, true); // Allow zero
        if (!rateValidation.valid) {
          return res.status(400).json({ error: `Mức lương theo ca: ${rateValidation.error}` });
        }
        updates.push('shift_rate = ?');
        values.push(rateValidation.value);
      }
    }
    if (password) {
      // Password validation removed - no requirements
      const password_hash = await hashPassword(password);
      updates.push('password_hash = ?');
      values.push(password_hash);
    }
    
    // Handle subscription update (only for admin users, only root can update)
    if (subscription_package !== undefined && oldUser.role === 'admin' && req.user.role === 'root') {
      updates.push('subscription_package = ?');
      values.push(subscription_package || null);
      
      // If subscription_expires_at is provided, use it; otherwise calculate from package
      if (subscription_expires_at) {
        updates.push('subscription_expires_at = ?');
        values.push(subscription_expires_at);
      } else if (subscription_package) {
        // Calculate expiration date based on package
        const now = new Date();
        let expirationDate = new Date();
        
        switch (subscription_package) {
          case '3months':
            expirationDate.setMonth(now.getMonth() + 3);
            break;
          case '6months':
            expirationDate.setMonth(now.getMonth() + 6);
            break;
          case '1year':
            expirationDate.setFullYear(now.getFullYear() + 1);
            break;
          default:
            expirationDate = null;
        }
        
        if (expirationDate) {
          const expirationDateStr = expirationDate.toISOString().slice(0, 19).replace('T', ' ');
          updates.push('subscription_expires_at = ?');
          values.push(expirationDateStr);
        } else {
          updates.push('subscription_expires_at = ?');
          values.push(null);
        }
      } else {
        // If package is removed, remove expiration date too
        updates.push('subscription_expires_at = ?');
        values.push(null);
      }
    } else if (subscription_expires_at !== undefined && oldUser.role === 'admin' && req.user.role === 'root') {
      // Allow direct update of expiration date
      updates.push('subscription_expires_at = ?');
      values.push(subscription_expires_at || null);
    }

    // MySQL handles updated_at automatically with ON UPDATE CURRENT_TIMESTAMP
    values.push(req.params.id);

    await execute(`
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = ?
    `, values);

    const updatedUser = await queryOne(`
      SELECT id, name, phone, role, status, started_at, hourly_rate, shift_rate, 
             subscription_package, subscription_expires_at, created_at, updated_at
      FROM users
      WHERE id = ?
    `, [req.params.id]);

    res.json({ data: updatedUser });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user (Admin only)
router.delete('/:id', authorize('admin'), auditLog('delete', 'user'), async (req, res) => {
  try {
    const user = await queryOne('SELECT id, role FROM users WHERE id = ?', [req.params.id]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only root can delete admin users
    if (user.role === 'admin' && req.user.role !== 'root') {
      return res.status(403).json({ error: 'Chỉ root admin mới có thể xóa admin' });
    }

    // Don't allow deleting yourself
    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    // Delete related records first to avoid foreign key constraints
    try {
      await execute('DELETE FROM employees WHERE store_id = ?', [user.id]);
    } catch (error) {
      // Warning log removed for security
    }

    try {
      await execute('DELETE FROM timesheets WHERE user_id = ?', [user.id]);
    } catch (error) {
      // Warning log removed for security
    }

    try {
      await execute('DELETE FROM audit_logs WHERE user_id = ?', [user.id]);
    } catch (error) {
      // Warning log removed for security
    }

    // Delete user
    await execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại.' });
  }
});

// Approve pending admin (Root only)
router.post('/:id/approve', authorize('admin'), auditLog('approve', 'user'), async (req, res) => {
  try {
    // Only root can approve admins
    if (req.user.role !== 'root') {
      return res.status(403).json({ error: 'Chỉ root admin mới có thể phê duyệt admin' });
    }

    const { package: packageType } = req.body; // '3months', '6months', '1year'

    const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'admin') {
      return res.status(400).json({ error: 'Chỉ có thể phê duyệt admin' });
    }

    if (user.status !== 'pending') {
      return res.status(400).json({ error: 'User không ở trạng thái pending' });
    }

    // Validate package type
    const validPackages = ['3months', '6months', '1year'];
    if (!packageType || !validPackages.includes(packageType)) {
      return res.status(400).json({ error: 'Vui lòng chọn gói: 3months, 6months, hoặc 1year' });
    }

    // Calculate expiration date based on package
    const now = new Date();
    let expirationDate = new Date();
    
    switch (packageType) {
      case '3months':
        expirationDate.setMonth(now.getMonth() + 3);
        break;
      case '6months':
        expirationDate.setMonth(now.getMonth() + 6);
        break;
      case '1year':
        expirationDate.setFullYear(now.getFullYear() + 1);
        break;
    }

    // Format expiration date for MySQL (YYYY-MM-DD HH:MM:SS)
    const expirationDateStr = expirationDate.toISOString().slice(0, 19).replace('T', ' ');

    // Update admin user with subscription only
    // Admin thường không tự động có store/employer account/employee
    // Admin chỉ được quản lý bởi root admin, không xuất hiện trong danh sách stores/users/employees
    try {
      const updateResult = await execute(`
        UPDATE users 
        SET status = ?, subscription_expires_at = ?, subscription_package = ?
        WHERE id = ?
      `, ['active', expirationDateStr, packageType, req.params.id]);
      
      // Verify the update was successful
      if (updateResult.affectedRows === 0) {
        console.error(`[Approve] No rows updated for admin ${req.params.id}`);
        return res.status(500).json({ error: 'Không thể cập nhật thông tin admin. Vui lòng thử lại.' });
      }
      
      // Debug log removed for security
    } catch (error) {
      console.error('[Approve] Error updating admin user:', error);
      return res.status(500).json({ error: 'Lỗi khi cập nhật thông tin admin. Vui lòng thử lại.' });
    }

    const updated = await queryOne(`
      SELECT id, name, phone, role, status, started_at, hourly_rate, shift_rate, 
             subscription_expires_at, subscription_package, store_id, created_at, updated_at
      FROM users
      WHERE id = ?
    `, [req.params.id]);

    const packageNames = {
      '3months': '3 tháng',
      '6months': '6 tháng',
      '1year': '1 năm'
    };

    const message = `Admin đã được phê duyệt thành công với gói ${packageNames[packageType]}. Hết hạn: ${new Date(expirationDateStr).toLocaleDateString('vi-VN')}`;

    res.json({ 
      data: updated, 
      message: message
    });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reject pending admin (Root only)
router.post('/:id/reject', authorize('admin'), auditLog('reject', 'user'), async (req, res) => {
  try {
    // Only root can reject admins
    if (req.user.role !== 'root') {
      return res.status(403).json({ error: 'Chỉ root admin mới có thể từ chối admin' });
    }

    const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'admin') {
      return res.status(400).json({ error: 'Chỉ có thể từ chối admin' });
    }

    if (user.status !== 'pending') {
      return res.status(400).json({ error: 'User không ở trạng thái pending' });
    }

    // Update status to inactive (rejected)
    await execute('UPDATE users SET status = ? WHERE id = ?', ['inactive', req.params.id]);

    res.json({ message: 'Admin đã bị từ chối' });
  } catch (error) {
    console.error('Reject user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
