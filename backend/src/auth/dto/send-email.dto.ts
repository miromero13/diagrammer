import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsEmail } from 'class-validator';

import { SendEmailI } from '../interfaces/auth.interface';

export class SendEmailDTO implements SendEmailI {
    @ApiProperty({
        example: 'luis@gmail.com',
        type: String,
        description: 'Correo electrónico'
    })
    @IsNotEmpty()
    @IsEmail()
    email: string;
}
