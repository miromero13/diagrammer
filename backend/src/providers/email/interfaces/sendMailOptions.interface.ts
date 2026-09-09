import { Attachment } from "./attachment.interface";

export interface SendMailOptions {
    to: string | string[];
    subject: string;
    html: string;
    attachments?: Attachment[];
}
