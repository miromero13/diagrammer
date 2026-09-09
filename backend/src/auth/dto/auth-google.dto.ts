import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

import { AuthGoogleI } from '../interfaces/auth.interface';

export class AuthGoogleDTO implements AuthGoogleI {
  @ApiProperty({
    example: 'tokendegoogle.QWR12rar1AF1SFAF24....',
    type: String,
    description: 'Token Auth Google',
  })
  @IsNotEmpty()
  access_token: string;
}
