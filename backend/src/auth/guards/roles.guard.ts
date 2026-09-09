import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

import { ADMIN_KEY, ROLES, ROLES_KEY } from 'src/common/constants';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const roles = this.reflector.get<Array<ROLES>>(ROLES_KEY, context.getHandler());
    const adminOnly = this.reflector.get<boolean>(ADMIN_KEY, context.getHandler());
    const request = context.switchToHttp().getRequest<any>();
    const roleUser = request.roleUser ?? request.user?.role;

    if (!roles) {
      if (!adminOnly) return true;
      if (roleUser === ROLES.ADMIN) return true;
      throw new UnauthorizedException('No tienes permisos para acceder a esta ruta.');
    }

    if (roleUser === ROLES.ADMIN) return true;

    if (!roles.some((role) => roleUser === role)) {
      throw new UnauthorizedException('No tienes permisos para acceder a esta ruta.');
    }

    return true;
  }
}
