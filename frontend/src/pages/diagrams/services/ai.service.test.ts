import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({ api: { post: vi.fn().mockResolvedValue({ success: true, actions: [] }) } }))

import { api } from '@/lib/api'
import { diagramsAiService } from './ai.service'

describe('diagram chat mode delivery', () => {
  it('sends explicit agent mode for JSON and multipart requests', async () => {
    await diagramsAiService.chat({ message: 'Design a diagram', diagramId: 'diagram', mode: 'agent' })
    expect(api.post).toHaveBeenCalledWith('/ai/chat', expect.objectContaining({ mode: 'agent' }))

    const file = new File(['image'], 'sketch.png', { type: 'image/png' })
    await diagramsAiService.chat({ message: 'Edit this diagram', diagramId: 'diagram', mode: 'agent', attachments: [{ id: 'one', file, name: file.name, mimeType: file.type, kind: 'image' }] })
    const form = vi.mocked(api.post).mock.calls[1][1] as FormData
    expect(form.get('mode')).toBe('agent')
    expect((form.get('files') as File).name).toBe('sketch.png')
  })
})
