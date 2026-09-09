import type { ChangeEvent, KeyboardEvent, RefObject } from 'react'
import { Bot, FileText, Mic, MicOff, Paperclip, Send, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type ChatAttachment = {
  id: string
  file: File
  name: string
  mimeType: string
  kind: 'image' | 'document'
  previewUrl?: string | null
}

type DiagramChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface DiagramChatSidebarProps {
  messages: DiagramChatMessage[]
  loading: boolean
  error: string | null
  attachments: ChatAttachment[]
  input: string
  sending: boolean
  recordingVoice: boolean
  voiceSupported: boolean
  chatFileInputRef: RefObject<HTMLInputElement>
  chatScrollEndRef: RefObject<HTMLDivElement>
  onRemoveAttachment: (attachmentId: string) => void
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onInputChange: (value: string) => void
  onInputKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onToggleVoiceRecording: () => void
  onSend: () => void
}

export const DiagramChatSidebar = ({
  messages,
  loading,
  error,
  attachments,
  input,
  sending,
  recordingVoice,
  voiceSupported,
  chatFileInputRef,
  chatScrollEndRef,
  onRemoveAttachment,
  onFileChange,
  onInputChange,
  onInputKeyDown,
  onToggleVoiceRecording,
  onSend,
}: DiagramChatSidebarProps) => {
  return (
    <aside className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-background">
      <div className="border-b p-4">
        <div className="flex items-center gap-2 text-base font-medium text-foreground">
          <Bot className="h-4 w-4 text-muted-foreground" />
          Chat IA
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-3 py-3">
        <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-muted/20">
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {loading ? (
              <div className="rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
                Cargando mensajes...
              </div>
            ) : messages.length > 0 ? (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-background text-foreground'}`}
                  >
                    <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                      {message.role === 'user' ? 'Tú' : 'IA'}
                    </div>
                    <div className="whitespace-pre-wrap break-words">
                      {message.content}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
                Aún no hay mensajes para este diagrama.
              </div>
            )}
            <div ref={chatScrollEndRef} />
          </div>

          {error ? (
            <div className="px-3 pb-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          <div className="border-t bg-background p-3">
            {attachments.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="group relative flex w-[160px] overflow-hidden rounded-xl border bg-muted/30"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onRemoveAttachment(attachment.id)
                      }}
                      className="absolute right-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/95 text-muted-foreground shadow-sm opacity-90 transition-opacity hover:text-foreground"
                      aria-label={`Eliminar ${attachment.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {attachment.kind === 'image' && attachment.previewUrl ? (
                      <div className="flex h-24 w-full items-center justify-center bg-black/5">
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-24 w-full items-center justify-center bg-muted/40">
                        <div className="flex flex-col items-center gap-1 px-3 text-center">
                          <FileText className="h-6 w-6 text-muted-foreground" />
                          <span className="line-clamp-2 text-[11px] text-muted-foreground">
                            {attachment.name}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            <div
              className={`relative rounded-md border bg-background transition-all ${recordingVoice ? 'border-destructive/70 bg-destructive/5 shadow-[0_0_0_1px_rgba(239,68,68,0.22)]' : ''}`}
            >
              {recordingVoice ? (
                <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                  Grabando
                </div>
              ) : null}
              <Textarea
                value={recordingVoice ? '' : input}
                onChange={(e) => {
                  onInputChange(e.target.value)
                }}
                onKeyDown={onInputKeyDown}
                placeholder={recordingVoice ? 'Dictando...' : 'Escribe una modificación o consulta...'}
                className="min-h-16 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                readOnly={recordingVoice}
              />
            </div>

            <div className="mt-2 flex w-full items-center justify-between gap-2">
              <input
                ref={chatFileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,.json,.xml,.rtf"
                className="hidden"
                onChange={onFileChange}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    chatFileInputRef.current?.click()
                  }}
                  aria-label="Adjuntar archivo"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={recordingVoice ? 'destructive' : 'outline'}
                  size="icon"
                  onClick={onToggleVoiceRecording}
                  aria-label={recordingVoice ? 'Detener grabación' : 'Grabar voz'}
                  disabled={!voiceSupported}
                  className={recordingVoice ? 'animate-pulse' : undefined}
                >
                  {recordingVoice ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>

                <Button
                  onClick={onSend}
                  disabled={sending}
                  size="icon"
                  aria-label={sending ? 'Enviando mensaje' : 'Enviar mensaje'}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
