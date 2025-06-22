import { Server as SocketServer } from 'socket.io';
import { Redis } from 'ioredis';
import { AuthenticatedSocket } from './socketServer';
import { logger } from '../../utils/logger';

interface UserActivity {
  userId: string;
  action: string;
  resource: string;
  details?: any;
  timestamp: Date;
}

export function handleUserEvents(
  io: SocketServer,
  socket: AuthenticatedSocket,
  redis: Redis
) {
  // Track user activity
  socket.on('user:activity', (activity: Omit<UserActivity, 'userId' | 'timestamp'>) => {
    const fullActivity: UserActivity = {
      ...activity,
      userId: socket.userId!,
      timestamp: new Date()
    };

    // Broadcast to organization admins
    io.to(`org:${socket.organizationId}:admins`).emit('user:activity:update', fullActivity);

    // Store in Redis for recent activity
    const key = `activity:${socket.organizationId}`;
    redis.lpush(key, JSON.stringify(fullActivity));
    redis.ltrim(key, 0, 99); // Keep last 100 activities
    redis.expire(key, 86400); // 24 hours
  });

  // User presence updates
  socket.on('user:presence:update', (status: { status: 'active' | 'idle' | 'away' }) => {
    socket.to(`org:${socket.organizationId}`).emit('user:presence:changed', {
      userId: socket.userId,
      ...status,
      timestamp: new Date()
    });
  });

  // User typing indicators (for collaborative features)
  socket.on('user:typing:start', (context: { resource: string; resourceId: string }) => {
    socket.to(`org:${socket.organizationId}`).emit('user:typing', {
      userId: socket.userId,
      ...context,
      isTyping: true,
      timestamp: new Date()
    });
  });

  socket.on('user:typing:stop', (context: { resource: string; resourceId: string }) => {
    socket.to(`org:${socket.organizationId}`).emit('user:typing', {
      userId: socket.userId,
      ...context,
      isTyping: false,
      timestamp: new Date()
    });
  });

  // User location updates (for mobile users)
  socket.on('user:location:update', (location: { area: string; details?: any }) => {
    // Only broadcast to managers and admins
    io.to(`org:${socket.organizationId}:managers`).emit('user:location:changed', {
      userId: socket.userId,
      ...location,
      timestamp: new Date()
    });
  });

  // Join role-specific rooms
  if (socket.role === 'org_admin' || socket.role === 'system_admin') {
    socket.join(`org:${socket.organizationId}:admins`);
  }
  if (socket.role === 'manager' || socket.role === 'org_admin' || socket.role === 'system_admin') {
    socket.join(`org:${socket.organizationId}:managers`);
  }
}

// User event emitters (called from routes)
export function emitUserCreated(io: SocketServer, organizationId: string, user: any) {
  io.to(`org:${organizationId}:admins`).emit('user:created', {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    timestamp: new Date()
  });
}

export function emitUserUpdated(io: SocketServer, organizationId: string, user: any, changes: any) {
  io.to(`org:${organizationId}`).emit('user:updated', {
    userId: user.id,
    changes,
    timestamp: new Date()
  });
}

export function emitUserDeactivated(io: SocketServer, organizationId: string, userId: string) {
  io.to(`org:${organizationId}`).emit('user:deactivated', {
    userId,
    timestamp: new Date()
  });
}

export function emitPasswordChanged(io: SocketServer, userId: string) {
  // Notify only the specific user
  io.to(`user:${userId}`).emit('user:password:changed', {
    message: 'Your password has been changed. Please log in again.',
    timestamp: new Date()
  });
}

export function emitRoleChanged(io: SocketServer, organizationId: string, userId: string, oldRole: string, newRole: string) {
  // Notify the organization
  io.to(`org:${organizationId}`).emit('user:role:changed', {
    userId,
    oldRole,
    newRole,
    timestamp: new Date()
  });

  // Notify the specific user
  io.to(`user:${userId}`).emit('user:role:updated', {
    newRole,
    message: `Your role has been updated to ${newRole}`,
    timestamp: new Date()
  });
}