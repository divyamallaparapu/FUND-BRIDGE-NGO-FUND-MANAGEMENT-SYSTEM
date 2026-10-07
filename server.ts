import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';

import { initDatabase, store } from './database/db.js';
import authRoutes from './server/routes/authRoutes.js';
import donationRoutes from './server/routes/donationRoutes.js';
import expenseRoutes from './server/routes/expenseRoutes.js';
import requestRoutes from './server/routes/requestRoutes.js';
import dashboardRoutes from './server/routes/dashboardRoutes.js';
import userRoutes from './server/routes/userRoutes.js';
import notificationRoutes from './server/routes/notificationRoutes.js';
import auditLogRoutes from './server/routes/auditLogRoutes.js';
import messageRoutes from './server/routes/messageRoutes.js';
import settingsRoutes from './server/routes/settingsRoutes.js';
import { generalLimiter } from './server/middleware/rateLimiter.js';
import { sendPasswordResetEmail, sendPasswordResetOtpEmail, warmUpSmtp } from './server/services/emailService.js';
import { forgotPassword, verifyOtp, resetPassword } from './server/controllers/authController.js';
import bcrypt from 'bcryptjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Security Headers & CORS
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // General rate limiting
  app.use('/api', generalLimiter);

  // Initialize Database Pool
  await initDatabase();

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/donations', donationRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/requests', requestRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/audit-logs', auditLogRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/settings', settingsRoutes);

  // Password reset OTP dispatch - sends 6-digit OTP to user email
  app.post('/api/send-reset-email', forgotPassword);
  app.post('/api/verify-otp', verifyOtp);

  // Direct reset password route
  app.post('/api/reset-password', resetPassword);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Static public assets
  app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
  app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
  app.use('/js', express.static(path.join(__dirname, 'public', 'js')));

  // Vite middleware in development or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Fund Bridge] Full-stack Server running at http://0.0.0.0:${PORT}`) ;
    warmUpSmtp();
  });
}

startServer().catch(err => {
  console.error('Fatal server startup error:', err);
});
