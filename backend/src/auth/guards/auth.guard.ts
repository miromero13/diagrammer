import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

import { UserService } from '../../users/services/users.service';
import { userToken } from 'src/common/utils';
import { IUserToken } from '../interfaces/userToken.interface';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = request.headers.authorization?.split(' ')[1];

    if (!token || Array.isArray(token)) {
      throw new UnauthorizedException('Token no encontrado');
    }

    const managerToken: IUserToken | string = userToken(token);
    if (typeof managerToken === 'string') {
      throw new UnauthorizedException(managerToken);
    }

    if (managerToken.isExpired) {
      throw new UnauthorizedException('Token expirado');
    }

    const user = await this.userService.findOneAuth(managerToken.sub);
    request.idUser = user.id;
    request.roleUser = user.role;
    return true;
  }
}
