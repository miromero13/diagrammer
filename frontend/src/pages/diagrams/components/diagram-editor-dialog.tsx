import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2 } from 'lucide-react'

import { formatUmlAttribute, formatUmlMethod, parseUmlAttribute, parseUmlMethod, validateUmlAttributes, validateUmlMethods } from '../uml-member-format'

type EditorMode = 'node' | 'edge'

type EditorRelationConfig = {
  hasMultiplicity: boolean
  sourceFixed?: string
}

interface DiagramEditorDialogProps {
  open: boolean
  mode: EditorMode
  relationConfig: EditorRelationConfig | null
  nodeHasAttributes: boolean
  nodeIsEnum: boolean
  name: string
  attributes: string
  literals: string
  methods: string
  sourceMultiplicity: string
  targetMultiplicity: string
  sourceMultiplicityValue: string
  onOpenChange: (open: boolean) => void
  onNameChange: (value: string) => void
  onAttributesChange: (value: string) => void
  onLiteralsChange: (value: string) => void
  onMethodsChange: (value: string) => void
  onSourceMultiplicityChange: (value: string) => void
  onTargetMultiplicityChange: (value: string) => void
  onSave: () => void
}

export const DiagramEditorDialog = ({
  open,
  mode,
  relationConfig,
  nodeHasAttributes,
  nodeIsEnum,
  name,
  attributes,
  literals,
  methods,
  sourceMultiplicity,
  targetMultiplicity,
  sourceMultiplicityValue,
  onOpenChange,
  onNameChange,
  onAttributesChange,
  onLiteralsChange,
  onMethodsChange,
  onSourceMultiplicityChange,
  onTargetMultiplicityChange,
  onSave,
}: DiagramEditorDialogProps) => {
  const attributeErrors = nodeHasAttributes ? validateUmlAttributes(attributes) : []
  const methodErrors = !nodeIsEnum ? validateUmlMethods(methods) : []
  const memberError = [...attributeErrors, ...methodErrors][0]
  const attributeRows = attributes.split('\n').filter(Boolean).map(parseUmlAttribute)
  const methodRows = methods.split('\n').filter(Boolean).map(parseUmlMethod)
  const updateAttributes = (index: number, field: string, value: string) => onAttributesChange(attributeRows.map((row, rowIndex) => formatUmlAttribute(rowIndex === index ? { ...row, [field]: value } : row)).join('\n'))
  const updateMethods = (index: number, field: string, value: string) => onMethodsChange(methodRows.map((row, rowIndex) => formatUmlMethod(rowIndex === index ? { ...row, [field]: value } : row)).join('\n'))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'node' ? 'Editar elemento' : 'Editar relación'}</DialogTitle>
          <DialogDescription>
            {mode === 'node'
              ? 'Modifica nombre, atributos y métodos.'
              : 'Modifica multiplicidades de la relación.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'node' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editor-name">Nombre</Label>
              <Input id="editor-name" value={name} onChange={(event) => onNameChange(event.target.value)} />
            </div>
            {nodeIsEnum ? (
              <div className="space-y-2">
                <Label htmlFor="editor-literals">Literals</Label>
                <Textarea id="editor-literals" value={literals} onChange={(event) => onLiteralsChange(event.target.value)} className="min-h-28 font-mono text-sm" />
              </div>
            ) : nodeHasAttributes ? (
              <div className="space-y-2">
                <Label>Atributos</Label>
                <div className="space-y-2">
                  {attributeRows.length > 0 && <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_70px_32px] gap-2 px-1 text-xs text-muted-foreground sm:grid"><span>Nombre</span><span>Tipo</span><span>Mult.</span></div>}
                  {attributeRows.map((row, index) => <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_70px_32px]">
                    <Input aria-label="Nombre del atributo" value={row.name} onChange={(event) => updateAttributes(index, 'name', event.target.value)} placeholder="nombre" />
                    <Input aria-label="Tipo del atributo" value={row.type} onChange={(event) => updateAttributes(index, 'type', event.target.value)} placeholder="Tipo opcional" />
                    <Input aria-label="Multiplicidad" value={row.multiplicity} onChange={(event) => updateAttributes(index, 'multiplicity', event.target.value)} placeholder="0..*" />
                    <Button type="button" variant="ghost" size="icon" aria-label="Eliminar atributo" onClick={() => onAttributesChange(attributeRows.filter((_, rowIndex) => rowIndex !== index).map(formatUmlAttribute).join('\n'))}><Trash2 className="size-4" /></Button>
                  </div>)}
                  <Button type="button" variant="outline" size="sm" onClick={() => onAttributesChange([...attributeRows, { name: 'atributo', type: '', multiplicity: '' }].map(formatUmlAttribute).join('\n'))}><Plus className="mr-1 size-4" />Atributo</Button>
                </div>
                <p className="text-xs text-muted-foreground">El tipo es opcional. La notación UML se genera automáticamente.</p>
              </div>
            ) : null}
            {!nodeIsEnum && <div className="space-y-2">
              <Label>Métodos</Label>
              <div className="space-y-2">
                {methodRows.length > 0 && <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px] gap-2 px-1 text-xs text-muted-foreground sm:grid"><span>Nombre</span><span>Parámetros</span><span>Retorno</span></div>}
                {methodRows.map((row, index) => <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px]">
                  <Input aria-label="Nombre del método" value={row.name} onChange={(event) => updateMethods(index, 'name', event.target.value)} placeholder="método" />
                  <Input aria-label="Parámetros (opcionales)" value={row.parameters} onChange={(event) => updateMethods(index, 'parameters', event.target.value)} placeholder="item: Item" />
                  <Input aria-label="Retorno" value={row.returnType} onChange={(event) => updateMethods(index, 'returnType', event.target.value)} placeholder="void" />
                  <Button type="button" variant="ghost" size="icon" aria-label="Eliminar método" onClick={() => onMethodsChange(methodRows.filter((_, rowIndex) => rowIndex !== index).map(formatUmlMethod).join('\n'))}><Trash2 className="size-4" /></Button>
                </div>)}
                <Button type="button" variant="outline" size="sm" onClick={() => onMethodsChange([...methodRows, { name: 'metodo', parameters: '', returnType: 'void' }].map(formatUmlMethod).join('\n'))}><Plus className="mr-1 size-4" />Método</Button>
              </div>
              <p className="text-xs text-muted-foreground">Ejemplo: `calcularTotal(items: List&lt;Item&gt;): Decimal`. Parámetros separados por coma.</p>
            </div>}
            {memberError && <p className="text-sm text-destructive">{memberError}</p>}
          </div>
        ) : relationConfig && !relationConfig.hasMultiplicity ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Esta relación no usa multiplicidades.
          </div>
        ) : relationConfig?.sourceFixed ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="editor-source-mult">Multiplicity source</Label>
              <Input id="editor-source-mult" value={sourceMultiplicityValue} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editor-target-mult">Multiplicity target</Label>
              <Input
                id="editor-target-mult"
                value={targetMultiplicity}
                onChange={(event) => onTargetMultiplicityChange(event.target.value)}
                placeholder="0..*"
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="editor-source-mult">Multiplicity source</Label>
              <Input
                id="editor-source-mult"
                value={sourceMultiplicity}
                onChange={(event) => onSourceMultiplicityChange(event.target.value)}
                placeholder="0..*"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editor-target-mult">Multiplicity target</Label>
              <Input
                id="editor-target-mult"
                value={targetMultiplicity}
                onChange={(event) => onTargetMultiplicityChange(event.target.value)}
                placeholder="1"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave} disabled={Boolean(memberError)}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
