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

// Allow all legitimate frontend origins
const ALLOWED_ORIGINS = [
  'https://dsm.4thandbailey.com',
  'https://diskstation-monitor.netlify.app',
  'https://main--diskstation-monitor.netlify.app',
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean) as string[];

app.use(helmet({ crossOriginEmbedderPolicy: false }));

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    await redis.ping();
    res.json({ status: 'ok', timestamp: new Date().toISOString(), db: 'connected', redis: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: String(err) });
  }
});

app.use('/auth', authRouter);
app.use('/api/devices',  authMiddleware, devicesRouter);
app.use('/api/alerts',   authMiddleware, alertsRouter);
app.use('/api/settings', authMiddleware, settingsRouter);
app.use('/api/account',  authMiddleware, accountRouter);
app.use('/api/security', authMiddleware, securityRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, async () => {
  console.log(`[server] DiskStation Monitor running on port ${PORT}`);
  console.log(`[server] Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  if (process.env.NODE_ENV !== 'test') startPollEngine();
});

export { app };
