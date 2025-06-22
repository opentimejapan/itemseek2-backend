import { db } from '../config/database';
import { organizations, users, inventoryItems, categories, locations } from './schema';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';

async function seed() {
  try {
    logger.info('Starting database seeding...');

    // Create demo organization
    const [demoOrg] = await db.insert(organizations).values({
      name: 'Demo Hotel',
      slug: 'demo-hotel',
      industry: 'hospitality',
      plan: 'professional',
    }).returning();

    logger.info('Created demo organization');

    // Create demo users
    const hashedPassword = await bcrypt.hash('demo123456', 10);

    const [adminUser] = await db.insert(users).values({
      email: 'admin@demo.com',
      password: hashedPassword,
      name: 'Demo Admin',
      role: 'org_admin',
      organizationId: demoOrg.id,
      emailVerified: true,
    }).returning();

    const [managerUser] = await db.insert(users).values({
      email: 'manager@demo.com',
      password: hashedPassword,
      name: 'Demo Manager',
      role: 'manager',
      organizationId: demoOrg.id,
      emailVerified: true,
    }).returning();

    logger.info('Created demo users');

    // Create categories
    await db.insert(categories).values([
      {
        organizationId: demoOrg.id,
        name: 'Linen',
        description: 'Bed sheets, towels, and other fabric items',
        icon: '🛏️',
        color: '#3B82F6',
        sortOrder: 1,
      },
      {
        organizationId: demoOrg.id,
        name: 'Cleaning Supplies',
        description: 'Detergents, disinfectants, and cleaning tools',
        icon: '🧹',
        color: '#10B981',
        sortOrder: 2,
      },
      {
        organizationId: demoOrg.id,
        name: 'Guest Amenities',
        description: 'Toiletries and guest room supplies',
        icon: '🧴',
        color: '#F59E0B',
        sortOrder: 3,
      },
    ]);

    logger.info('Created categories');

    // Create locations
    await db.insert(locations).values([
      {
        organizationId: demoOrg.id,
        name: 'Main Storage',
        code: 'MS-01',
        type: 'warehouse',
        capacity: 1000,
      },
      {
        organizationId: demoOrg.id,
        name: 'Floor 1 Storage',
        code: 'F1-01',
        type: 'storage',
        capacity: 200,
      },
      {
        organizationId: demoOrg.id,
        name: 'Floor 2 Storage',
        code: 'F2-01',
        type: 'storage',
        capacity: 200,
      },
    ]);

    logger.info('Created locations');

    // Create inventory items
    await db.insert(inventoryItems).values([
      {
        organizationId: demoOrg.id,
        name: 'Queen Size Bed Sheet',
        sku: 'LIN-QBS-001',
        quantity: 150,
        minQuantity: 50,
        unit: 'pieces',
        category: 'Linen',
        location: 'Main Storage',
        cost: 15.99,
        price: 25.99,
        supplier: 'Linen Direct',
        tags: ['queen', 'bedsheet', 'white'],
      },
      {
        organizationId: demoOrg.id,
        name: 'Bath Towel - White',
        sku: 'LIN-BTW-001',
        quantity: 200,
        minQuantity: 75,
        unit: 'pieces',
        category: 'Linen',
        location: 'Main Storage',
        cost: 8.99,
        price: 14.99,
        supplier: 'Linen Direct',
        tags: ['towel', 'bath', 'white'],
      },
      {
        organizationId: demoOrg.id,
        name: 'All-Purpose Cleaner',
        sku: 'CLN-APC-001',
        quantity: 45,
        minQuantity: 20,
        unit: 'bottles',
        category: 'Cleaning Supplies',
        location: 'Floor 1 Storage',
        cost: 3.99,
        price: 6.99,
        supplier: 'Clean Pro Supplies',
        tags: ['cleaner', 'multipurpose'],
      },
      {
        organizationId: demoOrg.id,
        name: 'Shampoo - 30ml',
        sku: 'AMN-SHP-001',
        quantity: 500,
        minQuantity: 200,
        unit: 'bottles',
        category: 'Guest Amenities',
        location: 'Floor 2 Storage',
        cost: 0.45,
        price: 1.99,
        supplier: 'Guest Comfort Co.',
        tags: ['shampoo', 'amenity', 'guest'],
      },
    ]);

    logger.info('Created inventory items');
    logger.info('Database seeding completed successfully');
    
    logger.info('\n=== Demo Credentials ===');
    logger.info('Admin: admin@demo.com / demo123456');
    logger.info('Manager: manager@demo.com / demo123456');
    logger.info('========================\n');

    process.exit(0);
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();