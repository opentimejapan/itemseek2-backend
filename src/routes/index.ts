import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import organizationRoutes from './organizations';
import inventoryRoutes from './inventory';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes
router.use('/auth', authRoutes);

// Protected routes
router.use('/users', authenticate, userRoutes);
router.use('/organization', authenticate, organizationRoutes);
router.use('/inventory', authenticate, inventoryRoutes);

export default router;