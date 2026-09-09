import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

import { ResetPasswordI } from '../interfaces/auth.interface';

export class ResetPasswordDTO implements ResetPasswordI {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI....',
    type: String,
    description: 'Token JWT',
  })
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    example: '123456789',
    type: String,
    description: 'Nueva Contraseña del usuario',
  })
  @IsNotEmpty()
  @IsString()
  password: string;
}
