import { BadRequestException } from '@nestjs/common';

import { buildChatPayloadFromMultipart, inferAttachmentKind, parseJsonField, readFileBuffer } from './multipart-chat.utils';

describe('multipart-chat utils', () => {
  it('parses json-like fields', () => {
    expect(parseJsonField('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonField('[1,2]')).toEqual([1, 2]);
    expect(parseJsonField('plain')).toBe('plain');
  });

  it('infers attachment kinds', () => {
    expect(inferAttachmentKind('image/png', 'schema.png')).toBe('image');
    expect(inferAttachmentKind('text/plain', 'readme.txt')).toBe('text');
    expect(inferAttachmentKind('application/pdf', 'schema.pdf')).toBe('document');
  });

  it('reads file buffers', async () => {
    const buffer = await readFileBuffer((async function* () {
      yield Buffer.from('a');
      yield Buffer.from('b');
    })());

    expect(buffer.toString('utf8')).toBe('ab');
  });

  it('builds chat payload from multipart parts', async () => {
    async function* parts() {
      yield { type: 'field', fieldname: 'message', value: 'Crea la bd' };
      yield { type: 'field', fieldname: 'diagramData', value: '{"elements":[]}' };
      yield {
        type: 'file',
        fieldname: 'file',
        filename: 'schema.png',
        mimetype: 'image/png',
        file: (async function* () {
          yield Buffer.from('fake-image');
        })(),
      };
      yield {
        type: 'file',
        fieldname: 'file2',
        filename: 'doc.txt',
        mimetype: 'text/plain',
        file: (async function* () {
          yield Buffer.from('users(id)');
        })(),
      };
    }

    const payload = await buildChatPayloadFromMultipart({ parts });

    expect(payload.message).toBe('Crea la bd');
    expect(payload.diagramData).toEqual({ elements: [] });
    expect(payload.attachments).toHaveLength(2);
    expect(payload.attachments?.[0]).toEqual(expect.objectContaining({ kind: 'image', name: 'schema.png', mimeType: 'image/png', base64: expect.any(String) }));
    expect(payload.attachments?.[1]).toEqual(expect.objectContaining({ kind: 'text', name: 'doc.txt', mimeType: 'text/plain', text: 'users(id)' }));
  });

  it('rejects multipart payloads without message', async () => {
    await expect(
      buildChatPayloadFromMultipart({
        parts: async function* () {
          yield { type: 'field', fieldname: 'mode', value: 'agent' };
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
