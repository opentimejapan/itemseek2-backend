import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../config/database';
import { users, organizations, sessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler';
import { authRateLimiter } from '../middleware/rateLimiter';
import { AuthRequest } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  organizationSlug: z.string().optional(),
});

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  organizationName: z.string().min(2),
  industry: z.enum(['hospitality', 'healthcare', 'retail', 'manufacturing', 'education', 'restaurant', 'logistics', 'other']),
});

// Helper function to generate tokens
function generateTokens(userId: string, sessionId: string) {
  const accessToken = jwt.sign(
    { userId, sessionId },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const refreshToken = jwt.sign(
    { userId, sessionId },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  return { accessToken, refreshToken };
}

// Login
router.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);

    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (!user || !user.isActive) {
      throw new AppError(401, 'Invalid credentials');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(data.password, user.password);
    if (!isValidPassword) {
      throw new AppError(401, 'Invalid credentials');
    }

    // Get organization
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, user.organizationId))
      .limit(1);

    if (!organization || !organization.isActive) {
      throw new AppError(401, 'Organization not found or inactive');
    }

    // Create session
    const sessionId = crypto.randomUUID();
    const { accessToken, refreshToken } = generateTokens(user.id, sessionId);

    await db.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      token: accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      refreshExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          plan: organization.plan,
        },
        accessToken,
        refreshToken,
        expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
      },
    });
  } catch (error) {
    next(error);
  }
});

// Signup
router.post('/signup', authRateLimiter, async (req, res, next) => {
  try {
    const data = signupSchema.parse(req.body);

    // Check if user exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (existingUser) {
      throw new AppError(409, 'User already exists');
    }

    // Create organization
    const orgSlug = data.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const [organization] = await db
      .insert(organizations)
      .values({
        name: data.organizationName,
        slug: orgSlug,
        industry: data.industry,
      })
      .returning();

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: 'org_admin',
        organizationId: organization.id,
      })
      .returning();

    // Create session
    const sessionId = crypto.randomUUID();
    const { accessToken, refreshToken } = generateTokens(user.id, sessionId);

    await db.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      token: accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      refreshExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          plan: organization.plan,
        },
        accessToken,
        refreshToken,
        expiresIn: 7 * 24 * 60 * 60,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Logout
router.post('/logout', async (req: AuthRequest, res, next) => {
  try {
    if (req.session) {
      await db.delete(sessions).where(eq(sessions.id, req.session.id));
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Refresh token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError(401, 'Refresh token required');
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as {
      userId: string;
      sessionId: string;
    };

    // Find session
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, decoded.sessionId))
      .limit(1);

    if (!session || session.refreshToken !== refreshToken || session.refreshExpiresAt < new Date()) {
      throw new AppError(401, 'Invalid refresh token');
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(
      decoded.userId,
      decoded.sessionId
    );

    // Update session
    await db
      .update(sessions)
      .set({
        token: accessToken,
        refreshToken: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        refreshExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .where(eq(sessions.id, decoded.sessionId));

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: 7 * 24 * 60 * 60,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;