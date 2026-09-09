import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import * as jwt from 'jsonwebtoken';

import { UserEntity } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { PUBLIC_KEY } from 'src/common/constants';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: UserEntity; roleUser?: UserRole }>();
    const tokenFromHeader = request.headers.authorization?.split(' ')[1];
    const tokenFromQuery = (request.query as Record<string, string> | undefined)?.token;
    const token = tokenFromHeader || tokenFromQuery;

    if (!token) throw new UnauthorizedException('Token de acceso requerido');

    try {
      const decoded = jwt.verify(token, this.configService.get<string>('JWT_AUTH') || this.configService.get<string>('JWT_SECRET') || 'secret', {
        issuer: 'umlcdp-backend',
        audience: 'umlcdp-frontend',
      }) as { userId: string; role: UserRole };

      const user = await this.usersRepository.findOne({
        where: { id: decoded.userId, isActive: true },
      });

      if (!user) throw new UnauthorizedException('Usuario no encontrado o inactivo');

      request.user = user;
      request.roleUser = user.role;
      return true;
    } catch (error: any) {
      if (error?.name === 'TokenExpiredError') throw new UnauthorizedException('Token expirado');
      throw new UnauthorizedException('Token inválido');
    }
  }
}
