import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FolderKanban, PencilLine } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

import { projectsService } from './services/projects.service'
import type { ProjectDiagram, ProjectDetailsResponse } from './models/project.model'
import { CreateDiagramDialog } from '@/pages/diagrams/components/create-diagram-dialog'

const ProjectDetailPage = (): JSX.Element => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<ProjectDetailsResponse | null>(null)
  const [diagrams, setDiagrams] = useState<ProjectDiagram[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!id) return

      setLoading(true)
      setError(null)

      try {
        const [response, diagramsResponse] = await Promise.all([
          projectsService.getProject(id),
          projectsService.getProjectDiagrams(id),
        ])
        setData(response)
        setDiagrams(diagramsResponse.diagrams)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo cargar el proyecto')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id])

  const refreshDiagrams = async () => {
    if (!id) return
    const response = await projectsService.getProjectDiagrams(id)
    setDiagrams(response.diagrams)
  }

  return (
    <div className='space-y-6 p-8'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <Button asChild variant='outline' className='px-4'>
          <Link to='/dashboard'>
            <ArrowLeft className='mr-2 h-4 w-4' />
            Volver
          </Link>
        </Button>

        {data ? <CreateDiagramDialog projectId={data.project.id} onCreated={refreshDiagrams} /> : null}
      </div>

      {loading ? (
        <Card>
          <CardHeader>
            <Skeleton className='h-6 w-48' />
            <Skeleton className='h-4 w-72' />
          </CardHeader>
        </Card>
      ) : error ? (
        <Card className='border-destructive/50'>
          <CardContent className='py-6 text-sm text-destructive'>{error}</CardContent>
        </Card>
      ) : data ? (
        <Card>
          <CardHeader className='flex flex-row items-start justify-between gap-4'>
            <div className='space-y-3'>
              <CardTitle className='flex items-center gap-3'>
                <FolderKanban className='h-5 w-5' />
                {data.project.name}
              </CardTitle>
              <CardDescription>{data.project.description || 'Sin descripción'}</CardDescription>
            </div>
            <Badge variant={data.project.isPublic ? 'default' : 'secondary'}>{data.project.isPublic ? 'Público' : 'Privado'}</Badge>
          </CardHeader>

          <CardContent className='space-y-6'>
            <div className='grid gap-3'>
              {diagrams.length > 0 ? diagrams.map((diagram) => (
                <div key={diagram.id} className='flex items-center justify-between gap-4 rounded-lg border p-4'>
                  <div>
                    <p className='font-medium'>{diagram.name}</p>
                    <p className='text-sm text-muted-foreground'>{diagram.description || 'Sin descripción'}</p>
                  </div>
                  <Button variant='outline' size='sm' onClick={() => navigate(`/dashboard/projects/${data.project.id}/diagrams/${diagram.id}`)}>
                    <PencilLine className='mr-2 h-4 w-4' />
                    Editar
                  </Button>
                </div>
              )) : (
                <div className='rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>
                  No hay diagramas todavía. Crea el primero para empezar.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default ProjectDetailPage
