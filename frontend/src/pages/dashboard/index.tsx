import { useEffect, useState } from 'react'
import { FolderKanban, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/hooks'

import { CreateProjectDialog } from '@/pages/projects/components/create-project-dialog'
import type { Project } from '@/pages/projects/models/project.model'
import { projectsService } from '@/pages/projects/services/projects.service'

const getInitials = (firstName?: string, lastName?: string, username?: string): string => {
  const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.trim()
  if (initials) return initials.toUpperCase()

  return (username?.slice(0, 2) ?? 'U').toUpperCase()
}

interface ProjectCardParticipant {
  id: string
  firstName: string
  lastName: string
  username: string
  avatarUrl?: string | null
}

const avatarColors = [
  'bg-sky-500 text-white',
  'bg-violet-500 text-white',
  'bg-emerald-500 text-white',
  'bg-amber-500 text-white',
  'bg-rose-500 text-white',
  'bg-cyan-500 text-white',
]

const getAvatarColorClass = (seed: string): string => {
  const index = Math.abs(seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % avatarColors.length
  return avatarColors[index]
}

const getParticipantName = (participant: ProjectCardParticipant): string => {
  return `${participant.firstName} ${participant.lastName}`.trim() || participant.username
}

const DashboardPage = (): JSX.Element => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProjects = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await projectsService.getProjects()
      setProjects(response.projects)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los proyectos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProjects()
  }, [])

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Hola, {user?.firstName ?? 'usuario'}. Tus proyectos están aquí.
          </p>
        </div>
        <div className="flex gap-2">
          {/* <Button variant='outline' onClick={() => void loadProjects()}>
            <RefreshCcw className='mr-2 h-4 w-4' />
            Recargar
          </Button> */}
          <CreateProjectDialog onCreated={loadProjects} />
        </div>
      </div>

      {error ? (
        <Card className="border-destructive/50">
          <CardContent className="py-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))
        ) : projects.length > 0 ? (
          projects.map((project) => (
            <Card
              key={project.id}
              className="transition-shadow hover:shadow-md"
            >
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">{project.name}</CardTitle>
                    <CardDescription className="mt-1 line-clamp-2">
                      {project.description || 'Sin descripción'}
                    </CardDescription>
                  </div>
                  <Badge variant={project.isPublic ? 'default' : 'secondary'}>
                    {project.isPublic ? 'Público' : 'Privado'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {project.diagrams?.length ?? 0} diagramas
                  </div>
                  <div className="flex items-center gap-3">
                    <TooltipProvider delayDuration={150}>
                      <div className="flex -space-x-2">
                        {(
                          [
                            ...(project.owner
                              ? [
                                  {
                                    id: project.owner.id,
                                    firstName: project.owner.firstName,
                                    lastName: project.owner.lastName,
                                    username: project.owner.username,
                                    avatarUrl: project.owner.avatarUrl
                                  }
                                ]
                              : []),
                            ...(project.projectMembers ?? []).map((member) => ({
                              id: member.user.id,
                              firstName: member.user.firstName,
                              lastName: member.user.lastName,
                              username: member.user.username,
                              avatarUrl: member.user.avatarUrl
                            }))
                          ] as ProjectCardParticipant[]
                        )
                          .slice(0, 4)
                          .map((participant) => (
                            <Tooltip key={participant.id}>
                              <TooltipTrigger asChild>
                                <Avatar
                                  className={`h-8 w-8 border-2 border-background ${getAvatarColorClass(participant.id)}`}
                                >
                                  <AvatarImage
                                    src={participant.avatarUrl ?? undefined}
                                    alt={getParticipantName(participant)}
                                  />
                                  <AvatarFallback
                                    className={`text-[10px] font-medium ${getAvatarColorClass(participant.id)}`}
                                  >
                                    {getInitials(
                                      participant.firstName,
                                      participant.lastName,
                                      participant.username
                                    )}
                                  </AvatarFallback>
                                </Avatar>
                              </TooltipTrigger>
                              <TooltipContent>
                                {getParticipantName(participant)}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        {(project.owner ? 1 : 0) +
                          (project.projectMembers?.length ?? 0) >
                        4 ? (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground">
                            +
                            {(project.owner ? 1 : 0) +
                              (project.projectMembers?.length ?? 0) -
                              4}
                          </div>
                        ) : null}
                      </div>
                    </TooltipProvider>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/dashboard/projects/${project.id}`)}
                >
                  Abrir proyecto <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="border-dashed lg:col-span-2">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <FolderKanban className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No hay proyectos todavía</p>
                <p className="text-sm text-muted-foreground">
                  Crea el primero para empezar a diagramar.
                </p>
              </div>
              <CreateProjectDialog onCreated={loadProjects} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default DashboardPage
