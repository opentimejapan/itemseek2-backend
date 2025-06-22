import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../config/database';
import { users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { AuthRequest, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Get current user
router.get('/me', async (req: AuthRequest, res, next) => {
  try {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        organizationId: users.organizationId,
        permissions: users.permissions,
        avatar: users.avatar,
        phoneNumber: users.phoneNumber,
        isActive: users.isActive,
        emailVerified: users.emailVerified,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// Update current user
const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  phoneNumber: z.string().optional(),
  avatar: z.string().url().optional(),
});

router.patch('/me', async (req: AuthRequest, res, next) => {
  try {
    const data = updateUserSchema.parse(req.body);

    const [updatedUser] = await db
      .update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.user!.id))
      .returning();

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    next(error);
  }
});

// Change password
const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

router.post('/me/change-password', async (req: AuthRequest, res, next) => {
  try {
    const data = changePasswordSchema.parse(req.body);

    // Get user with password
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1);

    // Verify current password
    const isValid = await bcrypt.compare(data.currentPassword, user.password);
    if (!isValid) {
      throw new AppError(401, 'Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(data.newPassword, 10);

    // Update password
    await db
      .update(users)
      .set({
        password: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.user!.id));

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
});

// List users (org admin only)
router.get('/', authorize('org_admin', 'system_admin'), async (req: AuthRequest, res, next) => {
  try {
    const { page = 1, limit = 20, role, search } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    let query = db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        avatar: users.avatar,
        phoneNumber: users.phoneNumber,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.organizationId, req.user!.organizationId))
      .limit(Number(limit))
      .offset(offset);

    const userList = await query;

    res.json({
      success: true,
      data: userList,
      metadata: {
        page: Number(page),
        limit: Number(limit),
        total: userList.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create user (org admin only)
const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  role: z.enum(['org_admin', 'manager', 'user', 'viewer']),
  phoneNumber: z.string().optional(),
});

router.post('/', authorize('org_admin', 'system_admin'), async (req: AuthRequest, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);

    // Check if user exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (existingUser) {
      throw new AppError(409, 'User already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        ...data,
        password: hashedPassword,
        organizationId: req.user!.organizationId,
      })
      .returning();

    res.status(201).json({
      success: true,
      data: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        phoneNumber: newUser.phoneNumber,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update user (org admin only)
const updateOtherUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(['org_admin', 'manager', 'user', 'viewer']).optional(),
  phoneNumber: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.patch('/:userId', authorize('org_admin', 'system_admin'), async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params;
    const data = updateOtherUserSchema.parse(req.body);

    // Check if user belongs to same organization
    const [targetUser] = await db
      .select()
      .from(users)
      .where(and(
        eq(users.id, userId),
        eq(users.organizationId, req.user!.organizationId)
      ))
      .limit(1);

    if (!targetUser) {
      throw new AppError(404, 'User not found');
    }

    // Update user
    const [updatedUser] = await db
      .update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    next(error);
  }
});

export default router;