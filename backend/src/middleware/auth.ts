import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../services/jwt';
import { validateSession } from '../services/redis';

// Extend Express Request to carry verified user
declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);

    // Verify session is still live in Redis (handles logout invalidation)
    const valid = await validateSession(payload.sub, payload.jti);
    if (!valid) {
      res.status(401).json({ error: 'Session expired or revoked' });
      return;
    }

    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
