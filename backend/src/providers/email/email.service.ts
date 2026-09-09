import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SentMessageInfo } from 'nodemailer/lib/smtp-transport';
import { MailOptions } from 'nodemailer/lib/sendmail-transport';

import { SendMailOptions } from './interfaces';

@Injectable()
export class EmailService {

    private email: string;
    private transportes: nodemailer.Transporter<SentMessageInfo>;

    constructor() {
        if (!process.env.MAILER_EMAIL || !process.env.MAILER_SECRET_KEY) {
            throw new Error('MAILER_EMAIL and MAILER_PASSWORD environment variables are required');
        }
        this.email = process.env.MAILER_EMAIL
        this.transportes = nodemailer.createTransport({
            service: process.env.MAILER_SERVICE,
            auth: {
                user: this.email,
                pass: process.env.MAILER_SECRET_KEY
            }
        });
    }

    public async sendEmail(options: SendMailOptions): Promise<boolean> {
        const { to, subject, html, attachments } = options;
        try {
            await this.transportes.sendMail({
                from: this.email,
                to,
                subject,
                html,
                attachments
            } as MailOptions);
            return true;
        } catch (error) {
            return false;
        }
    }
}
