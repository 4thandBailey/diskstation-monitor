import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth';
import { devicesRouter } from './routes/devices';
import { alertsRouter, settingsRouter, accountRouter, securityRouter } from './routes/settings';
import { authMiddleware } from './middleware/auth';
import { db } from './db/client';
import { redis } from './services/redis';
import { startPollEngine } from './workers/pollEngine';

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Security middleware ──────────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false }));

app.use(cors({
  origin: [FRONTEND_URL, 'https://diskstation-monitor.netlify.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Health check (unauthenticated) ───────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    await redis.ping();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: 'connected',
      redis: 'connected',
    });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: String(err) });
  }
});

// ── Public routes ────────────────────────────────────────────────────────────
app.use('/auth', authRouter);

// ── Protected routes (require valid JWT) ────────────────────────────────────
app.use('/api/devices',  authMiddleware, devicesRouter);
app.use('/api/alerts',   authMiddleware, alertsRouter);
app.use('/api/settings', authMiddleware, settingsRouter);
app.use('/api/account',  authMiddleware, accountRouter);
app.use('/api/security', authMiddleware, securityRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`[server] DiskStation Monitor backend running on port ${PORT}`);
  console.log(`[server] Environment: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV !== 'test') {
    startPollEngine();
  }
});

export { app };
