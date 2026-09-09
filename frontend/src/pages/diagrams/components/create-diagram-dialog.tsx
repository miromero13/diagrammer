import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus } from 'lucide-react'

import { diagramsService } from '../services/diagrams.service'

interface CreateDiagramDialogProps {
  projectId: string
  onCreated: () => Promise<void> | void
}

export const CreateDiagramDialog = ({ projectId, onCreated }: CreateDiagramDialogProps) => {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
  })

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await diagramsService.createDiagram(projectId, {
        name: form.name,
        description: form.description,
        content: { elements: [], connections: [], metadata: {} },
      })
      setOpen(false)
      setForm({ name: '', description: '' })
      await onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el diagrama')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='default'>
          <Plus className='mr-2 h-4 w-4' />
          Crear diagrama
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear diagrama</DialogTitle>
          <DialogDescription>Empieza con un lienzo vacío listo para editar.</DialogDescription>
        </DialogHeader>

        <form className='grid gap-4' onSubmit={handleSubmit}>
          <div className='grid gap-2'>
            <Label htmlFor='diagram-name'>Nombre</Label>
            <Input id='diagram-name' value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='diagram-description'>Descripción</Label>
            <Textarea id='diagram-description' value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
          </div>
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
          <DialogFooter>
            <Button type='submit' disabled={loading}>{loading ? 'Creando...' : 'Crear diagrama'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
