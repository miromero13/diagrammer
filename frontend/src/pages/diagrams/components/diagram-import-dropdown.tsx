import { useRef, type ChangeEvent } from 'react'
import { ArrowDownToLine } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { DiagramContent } from '../models/diagram.model'
import { parseDiagramXmi } from '../services/diagram-xmi'

interface DiagramImportDropdownProps {
  onImportXmi: (content: DiagramContent) => void | Promise<void>
}

export const DiagramImportDropdown = ({ onImportXmi }: DiagramImportDropdownProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const xml = await file.text()
      const content = parseDiagramXmi(xml)
      await onImportXmi(content)
    } catch (error) {
      console.error('Error al importar XMI:', error)
      window.alert(error instanceof Error ? error.message : 'No se pudo importar el archivo XMI')
    }
  }

  return (
    <DropdownMenu>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xmi,.xml,application/xml,text/xml"
        className="hidden"
        onChange={(event) => {
          void handleFileChange(event)
        }}
      />
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 rounded-sm border-border/60 bg-background/80 px-2.5 shadow-sm"
          aria-label="Importar diagrama"
        >
          <p className="text-md font-medium">Importar</p>
          <ArrowDownToLine className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-50">
        <DropdownMenuItem onClick={openFilePicker}>
          Importar XMI
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
