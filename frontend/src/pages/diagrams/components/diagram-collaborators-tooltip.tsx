import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type CollaborationUser = {
  id: string
  username?: string
  firstName?: string
  lastName?: string
}

interface DiagramCollaboratorsTooltipProps {
  users: CollaborationUser[]
}

const collaboratorColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

const getCollaboratorColor = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return collaboratorColors[hash % collaboratorColors.length]
}

const getCollaboratorLabel = (user?: CollaborationUser | null) => {
  if (!user) return 'Otro usuario'
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.id
}

const getCollaboratorInitials = (user?: CollaborationUser | null) => {
  if (!user) return 'U'
  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.trim()
  if (initials) return initials.toUpperCase()
  return (user.username?.slice(0, 2) ?? 'U').toUpperCase()
}

export const DiagramCollaboratorsTooltip = ({ users }: DiagramCollaboratorsTooltipProps) => {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex -space-x-2">
        {users.slice(0, 4).map((user) => {
          const fullName = getCollaboratorLabel(user)
          const color = getCollaboratorColor(user.id)

          return (
            <Tooltip key={user.id}>
              <TooltipTrigger asChild>
                <Avatar
                  className="h-7 w-7 border-2 border-background"
                  style={{ backgroundColor: color, color: '#fff' }}
                >
                  <AvatarImage src={undefined} alt={fullName} />
                  <AvatarFallback
                    className="text-[10px] font-medium"
                    style={{ backgroundColor: color, color: '#fff' }}
                  >
                    {getCollaboratorInitials(user)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>{fullName}</TooltipContent>
            </Tooltip>
          )
        })}
        {users.length > 4 ? (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground">
            +{users.length - 4}
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  )
}
