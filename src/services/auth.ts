import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import type { AppDb } from '../db';
import { tenantUsers } from '../db/schema';
import { TENANT_MBCSOFT_ID } from '../db/constants';
import { randomId12 } from './crypto';

export type JwtRole = 'super_admin' | 'tenant_admin' | 'tenant_operator';

export type AccessTokenPayload = {
  userId: string;
  tenantId: string;
  role: JwtRole;
};

const BCRYPT_ROUNDS = 12;

function accessSecret(): string {
  const s = process.env.JWT_ACCESS_SECRET?.trim();
  if (!s) throw new Error('JWT_ACCESS_SECRET is required');
  return s;
}

function refreshSecret(): string {
  const s = process.env.JWT_REFRESH_SECRET?.trim();
  if (!s) throw new Error('JWT_REFRESH_SECRET is required');
  return s;
}

function accessTtlSec(): number {
  const v = Number(process.env.JWT_ACCESS_TTL ?? '3600');
  return Number.isFinite(v) && v > 0 ? v : 3600;
}

function refreshTtlSec(): number {
  const v = Number(process.env.JWT_REFRESH_TTL ?? String(30 * 24 * 3600));
  return Number.isFinite(v) && v > 0 ? v : 30 * 24 * 3600;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateAccessToken(user: AccessTokenPayload): string {
  return jwt.sign(
    { tenantId: user.tenantId, role: user.role },
    accessSecret(),
    { subject: user.userId, expiresIn: accessTtlSec() }
  );
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({}, refreshSecret(), { subject: userId, expiresIn: refreshTtlSec() });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, accessSecret()) as jwt.JwtPayload;
    const userId = typeof decoded.sub === 'string' ? decoded.sub : '';
    const tenantId = typeof decoded.tenantId === 'string' ? decoded.tenantId : '';
    const role = decoded.role as JwtRole;
    if (!userId || !tenantId || !isJwtRole(role)) return null;
    return { userId, tenantId, role };
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, refreshSecret()) as jwt.JwtPayload;
    const userId = typeof decoded.sub === 'string' ? decoded.sub : '';
    if (!userId) return null;
    return { userId };
  } catch {
    return null;
  }
}

function isJwtRole(r: unknown): r is JwtRole {
  return r === 'super_admin' || r === 'tenant_admin' || r === 'tenant_operator';
}

/**
 * If no super_admin exists, create one from env (idempotent).
 */
export async function bootstrapSuperAdmin(db: AppDb): Promise<void> {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD_BOOTSTRAP;
  if (!email || !password) {
    return;
  }

  const existing = await db.select({ id: tenantUsers.id }).from(tenantUsers).where(eq(tenantUsers.role, 'super_admin')).limit(1);
  if (existing[0]) {
    return;
  }

  const id = randomId12();
  const passwordHash = await hashPassword(password);
  const now = new Date();
  await db.insert(tenantUsers).values({
    id,
    tenantId: TENANT_MBCSOFT_ID,
    email,
    passwordHash,
    role: 'super_admin',
    isActive: true,
    createdAt: now,
  });
}
