import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DiagramChatSidebar } from './diagram-chat-sidebar'

const renderSidebar = (overrides: Partial<Parameters<typeof DiagramChatSidebar>[0]> = {}) => render(
  <DiagramChatSidebar
    messages={[]}
    loading={false}
    error={null}
    attachments={[]}
    input=""
    sending={false}
    recordingVoice={false}
    voiceSupported={false}
    chatFileInputRef={createRef<HTMLInputElement>()}
    chatScrollEndRef={createRef<HTMLDivElement>()}
    onRemoveAttachment={() => {}}
    onFileChange={() => {}}
    onInputChange={() => {}}
    onInputKeyDown={() => {}}
    onToggleVoiceRecording={() => {}}
    onSend={() => {}}
    onRetry={() => {}}
    {...overrides}
  />,
)

describe('DiagramChatSidebar transient attempts', () => {
  it('shows an immediate sending status for an optimistic user message', () => {
    renderSidebar({ messages: [{ id: 'attempt-1', role: 'user', content: 'create class User', attemptState: 'sending' }] })

    expect(screen.getByText('create class User')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Enviando')
  })

  it('styles a failed message and exposes retry for its original id', () => {
    const onRetry = vi.fn()
    renderSidebar({ messages: [{ id: 'attempt-1', role: 'user', content: 'create class User', attemptState: 'failed' }], onRetry })

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar envío: create class User' }))

    expect(onRetry).toHaveBeenCalledWith('attempt-1')
    expect(screen.getByText('create class User').parentElement).toHaveClass('text-destructive')
  })

  it('replaces the transient status with confirmed history after success', () => {
    renderSidebar({ messages: [{ id: 'server-1', role: 'user', content: 'create class User' }] })

    expect(screen.getByText('create class User')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument()
  })
})
