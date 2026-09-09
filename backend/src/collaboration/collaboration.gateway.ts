import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';

import { DiagramEntity } from '../diagrams/entities/diagram.entity';
import { UserEntity } from '../users/entities/user.entity';
import { CollaborationStateService } from './collaboration-state.service';

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class CollaborationGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CollaborationGateway.name);
  private lockTimer: NodeJS.Timeout;

  constructor(
    @InjectRepository(UserEntity) private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(DiagramEntity) private readonly diagramRepository: Repository<DiagramEntity>,
    private readonly configService: ConfigService,
    private readonly state: CollaborationStateService,
  ) {}

  afterInit(server: Server) {
    this.server = server;
    this.server.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.split(' ')[1];
        if (!token) return next(new Error('Token de autenticación requerido'));

        const secret = this.configService.get<string>('JWT_AUTH') || this.configService.get<string>('JWT_SECRET') || 'secret';
        const decoded = jwt.verify(token, secret) as { userId?: string; id?: string };
        const userId = decoded.userId || decoded.id;
        if (!userId) return next(new Error('Token inválido'));

        const user = await this.userRepository.findOne({ where: { id: userId }, select: ['id', 'username', 'email', 'firstName', 'lastName', 'isActive'] });
        if (!user || !user.isActive) return next(new Error('Usuario no encontrado o inactivo'));

        socket.data.user = user;
        socket.data.userId = user.id;
        next();
      } catch (error: any) {
        this.logger.warn(`Socket auth failed: ${error?.message || error}`);
        next(new Error('Token inválido'));
      }
    });

    this.lockTimer = setInterval(() => this.autoUnlockExpiredLocks(), 30000);
  }

  async handleConnection(client: Socket) {
    const user = client.data.user as UserEntity;
    client.join(`user:${user.id}`);

    client.on('diagram:join', async (diagramId: string) => this.handleDiagramJoin(client, diagramId));
    client.on('diagram:leave', (diagramId: string) => this.handleDiagramLeave(client, diagramId));
    client.on('diagram:element:add', (data) => this.handleElementAdd(client, data));
    client.on('diagram:element:update', (data) => this.handleElementUpdate(client, data));
    client.on('diagram:element:delete', (data) => this.handleElementDelete(client, data));
    client.on('element:lock', (data) => this.handleElementLock(client, data));
    client.on('element:unlock', (data) => this.handleElementUnlock(client, data));
    client.on('element:select', (data) => this.handleElementSelect(client, data));
    client.on('element:deselect', (data) => this.handleElementDeselect(client, data));
    client.on('cursor:move', (data) => this.handleCursorMove(client, data));
    client.on('ping', () => client.emit('pong'));

    this.logger.log(`Cliente conectado: ${user.username}`);
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as UserEntity | undefined;
    if (!user) return;

    const currentDiagram = client.data.currentDiagram as string | undefined;
    if (currentDiagram) {
      this.cleanupElementLocks(user.id, currentDiagram);
      this.cleanupElementSelections(user.id, currentDiagram);
      this.removeUserFromDiagram(currentDiagram, user.id);
      this.server.to(`diagram:${currentDiagram}`).emit('usersUpdated', this.getUsersInDiagram(currentDiagram));
    }

    this.state.cursorPositions.delete(user.id);
    this.logger.log(`Usuario desconectado: ${user.username}`);
  }

  private getUsersInDiagram(diagramId: string) {
    const room = this.server.sockets.adapter.rooms.get(`diagram:${diagramId}`);
    const users: Array<Partial<UserEntity>> = [];
    if (!room) return users;

    for (const socketId of room) {
      const socket = this.server.sockets.sockets.get(socketId);
      const user = socket?.data.user as UserEntity | undefined;
      if (user) {
        users.push({ id: user.id, username: user.username, firstName: user.firstName, lastName: user.lastName });
      }
    }
    return users;
  }

  private removeUserFromDiagram(diagramId: string, userId: string) {
    this.state.diagramUsers.get(diagramId)?.delete(userId);
  }

  private cleanupElementLocks(userId: string, diagramId: string) {
    const toRemove: string[] = [];
    this.state.elementLocks.forEach((lock, elementId) => {
      if (lock.userId === userId && lock.diagramId === diagramId) toRemove.push(elementId);
    });

    toRemove.forEach((elementId) => {
      this.state.elementLocks.delete(elementId);
      this.server.to(`diagram:${diagramId}`).emit('element:unlocked', { elementId, unlockedBy: userId, reason: 'user_disconnected' });
    });
  }

  private cleanupElementSelections(userId: string, diagramId: string) {
    const toRemove: string[] = [];
    this.state.elementSelections.forEach((selection, elementId) => {
      if (selection.userId === userId && selection.diagramId === diagramId) toRemove.push(elementId);
    });

    toRemove.forEach((elementId) => {
      this.state.elementSelections.delete(elementId);
      this.server.to(`diagram:${diagramId}`).emit('elementDeselected', { elementId, deselectedBy: userId, reason: 'user_disconnected' });
    });
  }

  private autoUnlockExpiredLocks() {
    const now = Date.now();
    for (const [elementId, lock] of this.state.elementLocks.entries()) {
      if (now - lock.timestamp > 30000) {
        this.state.elementLocks.delete(elementId);
        this.server.to(`diagram:${lock.diagramId}`).emit('element:unlocked', { elementId, unlockedBy: lock.userId, reason: 'timeout' });
      }
    }
  }

  private async handleDiagramJoin(client: Socket, diagramId: string) {
    const user = client.data.user as UserEntity;
    const diagram = await this.diagramRepository.findOne({ where: { id: diagramId } });
    if (!diagram) return client.emit('error', { message: 'Diagrama no encontrado' });

    client.join(`diagram:${diagramId}`);
    client.data.currentDiagram = diagramId;

    if (!this.state.diagramUsers.has(diagramId)) this.state.diagramUsers.set(diagramId, new Set());
    this.state.diagramUsers.get(diagramId)!.add(user.id);

    const connectedUsers = this.getUsersInDiagram(diagramId);
    client.to(`diagram:${diagramId}`).emit('userJoined', { user: { id: user.id, username: user.username, firstName: user.firstName, lastName: user.lastName } });
    this.server.to(`diagram:${diagramId}`).emit('usersUpdated', connectedUsers);

    const lockedElements: Record<string, { userId: string; timestamp: number }> = {};
    this.state.elementLocks.forEach((lock, elementId) => {
      if (lock.diagramId === diagramId) lockedElements[elementId] = { userId: lock.userId, timestamp: lock.timestamp };
    });
    client.emit('lockedElements', lockedElements);

    const selectedElements: Record<string, { userId: string; timestamp: number }> = {};
    this.state.elementSelections.forEach((selection, elementId) => {
      if (selection.diagramId === diagramId) selectedElements[elementId] = { userId: selection.userId, timestamp: selection.timestamp };
    });
    client.emit('selectedElements', selectedElements);
  }

  private handleDiagramLeave(client: Socket, diagramId: string) {
    const user = client.data.user as UserEntity;
    client.leave(`diagram:${diagramId}`);
    this.removeUserFromDiagram(diagramId, user.id);
    this.cleanupElementLocks(user.id, diagramId);
    client.to(`diagram:${diagramId}`).emit('userLeft', { user: { id: user.id, username: user.username, firstName: user.firstName, lastName: user.lastName } });
    this.server.to(`diagram:${diagramId}`).emit('usersUpdated', this.getUsersInDiagram(diagramId));
    client.data.currentDiagram = null;
  }

  private async handleElementAdd(client: Socket, data: any) {
    const { diagramId, element } = data || {};
    const user = client.data.user as UserEntity;
    if (!client.data.currentDiagram || client.data.currentDiagram !== diagramId) return client.emit('error', { message: 'No estás conectado a este diagrama' });
    if (!element?.id) return client.emit('error', { message: 'Elemento inválido' });
    const diagram = await this.diagramRepository.findOne({ where: { id: diagramId } });
    if (!diagram) return client.emit('error', { message: 'Diagrama no encontrado' });

    const elementWithUser = { ...element, createdBy: user.id, createdAt: new Date().toISOString() };
    client.to(`diagram:${diagramId}`).emit('elementAdded', { element: elementWithUser, user });
    client.emit('elementAddedConfirm', { elementId: element.id, success: true });
  }

  private async handleElementUpdate(client: Socket, data: any) {
    const { diagramId, elementId, changes } = data || {};
    const user = client.data.user as UserEntity;
    if (!client.data.currentDiagram || client.data.currentDiagram !== diagramId) return client.emit('error', { message: 'No estás conectado a este diagrama' });
    if (!elementId || !changes) return client.emit('error', { message: 'Datos de actualización inválidos' });

    const lock = this.state.elementLocks.get(elementId);
    if (lock && lock.userId !== user.id) return client.emit('error', { message: 'Elemento bloqueado por otro usuario', elementId, lockedBy: lock.userId });

    const diagram = await this.diagramRepository.findOne({ where: { id: diagramId } });
    if (!diagram) return client.emit('error', { message: 'Diagrama no encontrado' });

    client.to(`diagram:${diagramId}`).emit('elementUpdated', { elementId, changes, updatedBy: user.id, updatedAt: new Date().toISOString(), user });
    client.emit('elementUpdatedConfirm', { elementId, success: true });
  }

  private async handleElementDelete(client: Socket, data: any) {
    const { diagramId, elementId } = data || {};
    const user = client.data.user as UserEntity;
    if (!client.data.currentDiagram || client.data.currentDiagram !== diagramId) return client.emit('error', { message: 'No estás conectado a este diagrama' });
    if (!elementId) return client.emit('error', { message: 'ID de elemento requerido' });

    const lock = this.state.elementLocks.get(elementId);
    if (lock && lock.userId !== user.id) return client.emit('error', { message: 'Elemento bloqueado por otro usuario', elementId, lockedBy: lock.userId });

    const diagram = await this.diagramRepository.findOne({ where: { id: diagramId } });
    if (!diagram) return client.emit('error', { message: 'Diagrama no encontrado' });

    this.state.elementLocks.delete(elementId);
    client.to(`diagram:${diagramId}`).emit('elementDeleted', { elementId, deletedBy: user.id, deletedAt: new Date().toISOString(), user });
    client.emit('elementDeletedConfirm', { elementId, success: true });
  }

  private handleElementLock(client: Socket, data: any) {
    const { diagramId, elementId } = data || {};
    const user = client.data.user as UserEntity;
    if (!client.data.currentDiagram || client.data.currentDiagram !== diagramId) return client.emit('error', { message: 'No estás conectado a este diagrama' });

    const existingLock = this.state.elementLocks.get(elementId);
    if (existingLock && existingLock.userId !== user.id) return client.emit('elementLockFailed', { elementId, reason: 'already_locked', lockedBy: existingLock.userId });

    this.state.elementLocks.set(elementId, { userId: user.id, diagramId, timestamp: Date.now() });
    client.to(`diagram:${diagramId}`).emit('elementLocked', { elementId, lockedBy: user.id, user, timestamp: new Date().toISOString() });
    client.emit('elementLockSuccess', { elementId });
  }

  private handleElementUnlock(client: Socket, data: any) {
    const { diagramId, elementId } = data || {};
    const user = client.data.user as UserEntity;
    if (!client.data.currentDiagram || client.data.currentDiagram !== diagramId) return client.emit('error', { message: 'No estás conectado a este diagrama' });

    const lock = this.state.elementLocks.get(elementId);
    if (!lock || lock.userId !== user.id) return client.emit('error', { message: 'No puedes desbloquear este elemento', elementId });

    this.state.elementLocks.delete(elementId);
    client.to(`diagram:${diagramId}`).emit('elementUnlocked', { elementId, unlockedBy: user.id, user, timestamp: new Date().toISOString() });
    client.to(`diagram:${diagramId}`).emit('element:unlocked', { elementId, unlockedBy: user.id, reason: 'manual' });
  }

  private handleElementSelect(client: Socket, data: any) {
    const { diagramId, elementId } = data || {};
    const user = client.data.user as UserEntity;
    if (!client.data.currentDiagram || client.data.currentDiagram !== diagramId) return client.emit('error', { message: 'No estás conectado a este diagrama' });
    if (!elementId) return client.emit('error', { message: 'ID de elemento requerido' });

    const diagram = this.state.diagramUsers.get(diagramId);
    if (!diagram) return client.emit('error', { message: 'Diagrama no encontrado' });

    const previousSelection = Array.from(this.state.elementSelections.entries()).find(([, selection]) => selection.userId === user.id && selection.diagramId === diagramId);
    if (previousSelection && previousSelection[0] !== elementId) {
      this.state.elementSelections.delete(previousSelection[0]);
      this.server.to(`diagram:${diagramId}`).emit('elementDeselected', {
        elementId: previousSelection[0],
        deselectedBy: user.id,
        reason: 'replaced',
      });
    }

    this.state.elementSelections.set(elementId, { userId: user.id, diagramId, timestamp: Date.now() });
    client.to(`diagram:${diagramId}`).emit('elementSelected', { elementId, selectedBy: user.id, user, timestamp: new Date().toISOString() });
    client.emit('elementSelectConfirm', { elementId, success: true });
  }

  private handleElementDeselect(client: Socket, data: any) {
    const { diagramId, elementId } = data || {};
    const user = client.data.user as UserEntity;
    if (!client.data.currentDiagram || client.data.currentDiagram !== diagramId) return client.emit('error', { message: 'No estás conectado a este diagrama' });
    if (!elementId) return;

    const selection = this.state.elementSelections.get(elementId);
    if (!selection || selection.userId !== user.id) return;

    this.state.elementSelections.delete(elementId);
    client.to(`diagram:${diagramId}`).emit('elementDeselected', { elementId, deselectedBy: user.id, user, timestamp: new Date().toISOString() });
  }

  private handleCursorMove(client: Socket, data: any) {
    const { diagramId, position } = data || {};
    const user = client.data.user as UserEntity;
    if (!client.data.currentDiagram || client.data.currentDiagram !== diagramId) return;

    this.state.cursorPositions.set(user.id, { position, diagramId, timestamp: Date.now() });
    client.to(`diagram:${diagramId}`).emit('cursorMoved', { userId: user.id, username: user.username, firstName: user.firstName, position, timestamp: new Date().toISOString() });
  }
}
