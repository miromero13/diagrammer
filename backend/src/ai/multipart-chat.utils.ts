import { BadRequestException } from '@nestjs/common';

import { ChatAiAttachmentDto, ChatAiDto } from './dto/chat-ai.dto';

export type MultipartPart = {
  type: 'field' | 'file';
  fieldname: string;
  value?: string;
  filename?: string;
  mimetype?: string;
  file?: AsyncIterable<Buffer>;
};

export function parseJsonField(value: string) {
  const trimmed = value?.trim();
  if (!trimmed) return value;

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  return value;
}

export async function readFileBuffer(file: AsyncIterable<Buffer>) {
  const chunks: Buffer[] = [];
  for await (const chunk of file) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function inferAttachmentKind(mimeType?: string, filename?: string): ChatAiAttachmentDto['kind'] {
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.startsWith('text/')) return 'text';
  if (mimeType === 'application/json' || mimeType === 'application/xml' || mimeType === 'text/markdown') return 'text';
  if (filename?.match(/\.(txt|md|csv|json|xml|yaml|yml)$/i)) return 'text';
  return 'document';
}

export async function buildChatPayloadFromMultipart(req: any): Promise<ChatAiDto> {
  if (typeof req.parts !== 'function') {
    throw new BadRequestException('Multipart support is not enabled on this request');
  }

  const payload: Record<string, any> = {};
  const attachments: ChatAiAttachmentDto[] = [];

  for await (const part of req.parts() as AsyncIterable<MultipartPart>) {
    if (part.type === 'field') {
      payload[part.fieldname] = parseJsonField(part.value || '');
      continue;
    }

    if (part.type === 'file') {
      const buffer = await readFileBuffer(part.file as AsyncIterable<Buffer>);
      const kind = inferAttachmentKind(part.mimetype, part.filename);
      const isText = kind === 'text';

      attachments.push({
        kind,
        name: part.filename,
        mimeType: part.mimetype,
        ...(isText
          ? { text: buffer.toString('utf8') }
          : { base64: buffer.toString('base64') }),
      });
    }
  }

  if (attachments.length > 0) {
    payload.attachments = [...(Array.isArray(payload.attachments) ? payload.attachments : []), ...attachments];
  }

  if (!payload.message?.trim()) {
    throw new BadRequestException('Message is required');
  }

  return payload as ChatAiDto;
}
