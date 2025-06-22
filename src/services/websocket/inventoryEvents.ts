import { Server as SocketServer } from 'socket.io';
import { Redis } from 'ioredis';
import { AuthenticatedSocket } from './socketServer';
import { logger } from '../../utils/logger';

export function handleInventoryEvents(
  io: SocketServer,
  socket: AuthenticatedSocket,
  redis: Redis
) {
  // Subscribe to inventory updates for the organization
  socket.on('inventory:subscribe', async () => {
    logger.info(`User ${socket.userId} subscribed to inventory updates`);
    
    // User is already in organization room from connection
    socket.emit('inventory:subscribed', { 
      organizationId: socket.organizationId,
      timestamp: new Date() 
    });
  });

  // Handle real-time inventory search
  socket.on('inventory:search', async (query: string) => {
    // This could be enhanced with Redis search or Elasticsearch
    socket.emit('inventory:search:results', {
      query,
      results: [], // Implement search logic
      timestamp: new Date()
    });
  });

  // Handle inventory filter updates
  socket.on('inventory:filter:update', (filters: any) => {
    // Broadcast filter changes to other users in the organization
    socket.to(`org:${socket.organizationId}`).emit('inventory:filter:changed', {
      userId: socket.userId,
      filters,
      timestamp: new Date()
    });
  });

  // Handle collaborative editing
  socket.on('inventory:item:editing', (itemId: string) => {
    // Notify others that someone is editing this item
    socket.to(`org:${socket.organizationId}`).emit('inventory:item:locked', {
      itemId,
      lockedBy: socket.userId,
      timestamp: new Date()
    });
  });

  socket.on('inventory:item:editing:done', (itemId: string) => {
    // Release the lock
    socket.to(`org:${socket.organizationId}`).emit('inventory:item:unlocked', {
      itemId,
      unlockedBy: socket.userId,
      timestamp: new Date()
    });
  });

  // Handle bulk operations
  socket.on('inventory:bulk:start', (operation: { type: string; itemIds: string[] }) => {
    socket.to(`org:${socket.organizationId}`).emit('inventory:bulk:inprogress', {
      operation,
      startedBy: socket.userId,
      timestamp: new Date()
    });
  });

  // Low stock alert acknowledgment
  socket.on('inventory:lowstock:acknowledge', (itemId: string) => {
    socket.to(`org:${socket.organizationId}`).emit('inventory:lowstock:acknowledged', {
      itemId,
      acknowledgedBy: socket.userId,
      timestamp: new Date()
    });
  });
}

// Inventory event emitters (called from routes)
export function emitInventoryCreated(io: SocketServer, organizationId: string, item: any) {
  io.to(`org:${organizationId}`).emit('inventory:item:created', item);
}

export function emitInventoryUpdated(io: SocketServer, organizationId: string, item: any, changes: any) {
  io.to(`org:${organizationId}`).emit('inventory:item:updated', {
    item,
    changes
  });
}

export function emitInventoryDeleted(io: SocketServer, organizationId: string, itemId: string) {
  io.to(`org:${organizationId}`).emit('inventory:item:deleted', itemId);
}

export function emitQuantityChanged(io: SocketServer, organizationId: string, data: {
  itemId: string;
  previousQuantity: number;
  newQuantity: number;
  reason?: string;
  userId: string;
}) {
  io.to(`org:${organizationId}`).emit('inventory:quantity:changed', data);

  // Check for low stock and emit alert
  if (data.newQuantity <= 0) {
    io.to(`org:${organizationId}`).emit('inventory:outofstock:alert', data.itemId);
  }
}

export function emitLowStockAlert(io: SocketServer, organizationId: string, items: any[]) {
  io.to(`org:${organizationId}`).emit('inventory:lowstock:alert', items);
}

export function emitInventoryMovement(io: SocketServer, organizationId: string, movement: any) {
  io.to(`org:${organizationId}`).emit('inventory:movement:created', movement);
}

export function emitInventoryCount(io: SocketServer, organizationId: string, count: any) {
  io.to(`org:${organizationId}`).emit('inventory:count:completed', count);
}

export function emitBulkOperationComplete(io: SocketServer, organizationId: string, operation: {
  type: string;
  itemIds: string[];
  success: number;
  failed: number;
  userId: string;
}) {
  io.to(`org:${organizationId}`).emit('inventory:bulk:complete', {
    operation,
    timestamp: new Date()
  });
}

export function emitOutOfStockAlert(io: SocketServer, organizationId: string, itemId: string) {
  io.to(`org:${organizationId}`).emit('inventory:outofstock:alert', itemId);
}