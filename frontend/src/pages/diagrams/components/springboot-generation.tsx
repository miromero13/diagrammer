import { useEffect, useState } from 'react'
import { Check, ChevronDown, CircleAlert, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

import { diagramsService } from '../services/diagrams.service'

type DiagramClass = { id: string; name: string; kind: string; attributes: string[] }
type Props = { diagramId?: string; saveDiagram: () => Promise<void>; classes: DiagramClass[] }

export const attributeName = (attribute: string) => attribute.trim().replace(/^[+\-#~]?\s*/, '').split(':')[0].trim()

export const validateAuthentication = (config: Record<string, string>) =>
  Object.values(config).every((value) => value.trim()) ? null : 'Complete la configuración de autenticación.'

export const authenticationPayload = (enabled: boolean, config: Record<string, string>) =>
  enabled ? { enabled, ...config } : { enabled }

const stepLabels: Record<string, string> = {
  PARSING_DIAGRAM: 'Diagrama analizado',
  VALIDATING_DIAGRAM: 'Validando diagrama',
  GENERATING_SECURITY: 'Generando autenticación y seguridad'
}

export const SpringbootGeneration = ({ diagramId, saveDiagram, classes }: Props) => {
  const [open, setOpen] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [backendName, setBackendName] = useState('')
  const [authenticationEnabled, setAuthenticationEnabled] = useState(false)
  const [principalClassId, setPrincipalClassId] = useState('')
  const [loginField, setLoginField] = useState('')
  const [credentialField, setCredentialField] = useState('')
  const [testUserLogin, setTestUserLogin] = useState('')
  const [testUserPassword, setTestUserPassword] = useState('')
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [status, setStatus] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const principal = classes.find((item) => item.id === principalClassId)
  const principalClasses = classes.filter((item) => item.kind === 'class')
  const fields = principal?.attributes.map(attributeName).filter(Boolean) ?? []

  useEffect(() => {
    if (!generationId) return undefined
    let cancelled = false
    const poll = async () => {
      try {
        const response = await diagramsService.getGenerationStatus(generationId)
        if (!cancelled) setStatus(response.generatedCode)
        if (!cancelled && !['COMPLETED', 'FAILED'].includes(response.generatedCode.status)) window.setTimeout(() => void poll(), 1000)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Generation status unavailable')
      }
    }
    void poll()
    return () => { cancelled = true }
  }, [generationId])

  const start = async () => {
    if (!companyName.trim()) return setError('Ingrese el nombre de la empresa.')
    if (!diagramId || !/^[a-z][a-z0-9_]{0,62}$/.test(backendName)) return setError('Ingrese un nombre de backend válido: [a-z][a-z0-9_]{0,62}.')
    const authenticationConfig = { principalClassId, loginField, credentialField, testUserLogin, testUserPassword }
    const validationError = authenticationEnabled ? validateAuthentication(authenticationConfig) : null
    if (validationError) return setError(validationError)
    const authentication = authenticationPayload(authenticationEnabled, authenticationConfig)
    setError(null)
    try {
      await saveDiagram()
      const response = await diagramsService.startGeneration(diagramId, { companyName: companyName.trim(), backendName, authentication })
      setGenerationId(response.generationId)
      setStatus(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generación fallida')
    }
  }

  const reset = () => {
    setOpen(false)
    setAuthenticationEnabled(false)
    setGenerationId(null)
    setStatus(null)
    setError(null)
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

  return <>
    <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm" className="h-8 gap-1"><span>Generar backend</span><ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setOpen(true)}>springboot</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    <Dialog open={open} onOpenChange={(value) => !value && reset()}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Generar backend en Springboot</DialogTitle><DialogDescription>JWT básico: todo usuario autenticado accede a los endpoints protegidos.</DialogDescription></DialogHeader>
      {!generationId ? <div className="space-y-4">
        <div className="space-y-2"><Label htmlFor="company-name">Nombre de la empresa</Label><Input id="company-name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="backend-name">Nombre del backend</Label><Input id="backend-name" value={backendName} onChange={(event) => setBackendName(event.target.value)} placeholder="my_backend" required /></div>
        <div className="flex items-center gap-2"><Input id="authentication-enabled" type="checkbox" className="h-4 w-4" checked={authenticationEnabled} onChange={(event) => setAuthenticationEnabled(event.target.checked)} /><Label htmlFor="authentication-enabled">Habilitar autenticación</Label></div>
        {authenticationEnabled && <><div className="space-y-2"><Label>Clase principal</Label><Select value={principalClassId} onValueChange={(value) => { setPrincipalClassId(value); setLoginField(''); setCredentialField('') }}><SelectTrigger className="w-full"><SelectValue placeholder="Seleccione una clase" /></SelectTrigger><SelectContent collisionPadding={8}><SelectGroup>{principalClasses.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
        <div className="space-y-2"><Label>Atributo de inicio de sesión</Label><Select value={loginField} onValueChange={setLoginField} disabled={!principal}><SelectTrigger className="w-full"><SelectValue placeholder="Seleccione un atributo" /></SelectTrigger><SelectContent><SelectGroup>{fields.map((field) => <SelectItem key={field} value={field}>{field}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
        <div className="space-y-2"><Label>Atributo de contraseña</Label><Select value={credentialField} onValueChange={setCredentialField} disabled={!principal}><SelectTrigger className="w-full"><SelectValue placeholder="Seleccione un atributo" /></SelectTrigger><SelectContent><SelectGroup>{fields.map((field) => <SelectItem key={field} value={field}>{field}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="test-user-login">Inicio de sesión del usuario de prueba</Label><Input id="test-user-login" value={testUserLogin} onChange={(event) => setTestUserLogin(event.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="test-user-password">Contraseña del usuario de prueba</Label><Input id="test-user-password" type="password" value={testUserPassword} onChange={(event) => setTestUserPassword(event.target.value)} required /></div></>}
      </div> : <div className="space-y-3"><div className="rounded-md border p-3"><p className="font-medium">Generando backend</p>{status?.steps?.map((step: any) => <div key={step.id} className="flex items-center justify-between py-1 text-sm"><span>{stepLabels[step.id] || step.label}</span>{step.status === 'COMPLETED' ? <Check className="h-4 w-4 text-green-600" /> : step.status === 'IN_PROGRESS' ? <Loader2 className="h-4 w-4 animate-spin" /> : step.status === 'FAILED' ? <CircleAlert className="h-4 w-4 text-red-600" /> : <span className="h-4 w-4 rounded-full border" />}</div>)}</div><p className="text-sm text-muted-foreground">{status?.message || 'Generación en cola'}</p>{status?.compilationErrors && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{status.compilationErrors}</pre>}{status?.status === 'FAILED' && <p className="text-sm text-red-600">Corrija el diagrama UML en el editor y vuelva a intentar.</p>}</div>}
      {error && <p className="text-sm text-red-600">{error}</p>}<DialogFooter>{!generationId ? <Button onClick={() => void start()}>Iniciar generación</Button> : status?.status === 'COMPLETED' ? <Button onClick={() => void download()}>Descargar ZIP</Button> : status?.status === 'FAILED' ? <Button variant="outline" onClick={() => { setGenerationId(null); setStatus(null) }}>Reintentar</Button> : <Button variant="outline" onClick={reset}>Cerrar</Button>}</DialogFooter>
    </DialogContent></Dialog>
  </>
}
