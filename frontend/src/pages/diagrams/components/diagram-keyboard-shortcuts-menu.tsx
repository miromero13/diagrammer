import { ClipboardPaste, Copy, EllipsisVertical, Redo2, Trash2, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface DiagramKeyboardShortcutsMenuProps {
  onUndo: () => void
  onRedo: () => void
  onDelete: () => void
  onCopy: () => void
  onPaste: () => void
}

export const DiagramKeyboardShortcutsMenu = ({
  onUndo,
  onRedo,
  onDelete,
  onCopy,
  onPaste,
}: DiagramKeyboardShortcutsMenuProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7 rounded-sm border-border/60 bg-background/80 shadow-sm"
          aria-label="Abrir atajos del diagramador"
        >
          <EllipsisVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onUndo}>
          <Undo2 className="mr-2 h-4 w-4" />
          Atrás
          <DropdownMenuShortcut>Ctrl/⌘ Z</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRedo}>
          <Redo2 className="mr-2 h-4 w-4" />
          Adelante
          <DropdownMenuShortcut>Ctrl/⌘ Shift Z</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          Borrar
          <DropdownMenuShortcut>Supr</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCopy}>
          <Copy className="mr-2 h-4 w-4" />
          Copiar
          <DropdownMenuShortcut>Ctrl/⌘ C</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPaste}>
          <ClipboardPaste className="mr-2 h-4 w-4" />
          Pegar
          <DropdownMenuShortcut>Ctrl/⌘ V</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
