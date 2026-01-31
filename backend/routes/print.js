import express from 'express';
import { query, queryOne, execute } from '../database/db.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/auth.js';
import { validateId } from '../utils/validators.js';
import { isValidIP } from '../utils/ipValidator.js';
import net from 'net';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get bill data (ESC/POS commands) for Bluetooth printing
router.get('/bill-data/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    // Validate orderId
    const orderIdValidation = validateId(orderId);
    if (!orderIdValidation.valid) {
      return res.status(400).json({ error: 'Order ID không hợp lệ' });
    }

    // Get order details with promotion
    const order = await queryOne(`
      SELECT o.*, 
        c.name as customer_name, 
        c.phone as customer_phone,
        p.name as promotion_name,
        p.discount_type as promotion_discount_type,
        p.discount_value as promotion_discount_value
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN promotions p ON o.promotion_id = p.id
      WHERE o.id = ?
    `, [orderId]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check permission (same as print route)
    if (req.user.role === 'employer') {
      const user = await queryOne('SELECT store_id FROM users WHERE id = ? AND role = ?', [req.user.id, 'employer']);
      const userStoreId = user?.store_id;
      if (!userStoreId) {
        return res.status(403).json({ error: 'Tài khoản không có cửa hàng được gán' });
      }
      if (order.store_id !== userStoreId) {
        return res.status(403).json({ error: 'Bạn chỉ có thể in đơn hàng của cửa hàng mình' });
      }
    } else if (req.user.role === 'admin' && req.user.role !== 'root') {
      if (order.store_id) {
        const store = await queryOne('SELECT admin_id FROM stores WHERE id = ?', [order.store_id]);
        if (!store || store.admin_id !== req.user.id) {
          return res.status(403).json({ error: 'Bạn chỉ có thể in đơn hàng của cửa hàng trong chuỗi của mình' });
        }
      } else {
        // Đơn cũ không có store_id: kiểm tra assigned_to/created_by thuộc chuỗi của admin
        const userId = order.assigned_to || order.created_by;
        if (userId) {
          const userStore = await queryOne('SELECT store_id FROM users WHERE id = ?', [userId]);
          if (userStore?.store_id) {
            const store = await queryOne('SELECT admin_id FROM stores WHERE id = ?', [userStore.store_id]);
            if (!store || store.admin_id !== req.user.id) {
              return res.status(403).json({ error: 'Bạn chỉ có thể in đơn hàng của cửa hàng trong chuỗi của mình' });
            }
          } else {
            return res.status(403).json({ error: 'Bạn chỉ có thể in đơn hàng của cửa hàng trong chuỗi của mình' });
          }
        } else {
          return res.status(403).json({ error: 'Bạn chỉ có thể in đơn hàng của cửa hàng trong chuỗi của mình' });
        }
      }
    } else if (req.user.role === 'root') {
      return res.status(403).json({ error: 'Root admin không thể in đơn hàng' });
    }

    // Get order items
    const items = await query(`
      SELECT oi.*, p.name as product_name, p.unit as product_unit
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [orderId]);

    // Get store_id for settings lookup
    let storeId = order.store_id || null;
    if (order.assigned_to) {
      const assignedUser = await queryOne('SELECT store_id FROM users WHERE id = ?', [order.assigned_to]);
      if (assignedUser && assignedUser.store_id) {
        storeId = assignedUser.store_id;
      }
    }
    if (!storeId && order.created_by) {
      const createdUser = await queryOne('SELECT store_id FROM users WHERE id = ?', [order.created_by]);
      if (createdUser && createdUser.store_id) {
        storeId = createdUser.store_id;
      }
    }
    
    // Get printer settings
    let settings = await query(`SELECT * FROM settings WHERE store_id = ?`, [storeId]);
    if (settings.length === 0) {
      settings = await query(`SELECT * FROM settings WHERE store_id IS NULL`);
    }
    
    const settingsObj = {};
    settingsObj.paper_size = '80mm';
    settings.forEach((s) => {
      settingsObj[s.key] = s.value;
    });

    const paperSize = settingsObj.paper_size || '80mm';
    
    // Generate ESC/POS commands for bill
    const billData = generateBill(order, items, paperSize, settingsObj);
    
    // Return as base64 for easy transfer
    res.json({
      success: true,
      data: billData.toString('base64'),
      paperSize: paperSize
    });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi khi tạo bill data' });
  }
});

// Print bill (Admin and Employer)
router.post('/bill/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    // Validate orderId
    const orderIdValidation = validateId(orderId);
    if (!orderIdValidation.valid) {
      return res.status(400).json({ error: 'Order ID không hợp lệ' });
    }

    // Get order details with promotion
    const order = await queryOne(`
      SELECT o.*, 
        c.name as customer_name, 
        c.phone as customer_phone,
        p.name as promotion_name,
        p.discount_type as promotion_discount_type,
        p.discount_value as promotion_discount_value
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN promotions p ON o.promotion_id = p.id
      WHERE o.id = ?
    `, [orderId]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check permission: employer can only print orders from their store
    if (req.user.role === 'employer') {
      // Get user's actual store_id from database
      const user = await queryOne('SELECT store_id FROM users WHERE id = ? AND role = ?', [req.user.id, 'employer']);
      const userStoreId = user?.store_id;
      
      if (!userStoreId) {
        return res.status(403).json({ error: 'Tài khoản không có cửa hàng được gán' });
      }

      // Check if order belongs to user's store
      if (order.store_id !== userStoreId) {
        return res.status(403).json({ error: 'Bạn chỉ có thể in đơn hàng của cửa hàng mình' });
      }
    } else if (req.user.role === 'admin' && req.user.role !== 'root') {
      // Admin can only print orders from their store chain
      if (order.store_id) {
        const store = await queryOne('SELECT admin_id FROM stores WHERE id = ?', [order.store_id]);
        if (!store || store.admin_id !== req.user.id) {
          return res.status(403).json({ error: 'Bạn chỉ có thể in đơn hàng của cửa hàng trong chuỗi của mình' });
        }
      } else {
        const userId = order.assigned_to || order.created_by;
        if (userId) {
          const userStore = await queryOne('SELECT store_id FROM users WHERE id = ?', [userId]);
          if (userStore?.store_id) {
            const store = await queryOne('SELECT admin_id FROM stores WHERE id = ?', [userStore.store_id]);
            if (!store || store.admin_id !== req.user.id) {
              return res.status(403).json({ error: 'Bạn chỉ có thể in đơn hàng của cửa hàng trong chuỗi của mình' });
            }
          } else {
            return res.status(403).json({ error: 'Bạn chỉ có thể in đơn hàng của cửa hàng trong chuỗi của mình' });
          }
        } else {
          return res.status(403).json({ error: 'Bạn chỉ có thể in đơn hàng của cửa hàng trong chuỗi của mình' });
        }
      }
    } else if (req.user.role === 'root') {
      // Root admin is software vendor, not store operator - cannot print orders
      return res.status(403).json({ error: 'Root admin không thể in đơn hàng' });
    }

    // Get order items
    const items = await query(`
      SELECT oi.*, p.name as product_name, p.unit as product_unit
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [orderId]);

    // Get store_id for settings lookup
    // Prefer orders.store_id (stores.id). Fallback to assigned_to/created_by store_id for legacy rows.
    let storeId = order.store_id || null;
    if (order.assigned_to) {
      const assignedUser = await queryOne('SELECT store_id FROM users WHERE id = ?', [order.assigned_to]);
      if (assignedUser && assignedUser.store_id) {
        storeId = assignedUser.store_id;
      }
    }
    if (!storeId && order.created_by) {
      const createdUser = await queryOne('SELECT store_id FROM users WHERE id = ?', [order.created_by]);
      if (createdUser && createdUser.store_id) {
        storeId = createdUser.store_id;
      }
    }
    
    // Get printer settings for this store (fallback to global if no store settings)
    // First try store-specific settings
    let settings = await query(`
      SELECT * FROM settings 
      WHERE store_id = ?
    `, [storeId]);
    
    // If no store-specific settings, try global settings (store_id IS NULL)
    if (settings.length === 0) {
      settings = await query(`
        SELECT * FROM settings 
        WHERE store_id IS NULL
      `);
    }
    
    const settingsObj = {};
    // First, set defaults
    settingsObj.printer_ip = '192.168.1.100';
    settingsObj.printer_port = '9100';
    settingsObj.paper_size = '80mm';
    
    // Then override with settings found
    settings.forEach((s) => {
      settingsObj[s.key] = s.value;
    });

    const printerIP = settingsObj.printer_ip || '192.168.1.100';
    const ipValidation = isValidIP(printerIP);
    if (!ipValidation.valid) {
      return res.status(400).json({ error: ipValidation.error });
    }
    
    // Validate printer port
    const portNum = parseInt(settingsObj.printer_port || '9100');
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return res.status(400).json({ error: 'Port máy in không hợp lệ. Vui lòng kiểm tra Settings.' });
    }
    
    const printerPort = portNum;
    const paperSize = settingsObj.paper_size || '80mm';
    
    // Validate paper size
    if (!['80mm', '58mm'].includes(paperSize)) {
      return res.status(400).json({ error: 'Kích thước giấy không hợp lệ. Vui lòng kiểm tra Settings.' });
    }
    
    // Print logs removed for security

    // Generate ESC/POS commands for bill
    const billData = generateBill(order, items, paperSize, settingsObj);

    // Send to printer
    const printSuccess = await sendToPrinter(printerIP, printerPort, billData);

    if (printSuccess) {
      res.json({ message: 'Bill printed successfully' });
    } else {
      // Do not expose internal IP/port in error message
      res.status(500).json({ error: 'Không thể kết nối máy in. Vui lòng kiểm tra IP/Port trong Cài đặt và đảm bảo máy in cùng WiFi.' });
    }
  } catch (error) {
    // Error details removed for security
    res.status(500).json({ error: 'Lỗi khi in bill. Vui lòng thử lại.' });
  }
});

