import bcrypt from 'bcryptjs';
import { queryOne } from '../database/db.js';
import { MAX_ORDER_CODE_GENERATION_ATTEMPTS } from './constants.js';

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

/**
 * Generate unique order code with retry logic to prevent collisions
 * @returns {Promise<string>} Unique order code
 */
export const generateOrderCode = async () => {
  let attempts = 0;
  
  while (attempts < MAX_ORDER_CODE_GENERATION_ATTEMPTS) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const code = `DH${year}${month}${day}${random}`;
    
    // Check if code exists
    try {
      const existing = await queryOne('SELECT id FROM orders WHERE code = ?', [code]);
      if (!existing) {
        return code;
      }
    } catch (error) {
      // If query fails, assume code is available (fail-safe)
      console.warn('Error checking order code uniqueness:', error.message);
      return code;
    }
    
    attempts++;
  }
  
  throw new Error('Không thể tạo mã đơn hàng duy nhất sau nhiều lần thử');
};

/**
 * Tính giờ làm từ check-in đến check-out.
 * Toàn bộ giờ làm đều tính là giờ thường (không tách tăng ca).
 */
export const calculateHours = (checkIn, checkOut) => {
  if (!checkOut) return { regular: 0, overtime: 0 };
  
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diffMs = end - start;
  const diffHours = diffMs / (1000 * 60 * 60);
  const totalHours = Math.max(0, diffHours);
  
  return {
    regular: Math.round(totalHours * 100) / 100,
    overtime: 0
  };
};

