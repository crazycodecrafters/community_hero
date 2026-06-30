import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { startSLAMonitoring } from './services/sla-monitor';
import authRoutes from './routes/auth';
import issueRoutes from './routes/issues';
import adminRoutes from './routes/admin';
import gamificationRoutes from './routes/gamification';
import notificationRoutes from './routes/notifications';
import publicRoutes from './routes/public';
import aiRoutes from './routes/ai';
import officerRoutes from './routes/officer';

const app = express();

// Global Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests from this IP, please try again after 15 minutes' },
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(globalLimiter);
app.use(cors({
  origin: function (origin, callback) {
    // Allow all origins that end with vercel.app, or localhost
    if (!origin || origin.includes('localhost') || origin.endsWith('vercel.app')) {
      callback(null, true);
    } else {
      // Fallback to strict origins
      const allowedOrigins = env.corsOrigins.split(',').map(s => s.trim());
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/api/health', async (_, res) => {
  res.json({ success: true, data: { status: 'ok', db: 'firebase', timestamp: Date.now(), uptime: process.uptime() } });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/officer', officerRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start
if (!process.env.VERCEL) {
  app.listen(env.port, async () => {
    console.log(`\n🏙️  Community Hero Backend`);
    console.log(`📡 Running on http://0.0.0.0:${env.port}`);
    console.log(`🤖 AI Model: ${env.nvidiaModel}`);
    console.log(`🌍 Environment: ${env.environment}\n`);

    console.log('✅ Firebase initialized');

    // Start SLA monitoring
    startSLAMonitoring(60000);
  });
}

export default app;
