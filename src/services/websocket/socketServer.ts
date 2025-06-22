import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { Redis } from 'ioredis';
import { db } from '../../config/database';
import { users, sessions } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../../utils/logger';
import { handleInventoryEvents } from './inventoryEvents';
import { handleUserEvents } from './userEvents';
import { handleNotificationEvents } from './notificationEvents';

// Redis for scalable pub/sub
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const subscriber = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  organizationId?: string;
  role?: string;
}

export class WebSocketService {
  public io: SocketServer;
  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> socketIds

  constructor(httpServer: HttpServer) {
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || '*',
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupRedisSubscriptions();
    this.setupSocketHandlers();
  }

  private setupRedisSubscriptions() {
    subscriber.subscribe('inventory:updates', 'user:updates', 'notifications');
    
    subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        
        switch (channel) {
          case 'inventory:updates':
            this.broadcastToOrganization(data.organizationId, data.event, data.payload);
            break;
          case 'user:updates':
            this.broadcastToUser(data.userId, data.event, data.payload);
            break;
          case 'notifications':
            this.broadcastNotification(data);
            break;
        }
      } catch (error) {
        logger.error('Redis message error:', error);
      }
    });
  }

  private setupSocketHandlers() {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
          userId: string;
          sessionId: string;
        };

        // Verify session
        const [session] = await db
          .select()
          .from(sessions)
          .where(eq(sessions.id, decoded.sessionId))
          .limit(1);

        if (!session || session.expiresAt < new Date()) {
          return next(new Error('Session expired'));
        }

        // Get user details
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, decoded.userId))
          .limit(1);

        if (!user || !user.isActive) {
          return next(new Error('User not found or inactive'));
        }

        // Attach user info to socket
        socket.userId = user.id;
        socket.organizationId = user.organizationId;
        socket.role = user.role;

        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      logger.info(`User ${socket.userId} connected`);

      // Track connected users
      this.addConnectedUser(socket.userId!, socket.id);

      // Join organization room
      socket.join(`org:${socket.organizationId}`);
      socket.join(`user:${socket.userId}`);

      // Emit user online event
      this.broadcastToOrganization(
        socket.organizationId!,
        'user:online',
        { userId: socket.userId, timestamp: new Date() }
      );

      // Setup event handlers
      handleInventoryEvents(this.io, socket, redis);
      handleUserEvents(this.io, socket, redis);
      handleNotificationEvents(this.io, socket, redis);

      // Handle disconnect
      socket.on('disconnect', () => {
        logger.info(`User ${socket.userId} disconnected`);
        this.removeConnectedUser(socket.userId!, socket.id);

        // Emit user offline event if no more connections
        if (!this.isUserConnected(socket.userId!)) {
          this.broadcastToOrganization(
            socket.organizationId!,
            'user:offline',
            { userId: socket.userId, timestamp: new Date() }
          );
        }
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error('Socket error:', error);
      });
    });
  }

  private addConnectedUser(userId: string, socketId: string) {
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId)!.add(socketId);
  }

  private removeConnectedUser(userId: string, socketId: string) {
    const userSockets = this.connectedUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.connectedUsers.delete(userId);
      }
    }
  }

  private isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  public broadcastToOrganization(organizationId: string, event: string, data: any) {
    this.io.to(`org:${organizationId}`).emit(event, data);
  }

  public broadcastToUser(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  public broadcastNotification(data: {
    type: 'organization' | 'user' | 'global';
    targetId?: string;
    event: string;
    payload: any;
  }) {
    switch (data.type) {
      case 'organization':
        this.broadcastToOrganization(data.targetId!, data.event, data.payload);
        break;
      case 'user':
        this.broadcastToUser(data.targetId!, data.event, data.payload);
        break;
      case 'global':
        this.io.emit(data.event, data.payload);
        break;
    }
  }

  public getConnectedUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }

  public getOnlineUsersInOrganization(organizationId: string): Promise<string[]> {
    return new Promise((resolve) => {
      const users: string[] = [];
      const room = this.io.sockets.adapter.rooms.get(`org:${organizationId}`);
      
      if (room) {
        room.forEach((socketId) => {
          const socket = this.io.sockets.sockets.get(socketId) as AuthenticatedSocket;
          if (socket?.userId && !users.includes(socket.userId)) {
            users.push(socket.userId);
          }
        });
      }
      
      resolve(users);
    });
  }

  // Publish events to Redis for multi-server setup
  public publishInventoryUpdate(organizationId: string, event: string, payload: any) {
    redis.publish('inventory:updates', JSON.stringify({
      organizationId,
      event,
      payload,
      timestamp: new Date(),
    }));
  }

  public publishUserUpdate(userId: string, event: string, payload: any) {
    redis.publish('user:updates', JSON.stringify({
      userId,
      event,
      payload,
      timestamp: new Date(),
    }));
  }

  public publishNotification(type: 'organization' | 'user' | 'global', targetId: string | undefined, event: string, payload: any) {
    redis.publish('notifications', JSON.stringify({
      type,
      targetId,
      event,
      payload,
      timestamp: new Date(),
    }));
  }
}

// Export singleton instance
let socketService: WebSocketService | null = null;

export function initializeWebSocket(httpServer: HttpServer): WebSocketService {
  if (!socketService) {
    socketService = new WebSocketService(httpServer);
  }
  return socketService;
}

export function getWebSocketService(): WebSocketService {
  if (!socketService) {
    throw new Error('WebSocket service not initialized');
  }
  return socketService;
}