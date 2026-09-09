import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

import { UserEntity } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { ROLES } from '../../common/constants';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async findAll() {
    return this.usersRepository.find({ order: { createdAt: 'DESC' } });
  }

  async createUser(createUserDto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(createUserDto.password, Number(process.env.HASH_SALT || 12));
    const now = new Date();
    const user = this.usersRepository.create({
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      username: createUserDto.username,
      email: createUserDto.email,
      password: passwordHash,
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
      company: createUserDto.company || null,
      role: ROLES.USER as any,
      isActive: true,
      emailVerified: false,
    });
    return this.usersRepository.save(user);
  }

  async findOne(id: string) {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async findOneBy({ key, value }: { key: keyof CreateUserDto; value: any }) {
    const user = await this.usersRepository.findOne({ where: { [key]: value } as any });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async findOneAuth(id: string) {
    const user = await this.usersRepository.findOne({ where: { id, isActive: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async update(id: string, data: UpdateUserDto) {
    const user = await this.findOne(id);
    const payload: Partial<UserEntity> = { ...data } as any;
    if (data.password) {
      payload.password = await bcrypt.hash(data.password, Number(process.env.HASH_SALT || 12));
    }
    if (data.firstName !== undefined) payload.firstName = data.firstName;
    if (data.lastName !== undefined) payload.lastName = data.lastName;
    if (data.company !== undefined) payload.company = data.company;
    await this.usersRepository.update(id, payload);
    return this.findOne(user.id);
  }

  async delete(id: string) {
    const user = await this.findOne(id);
    await this.usersRepository.update(user.id, { isActive: false });
    return { statusCode: 200, message: 'Usuario eliminado.' };
  }
}
