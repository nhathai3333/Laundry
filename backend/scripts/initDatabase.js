import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { hashPassword } from '../utils/helpers.js';

dotenv.config();

const DB_NAME = process.env.MYSQL_DATABASE || 'laundry66';

// Create connection pool
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  multipleStatements: true
});

async function ensureUserSubscriptionColumns(connection) {
  const requiredColumns = [
    { name: 'subscription_package', ddl: 'ALTER TABLE users ADD COLUMN subscription_package VARCHAR(50) NULL AFTER store_id' },
    { name: 'subscription_expires_at', ddl: 'ALTER TABLE users ADD COLUMN subscription_expires_at DATETIME NULL AFTER subscription_package' }
  ];

  for (const col of requiredColumns) {
    const [check] = await connection.query(
      `
      SELECT COUNT(*) as count
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = 'users' AND column_name = ?
      `,
      [DB_NAME, col.name]
    );

    if (check?.[0]?.count > 0) continue;

    try {
      await connection.query(col.ddl);
      console.log(`✓ Added column users.${col.name}`);
    } catch (error) {
      // If it was added concurrently or already exists, ignore
      if (error.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }

    // Verify it exists now (avoid silent partial init)
    const [verify] = await connection.query(
      `
      SELECT COUNT(*) as count
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = 'users' AND column_name = ?
      `,
      [DB_NAME, col.name]
    );
    if (!verify?.[0] || verify[0].count === 0) {
      throw new Error(`Failed to add required column users.${col.name}`);
    }
  }
}

async function cleanStoresForeignKeyValues(connection) {
  // Make sure existing data won't block FK creation
  await connection.query(`
    UPDATE stores
    SET admin_id = NULL
    WHERE admin_id IS NOT NULL
      AND admin_id NOT IN (SELECT id FROM users)
  `);
  await connection.query(`
    UPDATE stores
    SET shared_account_id = NULL
    WHERE shared_account_id IS NOT NULL
      AND shared_account_id NOT IN (SELECT id FROM users)
  `);
}

async function ensureStoresForeignKeys(connection) {
  const storeForeignKeys = [
    { name: 'fk_stores_admin_id', column: 'admin_id' },
    { name: 'fk_stores_shared_account_id', column: 'shared_account_id' }
  ];

  for (const fk of storeForeignKeys) {
    const [fkCheck] = await connection.query(
      `
      SELECT COUNT(*) as count
      FROM information_schema.table_constraints
      WHERE table_schema = ?
        AND table_name = 'stores'
        AND constraint_name = ?
        AND constraint_type = 'FOREIGN KEY'
      `,
      [DB_NAME, fk.name]
    );

    if (fkCheck?.[0]?.count > 0) continue;

    try {
      await connection.query(
        `
        ALTER TABLE stores
        ADD CONSTRAINT ${fk.name}
        FOREIGN KEY (${fk.column}) REFERENCES users(id) ON DELETE SET NULL
        `
      );
      console.log(`✓ Added foreign key ${fk.name}`);
    } catch (error) {
      // Retry once after cleaning invalid values (common cause)
      try {
        await cleanStoresForeignKeyValues(connection);
        await connection.query(
          `
          ALTER TABLE stores
          ADD CONSTRAINT ${fk.name}
          FOREIGN KEY (${fk.column}) REFERENCES users(id) ON DELETE SET NULL
          `
        );
        console.log(`✓ Added foreign key ${fk.name} (after cleanup)`);
      } catch (retryError) {
        // Ignore if FK already exists / partial init timing issues
        if (
          retryError.code !== 'ER_FK_DUP_NAME' &&
          retryError.code !== 'ER_NO_SUCH_TABLE' &&
          retryError.code !== 'ER_CANT_CREATE_TABLE' &&
          retryError.code !== 'ER_DUP_KEYNAME'
        ) {
          console.warn(`Warning adding foreign key ${fk.name}: ${retryError.message}`);
        }
      }

      if (
        error.code === 'ER_FK_DUP_NAME' ||
        error.code === 'ER_NO_SUCH_TABLE' ||
        error.code === 'ER_CANT_CREATE_TABLE' ||
        error.code === 'ER_DUP_KEYNAME'
      ) {
        continue;
      }
    }
  }
}

async function ensureIndexes(connection) {
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
      const [existing] = await connection.query(
        `
        SELECT COUNT(*) as count
        FROM information_schema.statistics
        WHERE table_schema = ? AND table_name = ? AND index_name = ?
        `,
        [DB_NAME, idx.table, idx.name]
      );

      if (existing?.[0]?.count > 0) continue;
      await connection.query(`CREATE INDEX ${idx.name} ON ${idx.table}(${idx.columns})`);
      console.log(`✓ Created index ${idx.name}`);
    } catch (error) {
      if (error.code !== 'ER_NO_SUCH_TABLE' && error.code !== 'ER_DUP_KEYNAME') {
        console.warn(`Warning creating index ${idx.name}: ${error.message}`);
      }
    }
  }
}

