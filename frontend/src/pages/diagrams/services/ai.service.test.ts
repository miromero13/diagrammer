import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({ api: { post: vi.fn().mockResolvedValue({ success: true, actions: [] }) } }))

import { api } from '@/lib/api'
import { diagramsAiService } from './ai.service'
import { socketManager } from '../socketManager'

describe('diagram chat mode delivery', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('delivers image-only requests without forcing a frontend intent', async () => {
    const file = new File(['image'], 'sketch.png', { type: 'image/png' })
    await diagramsAiService.chat({ message: '', diagramId: 'current', attachments: [{ id: 'one', file, name: file.name, mimeType: file.type, kind: 'image' }] })
    const form = vi.mocked(api.post).mock.calls.at(-1)?.[1] as FormData
    expect(form.get('message')).toBe('')
    expect(form.get('mode')).toBeNull()
    expect(form.get('diagramId')).toBe('current')
    expect((form.get('files') as File).name).toBe('sketch.png')
  })
  it('sends explicit agent mode for JSON and multipart requests', async () => {
    await diagramsAiService.chat({ message: 'Design a diagram', diagramId: 'diagram', mode: 'agent' })
    expect(api.post).toHaveBeenCalledWith('/ai/chat', expect.objectContaining({ mode: 'agent' }))

    const file = new File(['image'], 'sketch.png', { type: 'image/png' })
    await diagramsAiService.chat({ message: 'Edit this diagram', diagramId: 'diagram', mode: 'agent', attachments: [{ id: 'one', file, name: file.name, mimeType: file.type, kind: 'image' }] })
    const form = vi.mocked(api.post).mock.calls[1][1] as FormData
    expect(form.get('mode')).toBe('agent')
    expect((form.get('files') as File).name).toBe('sketch.png')
  })

  it('relays a committed diagram event to requesting and peer canvases', () => {
    const handlers = new Map<string, (payload: unknown) => void>()
    socketManager.socket = { on: (event: string, handler: (payload: unknown) => void) => { handlers.set(event, handler) } } as any
    const sender = vi.fn()
    const peer = vi.fn()
    socketManager.on('diagramContentSaved', sender)
    socketManager.on('diagramContentSaved', peer)
    socketManager.setupEventHandlers()
    const update = { diagramId: 'current', content: { elements: [{ id: 'new' }] } }
    handlers.get('diagramContentSaved')?.(update)
    expect(sender).toHaveBeenCalledWith(update)
    expect(peer).toHaveBeenCalledWith(update)
    socketManager.off('diagramContentSaved', sender)
    socketManager.off('diagramContentSaved', peer)
    socketManager.socket = null
  })
})
