import { api } from '@/lib/api'
import type { DiagramContent } from '../models/diagram.model'

export type DiagramChatRole = 'user' | 'assistant'

export type DiagramChatMessage = {
  id: string
  interactionId: string
  role: DiagramChatRole
  content: string
  interactionType: string
  createdAt: string
}

export type DiagramChatConversationTurn = {
  user: string
  ai: string
}

export type DiagramChatMessagesResponse = {
  success: boolean
  diagramId: string
  messages: DiagramChatMessage[]
}

export type DiagramAiChatInput = {
  message: string
  diagramId: string
  diagramData?: DiagramContent | Record<string, unknown>
  conversationHistory?: DiagramChatConversationTurn[]
  sourceText?: string | null
  attachments?: Array<{
    id: string
    file: File
    name: string
    mimeType: string
    kind: 'image' | 'document'
    previewUrl?: string | null
  }>
}

const extractReadableContent = (value: string) => {
  const text = value?.trim()
  if (!text) return value

  try {
    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const payload = fencedMatch?.[1]?.trim() || (() => {
      const firstBrace = text.indexOf('{')
      const lastBrace = text.lastIndexOf('}')
      return firstBrace >= 0 && lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1).trim() : text
    })()

    const parsed = JSON.parse(payload)
    if (parsed?.message && typeof parsed.message === 'string') return parsed.message
  } catch {
    return text
  }

  return text
}

export const diagramsAiService = {
  getDiagramMessages: async (diagramId: string, limit = 100) => {
    const response = await api.get<DiagramChatMessagesResponse>(`/ai/diagrams/${diagramId}/messages?limit=${limit}`)

    return {
      ...response,
      messages: (response.messages || []).map((message) => ({
        ...message,
        content: extractReadableContent(message.content),
      })),
    }
  },

  chat: async (payload: DiagramAiChatInput) => {
    if (payload.attachments?.length) {
      const formData = new FormData()
      formData.append('message', payload.message)
      formData.append('diagramId', payload.diagramId)

      if (payload.diagramData) formData.append('diagramData', JSON.stringify(payload.diagramData))
      if (payload.conversationHistory) formData.append('conversationHistory', JSON.stringify(payload.conversationHistory))
      if (payload.sourceText) formData.append('sourceText', payload.sourceText)

      payload.attachments.forEach((attachment) => {
        formData.append('files', attachment.file, attachment.name)
      })

      return api.post<{ success: boolean; message: string; mode: string; actions?: Array<Record<string, unknown>> }>(
        '/ai/chat',
        formData,
      )
    }

    return api.post<{ success: boolean; message: string; mode: string; actions?: Array<Record<string, unknown>> }>(
      '/ai/chat',
      payload,
    )
  },
}
