import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEmail } from 'class-validator';

import { AuthI } from '../interfaces/auth.interface';

export class AuthDTO implements AuthI {
  @ApiProperty({
    example: 'luis@gmail.com',
    type: String,
    description: 'Correo electrónico',
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '12345678',
    type: String,
    description: 'Contraseña del usuario',
  })
  @IsNotEmpty()
  @IsString()
  password: string;
}
