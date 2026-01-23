import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import db from './database/db.js';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import customerRoutes from './routes/customers.js';
import orderRoutes from './routes/orders.js';
import timesheetRoutes from './routes/timesheets.js';
import reportRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';
import printRoutes from './routes/print.js';
import storeRoutes from './routes/stores.js';
import employeeRoutes from './routes/employees.js';
import promotionRoutes from './routes/promotions.js';
import { getMemoryUsageFormatted } from './utils/memoryMonitor.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security Headers - Bảo vệ khỏi XSS, clickjacking, MIME sniffing
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Cho phép CORS
}));

// Middleware - CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/print', printRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/promotions', promotionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  const memory = getMemoryUsageFormatted();
  const uptime = Math.round(process.uptime());
  
  res.json({ 
    status: 'ok', 
    database: 'connected',
    memory,
    uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Database: ${process.env.MYSQL_DATABASE || 'laundry66'} @ ${process.env.MYSQL_HOST || 'localhost'}`);
  console.log(`✅ CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
});

// Handle server errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

