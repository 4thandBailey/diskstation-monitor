import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_EXPIRES  = process.env.JWT_ACCESS_EXPIRES  || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';

export interface JwtPayload {
  sub: string;       // userId
  jti: string;       // unique token ID (used for Redis invalidation)
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: Omit<JwtPayload, 'jti'>): string {
  return jwt.sign(
    { ...payload, jti: uuidv4() },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES } as jwt.SignOptions
  );
}

export function signRefreshToken(userId: string, email: string, role: string): { token: string; jti: string } {
  const jti = uuidv4();
  const token = jwt.sign(
    { sub: userId, jti, email, role },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES } as jwt.SignOptions
  );
  return { token, jti };
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, REFRESH_SECRET) as JwtPayload;
}
