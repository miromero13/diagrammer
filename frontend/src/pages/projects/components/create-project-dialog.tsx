import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { projectsService } from '../services/projects.service'
import type { ProjectVisibility } from '../models/project.model'

interface CreateProjectDialogProps {
  onCreated: () => Promise<void> | void
}

export const CreateProjectDialog = ({ onCreated }: CreateProjectDialogProps) => {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<{ name: string; description: string; visibility: ProjectVisibility }>({
    name: '',
    description: '',
    visibility: 'private',
  })

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await projectsService.createProject(form)
      setOpen(false)
      setForm({ name: '', description: '', visibility: 'private' })
      await onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el proyecto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Nuevo proyecto</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear proyecto</DialogTitle>
          <DialogDescription>Define el contenedor del diagrama UML.</DialogDescription>
        </DialogHeader>

        <form className='grid gap-4' onSubmit={handleSubmit}>
          <div className='grid gap-2'>
            <Label htmlFor='project-name'>Nombre</Label>
            <Input id='project-name' value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='project-description'>Descripción</Label>
            <Textarea id='project-description' value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
          </div>
          <div className='grid gap-2'>
            <Label>Visibilidad</Label>
            <div className='grid grid-cols-2 gap-2'>
              <Button type='button' variant={form.visibility === 'private' ? 'default' : 'outline'} onClick={() => setForm((prev) => ({ ...prev, visibility: 'private' }))}>
                Privado
              </Button>
              <Button type='button' variant={form.visibility === 'public' ? 'default' : 'outline'} onClick={() => setForm((prev) => ({ ...prev, visibility: 'public' }))}>
                Público
              </Button>
            </div>
          </div>

          {error ? <p className='text-sm text-destructive'>{error}</p> : null}

          <DialogFooter>
            <Button type='submit' disabled={loading}>{loading ? 'Creando...' : 'Crear'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
