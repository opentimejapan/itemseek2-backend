import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { inventoryItems, inventoryMovements, inventoryCounts, categories, locations } from '../db/schema';
import { eq, and, like, gte, lte } from 'drizzle-orm';
import { AuthRequest, authorize } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Create inventory item schema
const createItemSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional(),
  quantity: z.number().int().min(0),
  minQuantity: z.number().int().min(0),
  maxQuantity: z.number().int().min(0).optional(),
  unit: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().optional(),
  location: z.string().min(1),
  sublocation: z.string().optional(),
  cost: z.number().min(0).optional(),
  price: z.number().min(0).optional(),
  supplier: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  expiryDate: z.string().optional(),
});

// List inventory items
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      category, 
      location,
      lowStock 
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    let query = db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.organizationId, req.user!.organizationId));

    // Apply filters
    const conditions = [eq(inventoryItems.organizationId, req.user!.organizationId)];

    if (search) {
      conditions.push(
        like(inventoryItems.name, `%${search}%`)
      );
    }

    if (category) {
      conditions.push(eq(inventoryItems.category, String(category)));
    }

    if (location) {
      conditions.push(eq(inventoryItems.location, String(location)));
    }

    if (lowStock === 'true') {
      // This would need a subquery or join to compare quantity with minQuantity
      // For now, simplified version
    }

    const items = await db
      .select()
      .from(inventoryItems)
      .where(and(...conditions))
      .limit(Number(limit))
      .offset(offset);

    res.json({
      success: true,
      data: items,
      metadata: {
        page: Number(page),
        limit: Number(limit),
        total: items.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get single inventory item
router.get('/:itemId', async (req: AuthRequest, res, next) => {
  try {
    const { itemId } = req.params;

    const [item] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.id, itemId),
        eq(inventoryItems.organizationId, req.user!.organizationId)
      ))
      .limit(1);

    if (!item) {
      throw new AppError(404, 'Item not found');
    }

    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
});

// Create inventory item
router.post('/', authorize('manager', 'org_admin', 'system_admin'), async (req: AuthRequest, res, next) => {
  try {
    const data = createItemSchema.parse(req.body);

    // Check if SKU already exists
    const [existingItem] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.organizationId, req.user!.organizationId),
        eq(inventoryItems.sku, data.sku)
      ))
      .limit(1);

    if (existingItem) {
      throw new AppError(409, 'SKU already exists');
    }

    // Create item
    const [newItem] = await db
      .insert(inventoryItems)
      .values({
        ...data,
        organizationId: req.user!.organizationId,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
      })
      .returning();

    // Record initial inventory movement
    await db.insert(inventoryMovements).values({
      itemId: newItem.id,
      type: 'in',
      quantity: data.quantity,
      toLocation: data.location,
      reason: 'Initial stock',
      userId: req.user!.id,
    });

    res.status(201).json({ success: true, data: newItem });
  } catch (error) {
    next(error);
  }
});

// Update inventory item
const updateItemSchema = createItemSchema.partial();

router.patch('/:itemId', authorize('manager', 'org_admin', 'system_admin'), async (req: AuthRequest, res, next) => {
  try {
    const { itemId } = req.params;
    const data = updateItemSchema.parse(req.body);

    // Check if item exists and belongs to organization
    const [existingItem] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.id, itemId),
        eq(inventoryItems.organizationId, req.user!.organizationId)
      ))
      .limit(1);

    if (!existingItem) {
      throw new AppError(404, 'Item not found');
    }

    // Update item
    const [updatedItem] = await db
      .update(inventoryItems)
      .set({
        ...data,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, itemId))
      .returning();

    res.json({ success: true, data: updatedItem });
  } catch (error) {
    next(error);
  }
});

// Update inventory quantity
const updateQuantitySchema = z.object({
  quantity: z.number().int().min(0),
  reason: z.string().optional(),
});

router.post('/:itemId/quantity', async (req: AuthRequest, res, next) => {
  try {
    const { itemId } = req.params;
    const { quantity, reason } = updateQuantitySchema.parse(req.body);

    // Get current item
    const [item] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.id, itemId),
        eq(inventoryItems.organizationId, req.user!.organizationId)
      ))
      .limit(1);

    if (!item) {
      throw new AppError(404, 'Item not found');
    }

    const quantityDiff = quantity - item.quantity;

    // Update quantity
    const [updatedItem] = await db
      .update(inventoryItems)
      .set({
        quantity,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, itemId))
      .returning();

    // Record movement
    if (quantityDiff !== 0) {
      await db.insert(inventoryMovements).values({
        itemId,
        type: quantityDiff > 0 ? 'in' : 'out',
        quantity: Math.abs(quantityDiff),
        toLocation: item.location,
        reason: reason || 'Manual adjustment',
        userId: req.user!.id,
      });
    }

    res.json({ success: true, data: updatedItem });
  } catch (error) {
    next(error);
  }
});

// Delete inventory item
router.delete('/:itemId', authorize('org_admin', 'system_admin'), async (req: AuthRequest, res, next) => {
  try {
    const { itemId } = req.params;

    // Check if item exists and belongs to organization
    const [item] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.id, itemId),
        eq(inventoryItems.organizationId, req.user!.organizationId)
      ))
      .limit(1);

    if (!item) {
      throw new AppError(404, 'Item not found');
    }

    // Delete item (cascades will handle related records)
    await db.delete(inventoryItems).where(eq(inventoryItems.id, itemId));

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get item movements
router.get('/:itemId/movements', async (req: AuthRequest, res, next) => {
  try {
    const { itemId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    // Verify item belongs to organization
    const [item] = await db
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.id, itemId),
        eq(inventoryItems.organizationId, req.user!.organizationId)
      ))
      .limit(1);

    if (!item) {
      throw new AppError(404, 'Item not found');
    }

    // Get movements
    const movements = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.itemId, itemId))
      .orderBy(inventoryMovements.createdAt)
      .limit(Number(limit))
      .offset(offset);

    res.json({
      success: true,
      data: movements,
      metadata: {
        page: Number(page),
        limit: Number(limit),
        total: movements.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;