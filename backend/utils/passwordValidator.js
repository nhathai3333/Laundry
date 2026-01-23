/**
 * Password strength validator
 * Enforces strong password requirements
 */

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export const validatePasswordStrength = (password) => {
  const errors = [];

  if (!password) {
    return { valid: false, errors: ['Mật khẩu là bắt buộc'] };
  }

  // Minimum length
  if (password.length < 8) {
    errors.push('Mật khẩu phải có ít nhất 8 ký tự');
  }

  // Maximum length (prevent DoS)
  if (password.length > 128) {
    errors.push('Mật khẩu không được vượt quá 128 ký tự');
  }

  // At least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    errors.push('Mật khẩu phải có ít nhất 1 chữ hoa');
  }

  // At least one lowercase letter
  if (!/[a-z]/.test(password)) {
    errors.push('Mật khẩu phải có ít nhất 1 chữ thường');
  }

  // At least one number
  if (!/[0-9]/.test(password)) {
    errors.push('Mật khẩu phải có ít nhất 1 số');
  }

  // At least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Mật khẩu phải có ít nhất 1 ký tự đặc biệt (!@#$%^&*...)');
  }

  // Check for common weak passwords
  const commonPasswords = [
    'password', '12345678', 'qwerty', 'abc123', 'password123',
    'admin123', '123456789', 'welcome', 'monkey', '1234567'
  ];
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    errors.push('Mật khẩu quá phổ biến, vui lòng chọn mật khẩu khác');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : [],
    strength: calculatePasswordStrength(password)
  };
};

/**
 * Calculate password strength score (0-100)
 * @param {string} password 
 * @returns {Object} { score: number, level: string }
 */
const calculatePasswordStrength = (password) => {
  let score = 0;

  // Length score (max 25 points)
  if (password.length >= 8) score += 10;
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 5;

  // Character variety (max 50 points)
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/[0-9]/.test(password)) score += 10;
  if (/[^a-zA-Z0-9]/.test(password)) score += 20;

  // Complexity (max 25 points)
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= password.length * 0.5) score += 15;
  if (uniqueChars >= password.length * 0.7) score += 10;

  // Determine level
  let level = 'weak';
  if (score >= 70) level = 'strong';
  else if (score >= 50) level = 'medium';
  else if (score >= 30) level = 'fair';

  return { score: Math.min(100, score), level };
};

/**
 * Check if password contains user information (name, phone, etc.)
 * @param {string} password 
 * @param {Object} userInfo - { name, phone, email }
 * @returns {boolean}
 */
export const containsUserInfo = (password, userInfo = {}) => {
  const passwordLower = password.toLowerCase();
  
  if (userInfo.name) {
    const nameParts = userInfo.name.toLowerCase().split(' ').filter(p => p.length > 2);
    if (nameParts.some(part => passwordLower.includes(part))) {
      return true;
    }
  }
  
  if (userInfo.phone) {
    const phoneDigits = userInfo.phone.replace(/\D/g, '');
    if (phoneDigits.length >= 4 && passwordLower.includes(phoneDigits.slice(-4))) {
      return true;
    }
  }
  
  return false;
};
