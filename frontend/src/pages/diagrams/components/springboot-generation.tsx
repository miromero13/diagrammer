import { useEffect, useState, type ReactNode } from 'react'
import { Check, ChevronDown, CircleAlert, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

import { diagramsService } from '../services/diagrams.service'

type Props = {
  diagramId?: string
  saveDiagram: () => Promise<void>
  classes: Array<{ id: string; name: string }>
  children?: ReactNode
}

const stepLabels: Record<string, string> = {
  PARSING_DIAGRAM: 'Diagrama analizado',
  VALIDATING_DIAGRAM: 'Validando diagrama',
  GENERATING_SECURITY: 'Generando autenticación y seguridad'
}

const parseBootstrapNames = (value: string) =>
  value.trim() ? value.split(',').map((name) => name.trim()) : []

export const SpringbootGeneration = ({
  diagramId,
  saveDiagram,
  classes
}: Props) => {
  const [open, setOpen] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [backendName, setBackendName] = useState('')
  const [authentication, setAuthentication] = useState(false)
  const [principalClassId, setPrincipalClassId] = useState('')
  const [roleClassId, setRoleClassId] = useState('')
  const [permissionClassId, setPermissionClassId] = useState('')
  const [bootstrapRoleNames, setBootstrapRoleNames] = useState('')
  const [bootstrapPermissionNames, setBootstrapPermissionNames] = useState('')
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [status, setStatus] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!generationId) return undefined
    let cancelled = false
    const poll = async () => {
      try {
        const response = await diagramsService.getGenerationStatus(generationId)
        if (!cancelled) setStatus(response.generatedCode)
        if (
          !cancelled &&
          !['COMPLETED', 'FAILED'].includes(response.generatedCode.status)
        )
          window.setTimeout(() => void poll(), 1000)
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : 'Generation status unavailable'
          )
      }
    }
    void poll()
    return () => {
      cancelled = true
    }
  }, [generationId])

  const start = async () => {
    if (!companyName.trim()) {
      setError('Ingrese el nombre de la empresa.')
      return
    }
    if (!diagramId || !/^[a-z][a-z0-9_]{0,62}$/.test(backendName)) {
      setError('Ingrese un nombre de backend válido: [a-z][a-z0-9_]{0,62}.')
      return
    }
    if (authentication && !principalClassId) {
      setError('Seleccione una clase principal.')
      return
    }
    const roleNames = roleClassId ? parseBootstrapNames(bootstrapRoleNames) : []
    const permissionNames = permissionClassId
      ? parseBootstrapNames(bootstrapPermissionNames)
      : []
    if ([...roleNames, ...permissionNames].some((name) => !name)) {
      setError('Los nombres iniciales no pueden contener entradas vacías.')
      return
    }
    setError(null)
    try {
      await saveDiagram()
      const response = await diagramsService.startGeneration(diagramId, {
        companyName: companyName.trim(),
        backendName,
        authentication: {
          enabled: authentication,
          principalClassId,
          roleClassId,
          permissionClassId,
          bootstrap: { roleNames, permissionNames }
        }
      })
      setGenerationId(response.generationId)
      setStatus(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generación fallida')
    }
  }

  const download = async () => {
    if (!generationId) return
    const blob = await diagramsService.downloadGeneration(generationId)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${backendName}.zip`
    link.click()
    URL.revokeObjectURL(url)
  }

  const reset = () => {
    setOpen(false)
    setGenerationId(null)
    setStatus(null)
    setError(null)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1"
          >
            <span>Generar backend</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpen(true)}>
            springboot
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={(value) => !value && reset()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generar backend en Springboot</DialogTitle>
            <DialogDescription>
              La fase 1 copia y compila la plantilla seleccionada.
            </DialogDescription>
          </DialogHeader>
          {!generationId ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">Nombre de la empresa</Label>
                <Input
                  id="company-name"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="backend-name">Nombre del backend</Label>
                <Input
                  id="backend-name"
                  value={backendName}
                  onChange={(event) => setBackendName(event.target.value)}
                  placeholder="my_backend"
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={authentication}
                  onChange={(event) => setAuthentication(event.target.checked)}
                />{' '}
                El backend necesita autenticación (Spring Security)
              </label>
              {authentication && (
                <div className="space-y-3">
                  {(
                    [
                      [
                        'Clase principal',
                        principalClassId,
                        setPrincipalClassId,
                        true
                      ],
                      ['Clase de rol', roleClassId, setRoleClassId, false],
                      [
                        'Clase de permisos',
                        permissionClassId,
                        setPermissionClassId,
                        false
                      ]
                    ] as const
                  ).map(([label, value, setter, required]) => (
                    <label key={label} className="block space-y-1 text-sm">
                      <span>
                        {label}
                        {required ? ' *' : ''}
                      </span>
                      <Select
                        value={value}
                        onValueChange={setter}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona una clase" />
                        </SelectTrigger>
                        <SelectContent
                          collisionPadding={8}
                        >
                          <SelectGroup>
                            {classes.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </label>
                  ))}
                  {roleClassId && (
                    <div className="space-y-1">
                      <Label htmlFor="bootstrap-role-names">
                        Nombres de roles iniciales
                      </Label>
                      <Input
                        id="bootstrap-role-names"
                        value={bootstrapRoleNames}
                        onChange={(event) =>
                          setBootstrapRoleNames(event.target.value)
                        }
                        placeholder="ADMIN, USER"
                      />
                    </div>
                  )}
                  {permissionClassId && (
                    <div className="space-y-1">
                      <Label htmlFor="bootstrap-permission-names">
                        Nombres de permisos iniciales
                      </Label>
                      <Input
                        id="bootstrap-permission-names"
                        value={bootstrapPermissionNames}
                        onChange={(event) =>
                          setBootstrapPermissionNames(event.target.value)
                        }
                        placeholder="READ_USERS, WRITE_USERS"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border p-3">
                <p className="font-medium">Generando backend</p>
                {status?.steps?.map((step: any) => (
                  <div
                    key={step.id}
                    className="flex items-center justify-between py-1 text-sm"
                  >
                     <span>{stepLabels[step.id] || step.label}</span>
                    {step.status === 'COMPLETED' ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : step.status === 'IN_PROGRESS' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : step.status === 'FAILED' ? (
                      <CircleAlert className="h-4 w-4 text-red-600" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border" />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {status?.message || 'Generación en cola'}
              </p>
               {status?.compilationErrors && (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                  {status.compilationErrors}
                </pre>
              )}
              {status?.status === 'FAILED' && (
                <p className="text-sm text-red-600">Corrija el diagrama UML en el editor y vuelva a intentar.</p>
              )}
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            {!generationId ? (
              <Button onClick={() => void start()}>Iniciar generación</Button>
            ) : status?.status === 'COMPLETED' ? (
              <Button onClick={() => void download()}>Descargar ZIP</Button>
            ) : status?.status === 'FAILED' ? (
              <Button
                variant="outline"
                onClick={() => {
                  setGenerationId(null)
                  setStatus(null)
                }}
              >
                Reintentar
              </Button>
            ) : (
              <Button variant="outline" onClick={reset}>
                Cerrar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
