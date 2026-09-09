import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

import { UserEntity } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { ConfigService } from '@nestjs/config';

type JwtPayload = {
  userId: string;
  username: string;
  email: string;
  role: UserRole;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly configService: ConfigService,
  ) {}

  private get jwtSecret() {
    return this.configService.get<string>('JWT_AUTH') || this.configService.get<string>('JWT_SECRET') || 'secret';
  }

  private get refreshSecret() {
    return this.configService.get<string>('JWT_RECOVERY') || this.configService.get<string>('JWT_REFRESH_SECRET') || 'refresh-secret';
  }

  private buildUserResponse(user: UserEntity) {
    const { password, ...safeUser } = user;
    return safeUser;
  }

  private async generateTokens(user: UserEntity, remember = false) {
    const payload: JwtPayload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: remember ? '24h' : '15m',
      issuer: 'umlcdp-backend',
      audience: 'umlcdp-frontend',
    });

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      this.refreshSecret,
      {
        expiresIn: remember ? '30d' : '7d',
        issuer: 'umlcdp-backend',
        audience: 'umlcdp-frontend',
      },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: remember ? '24h' : '15m',
    };
  }

  async register(input: {
    username: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    company?: string;
  }) {
    const existingUser = await this.usersRepository.findOne({
      where: [{ email: input.email }, { username: input.username }],
    });

    if (existingUser) {
      throw new ConflictException(existingUser.email === input.email ? 'Este correo electrónico ya está registrado' : 'Este nombre de usuario ya está en uso');
    }

    const passwordHash = await bcrypt.hash(input.password, Number(this.configService.get('HASH_SALT') || 12));
    const now = new Date();

    const user = this.usersRepository.create({
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      username: input.username,
      email: input.email,
      password: passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      company: input.company || null,
      role: UserRole.USER,
      isActive: true,
      emailVerified: false,
      lastLoginAt: null,
      lastLogin: null,
    });

    const savedUser = await this.usersRepository.save(user);
    const tokens = await this.generateTokens(savedUser);

    return {
      user: this.buildUserResponse(savedUser),
      ...tokens,
    };
  }

  async login(emailOrUsername: string, password: string, remember = false) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .where('user.email = :value OR user.username = :value', { value: emailOrUsername })
      .getOne();

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.usersRepository.update(user.id, { lastLoginAt: new Date() });

    const tokens = await this.generateTokens(user, remember);
    const updatedUser = await this.usersRepository.findOneByOrFail({ id: user.id });

    return {
      user: this.buildUserResponse(updatedUser),
      ...tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    if (!refreshToken) {
      throw new BadRequestException('Token de refresh requerido');
    }

    let decoded: { userId: string; type?: string };
    try {
      decoded = jwt.verify(refreshToken, this.refreshSecret, {
        issuer: 'umlcdp-backend',
        audience: 'umlcdp-frontend',
      }) as { userId: string; type?: string };
    } catch (error: any) {
      if (error?.name === 'TokenExpiredError') throw new UnauthorizedException('Token de refresh expirado');
      throw new UnauthorizedException('Token de refresh inválido');
    }

    if (decoded.type !== 'refresh') {
      throw new UnauthorizedException('Token de refresh inválido');
    }

    const user = await this.usersRepository.findOne({
      where: { id: decoded.userId },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    return this.generateTokens(user);
  }

  async getProfile(userId: string) {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return this.buildUserResponse(user);
  }

  async updateProfile(userId: string, input: { firstName?: string; lastName?: string; company?: string; avatar?: string }) {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    await this.usersRepository.update(userId, {
      firstName: input.firstName ?? user.firstName,
      lastName: input.lastName ?? user.lastName,
      company: input.company ?? user.company,
      avatarUrl: input.avatar ?? user.avatarUrl,
    });

    return this.getProfile(userId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new BadRequestException('Contraseña actual incorrecta');

    const passwordHash = await bcrypt.hash(newPassword, Number(this.configService.get('HASH_SALT') || 12));
    await this.usersRepository.update(userId, { password: passwordHash });

    return { message: 'Contraseña actualizada exitosamente' };
  }
}
