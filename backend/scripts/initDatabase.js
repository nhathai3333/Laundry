import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { hashPassword } from '../utils/helpers.js';

dotenv.config();

// Create connection pool
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'laundry66',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  multipleStatements: true
});

// Ensure schema is created before proceeding
async function ensureSchema() {
  try {
    // Check if users table exists
    const [tables] = await pool.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = ? AND table_name = 'users'
    `, [process.env.MYSQL_DATABASE || 'laundry66']);
    
    if (tables[0].count === 0) {
      console.log('Creating database schema...');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const schemaPath = join(__dirname, '../database/schema.sql');
      
      const schema = readFileSync(schemaPath, 'utf-8');
      
      // Remove CREATE INDEX IF NOT EXISTS and replace with logic to check first
      // Also remove ALTER TABLE statements (will be executed separately)
      let processedSchema = schema;
      
      // Replace CREATE INDEX IF NOT EXISTS with a safer approach
      processedSchema = processedSchema.replace(
        /CREATE INDEX IF NOT EXISTS (\w+) ON (\w+)\(([^)]+)\)/gi,
        (match, indexName, tableName, columns) => {
          return `-- Index ${indexName} will be created separately if needed`;
        }
      );
      
      // Extract ALTER TABLE statements to execute separately
      const alterTableStatements = [];
      processedSchema = processedSchema.replace(
        /ALTER TABLE\s+(\w+)\s+ADD CONSTRAINT\s+(\w+)\s+FOREIGN KEY\s+\(([^)]+)\)\s+REFERENCES\s+(\w+)\(([^)]+)\)\s+ON DELETE\s+(\w+);/gi,
        (match, table, constraint, column, refTable, refColumn, onDelete) => {
          alterTableStatements.push({ table, constraint, column, refTable, refColumn, onDelete });
          return `-- ALTER TABLE ${table} will be executed separately`;
        }
      );
      
      const connection = await pool.getConnection();
      try {
        // Execute all CREATE TABLE statements (without ALTER TABLE)
        await connection.query(processedSchema);
        
        // Add foreign keys from ALTER TABLE statements after all tables are created
        for (const fk of alterTableStatements) {
          try {
            // Check if foreign key exists
            const [fkCheck] = await connection.query(`
              SELECT COUNT(*) as count 
              FROM information_schema.table_constraints 
              WHERE table_schema = ? 
              AND table_name = ? 
              AND constraint_name = ?
              AND constraint_type = 'FOREIGN KEY'
            `, [process.env.MYSQL_DATABASE || 'laundry66', fk.table, fk.constraint]);
            
            if (fkCheck[0].count === 0) {
              const onDeleteClause = fk.onDelete || 'SET NULL';
              await connection.query(`
                ALTER TABLE ${fk.table} 
                ADD CONSTRAINT ${fk.constraint} 
                FOREIGN KEY (${fk.column}) REFERENCES ${fk.refTable}(${fk.refColumn}) ON DELETE ${onDeleteClause}
              `);
            }
          } catch (error) {
            // Ignore if foreign key already exists or table doesn't exist
            if (error.code !== 'ER_FK_DUP_NAME' && error.code !== 'ER_NO_SUCH_TABLE' && error.code !== 'ER_CANT_CREATE_TABLE') {
              console.warn(`Warning adding foreign key ${fk.constraint}: ${error.message}`);
            }
          }
        }
        
        // Now create indexes separately, checking if they exist first
        const indexStatements = [
          { name: 'idx_orders_status', table: 'orders', columns: 'status' },
          { name: 'idx_orders_assigned_to', table: 'orders', columns: 'assigned_to' },
          { name: 'idx_orders_customer_id', table: 'orders', columns: 'customer_id' },
          { name: 'idx_orders_created_at', table: 'orders', columns: 'created_at' },
          { name: 'idx_timesheets_user_id', table: 'timesheets', columns: 'user_id' },
          { name: 'idx_timesheets_check_in', table: 'timesheets', columns: 'check_in' },
          { name: 'idx_audit_logs_user_id', table: 'audit_logs', columns: 'user_id' },
          { name: 'idx_audit_logs_entity', table: 'audit_logs', columns: 'entity, entity_id' }
        ];
        
        for (const idx of indexStatements) {
          try {
            // Check if index exists
            const [existing] = await connection.query(`
              SELECT COUNT(*) as count 
              FROM information_schema.statistics 
              WHERE table_schema = ? AND table_name = ? AND index_name = ?
            `, [process.env.MYSQL_DATABASE || 'laundry66', idx.table, idx.name]);
            
            if (existing[0].count === 0) {
              await connection.query(`CREATE INDEX ${idx.name} ON ${idx.table}(${idx.columns})`);
            }
          } catch (error) {
            // Ignore if table doesn't exist yet or index creation fails
            if (error.code !== 'ER_NO_SUCH_TABLE' && error.code !== 'ER_DUP_KEYNAME') {
              console.warn(`Warning creating index ${idx.name}: ${error.message}`);
            }
          }
        }
        
        console.log('Schema created successfully');
      } finally {
        connection.release();
      }
    } else {
      console.log('Schema already exists');
    }
  } catch (error) {
    console.error('Error ensuring schema:', error);
    throw error;
  }
}

// Create default admin user
async function createDefaultAdmin() {
  try {
    // Check if admin exists
    const [rows] = await pool.query('SELECT id FROM users WHERE phone = ?', ['admin']);
    const existing = rows[0] || null;
    
    if (!existing) {
      const password_hash = await hashPassword('admin123');
      
      await pool.query(`
        INSERT INTO users (name, phone, password_hash, role, status)
        VALUES (?, ?, ?, ?, ?)
      `, ['Admin', 'admin', password_hash, 'admin', 'active']);
      
      console.log('Default admin created');
      console.log('Phone: admin');
      // Password removed from logs for security
    } else {
      console.log('Admin user already exists');
    }
  } catch (error) {
    console.error('Error creating admin:', error);
  }
}

// Create sample products
async function createSampleProducts() {
  try {
    const products = [
      { name: 'Giặt thường', unit: 'kg', price: 20000, eta_minutes: 120 },
      { name: 'Giặt chăn', unit: 'cai', price: 50000, eta_minutes: 180 },
      { name: 'Sấy', unit: 'kg', price: 15000, eta_minutes: 60 },
      { name: 'Giặt + Sấy', unit: 'kg', price: 30000, eta_minutes: 180 },
      { name: 'Ủi', unit: 'cai', price: 10000, eta_minutes: 30 }
    ];

    const [adminRows] = await pool.query('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin']);
    const admin = adminRows[0] || null;
    const adminId = admin ? admin.id : 1;

    for (const product of products) {
      const [existingRows] = await pool.query('SELECT id FROM products WHERE name = ?', [product.name]);
      const existing = existingRows[0] || null;
      if (!existing) {
        await pool.query(`
          INSERT INTO products (name, unit, price, eta_minutes, status, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          product.name,
          product.unit,
          product.price,
          product.eta_minutes,
          'active',
          adminId,
          adminId
        ]);
      }
    }

    console.log('Sample products created');
  } catch (error) {
    console.error('Error creating products:', error);
  }
}

// Main initialization
async function init() {
  try {
    console.log('Initializing database...');
    
    // Ensure database exists
    const tempConnection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: process.env.MYSQL_PORT || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || ''
    });
    
    const dbName = process.env.MYSQL_DATABASE || 'laundry66';
    await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await tempConnection.end();
    
    // Ensure schema is created
    await ensureSchema();
    
    // Wait a bit to ensure schema is fully created
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Create default admin and sample data
    await createDefaultAdmin();
    await createSampleProducts();
    
    console.log('Database initialization complete!');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Initialization failed:', error);
    await pool.end();
    process.exit(1);
  }
}

init();