// Ensure schema is created before proceeding
async function ensureSchema() {
  try {
    // Check if users table exists
    const [tables] = await pool.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = ? AND table_name = 'users'
    `, [DB_NAME]);
    
    if (tables[0].count === 0) {
      console.log('Creating database schema...');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const schemaPath = join(__dirname, '../database/schema.sql');
      
      const schema = readFileSync(schemaPath, 'utf-8');
      
      // Normalize schema for safe initialization:
      // - Remove CREATE INDEX IF NOT EXISTS (we create indexes separately)
      // - Remove any stores->users foreign keys inside CREATE TABLE stores (old schema versions)
      // - Ignore any ALTER TABLE statements (we add required FKs programmatically, idempotently)
      let processedSchema = schema;
      
      // Replace CREATE INDEX IF NOT EXISTS with a safer approach
      processedSchema = processedSchema.replace(
        /CREATE INDEX IF NOT EXISTS (\w+) ON (\w+)\(([^)]+)\)/gi,
        (match, indexName, tableName, columns) => {
          return `-- Index ${indexName} will be created separately if needed`;
        }
      );

      // Strip any FK lines inside CREATE TABLE stores that reference users (for backward compatibility)
      // This prevents errno 150 when users table doesn't exist yet.
      processedSchema = processedSchema.replace(
        /(CREATE TABLE IF NOT EXISTS stores\s*\([\s\S]*?)(\s*,\s*FOREIGN KEY\s*\(\s*admin_id\s*\)[\s\S]*?\n)([\s\S]*?)(\s*,\s*FOREIGN KEY\s*\(\s*shared_account_id\s*\)[\s\S]*?\n)([\s\S]*?\)\s*ENGINE=InnoDB[\s\S]*?;)/i,
        (match, head, fk1, mid, fk2, tail) => `${head}${mid}${tail}`
      );

      // Remove all ALTER TABLE statements entirely (they may span multiple lines)
      processedSchema = processedSchema.replace(/ALTER TABLE[\s\S]*?;/gi, '-- ALTER TABLE removed (handled in code);');
      
      const connection = await pool.getConnection();
      try {
        // Split schema into individual statements and execute them one by one.
        // Use a robust comment stripper: remove all `-- ...` comment fragments first,
        // otherwise statement chunks may start with comments and get mishandled.
        const schemaWithoutLineComments = processedSchema
          .replace(/^\s*--.*$/gm, '')
          .trim();

        const statements = schemaWithoutLineComments
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        // Execute all CREATE TABLE statements one by one (ignore "already exists")
        for (const statement of statements) {
          if (!/^\s*CREATE\s+TABLE/i.test(statement)) continue;
          try {
            await connection.query(statement + ';');
          } catch (error) {
            // Ignore table already exists errors
            if (
              error.code !== 'ER_TABLE_EXISTS_ERROR' &&
              error.code !== 'ER_DUP_TABLE' &&
              !error.message.includes('already exists')
            ) {
              throw error;
            }
          }
        }

        // Sanity check: users table must exist now
        const [usersCheck] = await connection.query(
          `
          SELECT COUNT(*) as count
          FROM information_schema.tables
          WHERE table_schema = ? AND table_name = 'users'
          `,
          [DB_NAME]
        );
        if (!usersCheck?.[0] || usersCheck[0].count === 0) {
          throw new Error(
            "Schema init incomplete: table 'users' was not created. Please ensure VPS code is up-to-date and schema.sql is correct."
          );
        }
        
        // Ensure promotions table exists (it has FK to users, so must be created after users)
        const [promotionsCheck] = await connection.query(
          `
          SELECT COUNT(*) as count
          FROM information_schema.tables
          WHERE table_schema = ? AND table_name = 'promotions'
          `,
          [DB_NAME]
        );
        if (!promotionsCheck?.[0] || promotionsCheck[0].count === 0) {
          console.log('Creating promotions table...');
          try {
            await connection.query(`
              CREATE TABLE IF NOT EXISTS promotions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                type ENUM('order_count', 'bill_amount') NOT NULL,
                min_order_count INT DEFAULT NULL,
                min_bill_amount DECIMAL(10, 2) DEFAULT NULL,
                discount_type ENUM('percentage', 'fixed') NOT NULL,
                discount_value DECIMAL(10, 2) NOT NULL,
                max_discount_amount DECIMAL(10, 2) DEFAULT NULL,
                start_date DATETIME NOT NULL,
                end_date DATETIME NOT NULL,
                status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
                created_by INT,
                store_id INT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
              ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            console.log('✓ Promotions table created');
          } catch (error) {
            if (error.code !== 'ER_TABLE_EXISTS_ERROR' && error.code !== 'ER_DUP_TABLE') {
              console.warn(`Warning creating promotions table: ${error.message}`);
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

    // Always ensure runtime-required schema bits exist (even if DB already existed)
    const connection = await pool.getConnection();
    try {
      // Wait a bit to avoid race conditions after CREATE TABLE on fresh init
      await new Promise((resolve) => setTimeout(resolve, 300));

      await ensureUserSubscriptionColumns(connection);

      try {
        await cleanStoresForeignKeyValues(connection);
      } catch (error) {
        if (error.code !== 'ER_NO_SUCH_TABLE') {
          console.warn(`Warning cleaning stores table: ${error.message}`);
        }
      }

      await ensureStoresForeignKeys(connection);
      await ensureIndexes(connection);
    } finally {
      connection.release();
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

