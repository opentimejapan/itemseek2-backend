import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../config/database';
import { organizations } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AuthRequest, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Get current organization
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, req.user!.organizationId))
      .limit(1);

    if (!organization) {
      throw new AppError(404, 'Organization not found');
    }

    res.json({ success: true, data: organization });
  } catch (error) {
    next(error);
  }
});

// Update organization (org admin only)
const updateOrganizationSchema = z.object({
  name: z.string().min(2).optional(),
  logo: z.string().url().optional(),
  timezone: z.string().optional(),
  currency: z.string().length(3).optional(),
  locale: z.string().optional(),
  settings: z.object({
    inventory: z.object({
      lowStockThreshold: z.number().min(0).optional(),
      autoReorderEnabled: z.boolean().optional(),
      barcodeFormat: z.string().optional(),
      enableExpiryTracking: z.boolean().optional(),
      enableBatchTracking: z.boolean().optional(),
    }).optional(),
    notifications: z.object({
      email: z.boolean().optional(),
      sms: z.boolean().optional(),
      push: z.boolean().optional(),
      lowStockAlerts: z.boolean().optional(),
      orderUpdates: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

router.patch('/', authorize('org_admin', 'system_admin'), async (req: AuthRequest, res, next) => {
  try {
    const data = updateOrganizationSchema.parse(req.body);

    // Get current organization settings
    const [currentOrg] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, req.user!.organizationId))
      .limit(1);

    if (!currentOrg) {
      throw new AppError(404, 'Organization not found');
    }

    // Merge settings
    const mergedSettings = {
      ...currentOrg.settings,
      ...(data.settings && {
        inventory: { ...currentOrg.settings.inventory, ...data.settings.inventory },
        notifications: { ...currentOrg.settings.notifications, ...data.settings.notifications },
        integrations: currentOrg.settings.integrations,
        customFields: currentOrg.settings.customFields,
      }),
    };

    // Update organization
    const [updatedOrg] = await db
      .update(organizations)
      .set({
        ...data,
        settings: mergedSettings,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, req.user!.organizationId))
      .returning();

    res.json({ success: true, data: updatedOrg });
  } catch (error) {
    next(error);
  }
});

// AI Provider management
const aiProviderSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['openai', 'anthropic', 'google', 'custom']),
  apiKey: z.string().min(1),
  endpoint: z.string().url().optional(),
  model: z.string().optional(),
  isActive: z.boolean().default(true),
});

router.post('/ai-providers', authorize('org_admin', 'system_admin'), async (req: AuthRequest, res, next) => {
  try {
    const data = aiProviderSchema.parse(req.body);

    // Get current organization
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, req.user!.organizationId))
      .limit(1);

    if (!org) {
      throw new AppError(404, 'Organization not found');
    }

    // Add provider
    const providerId = crypto.randomUUID();
    const newProvider = { id: providerId, ...data };
    
    const updatedProviders = [
      ...(org.settings.integrations?.ai?.providers || []),
      newProvider,
    ];

    // Update organization settings
    const [updatedOrg] = await db
      .update(organizations)
      .set({
        settings: {
          ...org.settings,
          integrations: {
            ...org.settings.integrations,
            ai: {
              enabled: true,
              providers: updatedProviders,
            },
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, req.user!.organizationId))
      .returning();

    res.json({ success: true, data: newProvider });
  } catch (error) {
    next(error);
  }
});

router.delete('/ai-providers/:providerId', authorize('org_admin', 'system_admin'), async (req: AuthRequest, res, next) => {
  try {
    const { providerId } = req.params;

    // Get current organization
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, req.user!.organizationId))
      .limit(1);

    if (!org) {
      throw new AppError(404, 'Organization not found');
    }

    // Remove provider
    const updatedProviders = (org.settings.integrations?.ai?.providers || [])
      .filter((p: any) => p.id !== providerId);

    // Update organization settings
    await db
      .update(organizations)
      .set({
        settings: {
          ...org.settings,
          integrations: {
            ...org.settings.integrations,
            ai: {
              enabled: updatedProviders.length > 0,
              providers: updatedProviders,
            },
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, req.user!.organizationId));

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;