import { Server as SocketServer } from 'socket.io';
import { Redis } from 'ioredis';
import { AuthenticatedSocket } from './socketServer';
import { logger } from '../../utils/logger';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'alert';
  title: string;
  message: string;
  data?: any;
  actions?: Array<{
    label: string;
    action: string;
    data?: any;
  }>;
  persistent?: boolean;
  timestamp: Date;
}

export function handleNotificationEvents(
  io: SocketServer,
  socket: AuthenticatedSocket,
  redis: Redis
) {
  // Mark notification as read
  socket.on('notification:read', async (notificationId: string) => {
    // Update in database
    logger.info(`User ${socket.userId} marked notification ${notificationId} as read`);
    
    // Store in Redis for quick access
    const key = `notifications:read:${socket.userId}`;
    await redis.sadd(key, notificationId);
    await redis.expire(key, 2592000); // 30 days
  });

  // Mark all notifications as read
  socket.on('notifications:readall', async () => {
    logger.info(`User ${socket.userId} marked all notifications as read`);
    
    socket.emit('notifications:allread', {
      timestamp: new Date()
    });
  });

  // Subscribe to specific notification channels
  socket.on('notifications:subscribe', (channels: string[]) => {
    channels.forEach(channel => {
      socket.join(`notify:${channel}`);
    });
    
    socket.emit('notifications:subscribed', {
      channels,
      timestamp: new Date()
    });
  });

  // Handle notification actions
  socket.on('notification:action', (data: { notificationId: string; action: string; data?: any }) => {
    logger.info(`User ${socket.userId} performed action ${data.action} on notification ${data.notificationId}`);
    
    // Emit action performed event
    io.to(`org:${socket.organizationId}:admins`).emit('notification:action:performed', {
      userId: socket.userId,
      ...data,
      timestamp: new Date()
    });
  });
}

// Notification emitters
export function sendNotificationToUser(io: SocketServer, userId: string, notification: Omit<Notification, 'id' | 'timestamp'>) {
  const fullNotification: Notification = {
    ...notification,
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date()
  };

  io.to(`user:${userId}`).emit('notification:new', fullNotification);
}

export function sendNotificationToOrganization(io: SocketServer, organizationId: string, notification: Omit<Notification, 'id' | 'timestamp'>) {
  const fullNotification: Notification = {
    ...notification,
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date()
  };

  io.to(`org:${organizationId}`).emit('notification:new', fullNotification);
}

export function sendNotificationToRole(io: SocketServer, organizationId: string, role: string, notification: Omit<Notification, 'id' | 'timestamp'>) {
  const fullNotification: Notification = {
    ...notification,
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date()
  };

  const room = role === 'admin' ? `org:${organizationId}:admins` : `org:${organizationId}:managers`;
  io.to(room).emit('notification:new', fullNotification);
}

export function broadcastSystemAlert(io: SocketServer, alert: {
  severity: 'info' | 'warning' | 'error';
  message: string;
  data?: any;
}) {
  const notification: Notification = {
    id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: alert.severity === 'error' ? 'error' : alert.severity === 'warning' ? 'warning' : 'info',
    title: 'System Alert',
    message: alert.message,
    data: alert.data,
    persistent: true,
    timestamp: new Date()
  };

  io.emit('notification:system:alert', notification);
}

// Specific notification types
export function notifyLowStock(io: SocketServer, organizationId: string, items: Array<{ id: string; name: string; quantity: number; minQuantity: number }>) {
  const notification: Omit<Notification, 'id' | 'timestamp'> = {
    type: 'warning',
    title: 'Low Stock Alert',
    message: `${items.length} item${items.length > 1 ? 's' : ''} running low on stock`,
    data: { items },
    actions: [
      { label: 'View Items', action: 'navigate', data: { path: '/inventory?filter=lowstock' } },
      { label: 'Create Order', action: 'modal', data: { modal: 'createOrder', items: items.map(i => i.id) } }
    ],
    persistent: true
  };

  sendNotificationToRole(io, organizationId, 'manager', notification);
}

export function notifyOutOfStock(io: SocketServer, organizationId: string, item: { id: string; name: string; sku: string }) {
  const notification: Omit<Notification, 'id' | 'timestamp'> = {
    type: 'error',
    title: 'Out of Stock',
    message: `${item.name} (${item.sku}) is now out of stock`,
    data: { item },
    actions: [
      { label: 'View Item', action: 'navigate', data: { path: `/inventory/${item.id}` } },
      { label: 'Reorder', action: 'modal', data: { modal: 'reorder', itemId: item.id } }
    ],
    persistent: true
  };

  sendNotificationToOrganization(io, organizationId, notification);
}

export function notifyOrderCreated(io: SocketServer, organizationId: string, order: { id: string; items: number; total: number; createdBy: string }) {
  const notification: Omit<Notification, 'id' | 'timestamp'> = {
    type: 'success',
    title: 'New Order Created',
    message: `Order #${order.id} created with ${order.items} items`,
    data: { order },
    actions: [
      { label: 'View Order', action: 'navigate', data: { path: `/orders/${order.id}` } }
    ]
  };

  sendNotificationToRole(io, organizationId, 'manager', notification);
}