function generateBill(order, items, paperSize, settingsObj = {}) {
  const ESC = '\x1B';
  const GS = '\x1D';
  const commands = [];

  // Initialize printer
  commands.push(ESC + '@'); // Reset printer

  // Set alignment center
  commands.push(ESC + 'a' + '\x01');

  // Title - Use custom store name if set, otherwise default
  const storeName = (settingsObj.bill_store_name && settingsObj.bill_store_name.trim()) || 'QUẢN LÝ CỬA HÀNG';
  commands.push(ESC + '!' + '\x08'); // Double height
  commands.push(storeName + '\n');
  commands.push(ESC + '!' + '\x00'); // Normal
  commands.push('-------------------\n');

  // Store address if set
  if (settingsObj.bill_store_address && settingsObj.bill_store_address.trim()) {
    commands.push(ESC + 'a' + '\x01'); // Center align
    commands.push(settingsObj.bill_store_address.trim() + '\n');
  }

  // Store phone if set
  if (settingsObj.bill_store_phone && settingsObj.bill_store_phone.trim()) {
    commands.push(ESC + 'a' + '\x01'); // Center align
    commands.push(`ĐT: ${settingsObj.bill_store_phone.trim()}\n`);
  }

  // Add separator if store info was shown
  if ((settingsObj.bill_store_address && settingsObj.bill_store_address.trim()) || 
      (settingsObj.bill_store_phone && settingsObj.bill_store_phone.trim())) {
    commands.push('-------------------\n');
  }

  // Order info
  commands.push(ESC + 'a' + '\x00'); // Left align
  commands.push(`Mã đơn: ${order.code}\n`);
  commands.push(`Ngày: ${new Date(order.created_at).toLocaleString('vi-VN')}\n`);
  commands.push(`Khách: ${order.customer_name || order.customer_phone || 'N/A'}\n`);
  if (order.customer_phone && !order.customer_phone.startsWith('temp_')) {
    commands.push(`SĐT: ${order.customer_phone}\n`);
  }
  commands.push('-------------------\n');

  // Items
  commands.push(ESC + '!' + '\x01'); // Bold
  commands.push('Sản phẩm\n');
  commands.push(ESC + '!' + '\x00'); // Normal

  items.forEach((item) => {
    const line = `${item.product_name} x${item.quantity} ${item.product_unit}`;
    const price = (item.quantity * item.unit_price).toLocaleString('vi-VN');
    commands.push(line + '\n');
    commands.push(`${price.padStart(paperSize === '80mm' ? 30 : 40)} đ\n`);
  });

  commands.push('-------------------\n');

  // Totals
  commands.push(ESC + 'a' + '\x02'); // Right align
  const total = parseFloat(order.total_amount || 0).toLocaleString('vi-VN');
  commands.push(`Tổng: ${total} đ\n`);
  
  // Promotion discount if exists
  if (order.discount_amount && parseFloat(order.discount_amount) > 0) {
    const discount = parseFloat(order.discount_amount).toLocaleString('vi-VN');
    commands.push(`Giảm giá: -${discount} đ\n`);
    if (order.promotion_name) {
      commands.push(`(${order.promotion_name})\n`);
    }
  }
  
  // Final amount
  commands.push(ESC + '!' + '\x08'); // Double height
  const finalAmount = parseFloat(order.final_amount || order.total_amount || 0).toLocaleString('vi-VN');
  commands.push(`Thành tiền: ${finalAmount} đ\n`);
  commands.push(ESC + '!' + '\x00'); // Normal
  
  // Payment method if completed
  if (order.status === 'completed' && order.payment_method) {
    commands.push(ESC + 'a' + '\x00'); // Left align
    const paymentMethodText = order.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản';
    commands.push(`Thanh toán: ${paymentMethodText}\n`);
  }

  commands.push('\n\n');
  commands.push(ESC + 'a' + '\x01'); // Center
  const footerMessage = (settingsObj.bill_footer_message && settingsObj.bill_footer_message.trim()) || 'Cảm ơn quý khách!';
  commands.push(footerMessage + '\n');
  commands.push('\n\n\n');

  // Cut paper
  commands.push(GS + 'V' + '\x41' + '\x03');

  return Buffer.from(commands.join(''), 'utf8');
}

function sendToPrinter(ip, port, data) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let connected = false;
    let dataSent = false;

    socket.setTimeout(10000); // 10 second timeout

    socket.on('connect', () => {
      // Connection log removed for security
      connected = true;
      try {
        socket.write(data, (err) => {
          if (err) {
            // Error log removed for security
            socket.destroy();
            resolve(false);
          } else {
            // Success log removed for security
            dataSent = true;
            socket.end();
          }
        });
      } catch (err) {
        // Error log removed for security
        socket.destroy();
        resolve(false);
      }
    });

    socket.on('close', () => {
      // Connection log removed for security
      resolve(connected && dataSent);
    });

    socket.on('error', (err) => {
      // Error log removed for security
      resolve(false);
    });

    socket.on('timeout', () => {
      // Timeout log removed for security
      socket.destroy();
      resolve(false);
    });

    // Connection log removed for security
    socket.connect(port, ip);
  });
}

export default router;

