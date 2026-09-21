import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2 } from 'lucide-react'

import { formatUmlAttribute, formatUmlMethod, parseUmlAttribute, parseUmlMethod, validateUmlAttributes, validateUmlMethods, type UmlAttributeInput, type UmlMethodInput } from '../uml-member-format'

type EditorMode = 'node' | 'edge'

type EditorRelationConfig = {
  hasMultiplicity: boolean
  sourceFixed?: string
  relationType: string
}

interface DiagramEditorDialogProps {
  open: boolean
  mode: EditorMode
  relationConfig: EditorRelationConfig | null
  nodeHasAttributes: boolean
  nodeIsEnum: boolean
  name: string
  attributes: string
  attributeSemantics: Array<Partial<UmlAttributeInput>>
  literals: string
  methods: string
  methodSemantics: Array<Partial<UmlMethodInput>>
  sourceMultiplicity: string
  targetMultiplicity: string
  sourceMultiplicityValue: string
  sourceRoleName: string
  targetRoleName: string
  sourceNavigable: boolean
  targetNavigable: boolean
  relationStereotype: string
  onOpenChange: (open: boolean) => void
  onNameChange: (value: string) => void
  onAttributesChange: (value: string) => void
  onAttributeSemanticsChange: (value: Array<Partial<UmlAttributeInput>>) => void
  onLiteralsChange: (value: string) => void
  onMethodsChange: (value: string) => void
  onMethodSemanticsChange: (value: Array<Partial<UmlMethodInput>>) => void
  onSourceMultiplicityChange: (value: string) => void
  onTargetMultiplicityChange: (value: string) => void
  onSourceRoleNameChange: (value: string) => void
  onTargetRoleNameChange: (value: string) => void
  onSourceNavigableChange: (value: boolean) => void
  onTargetNavigableChange: (value: boolean) => void
  onRelationStereotypeChange: (value: string) => void
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
  attributeSemantics,
  literals,
  methods,
  methodSemantics,
  sourceMultiplicity,
  targetMultiplicity,
  sourceMultiplicityValue,
  sourceRoleName,
  targetRoleName,
  sourceNavigable,
  targetNavigable,
  relationStereotype,
  onOpenChange,
  onNameChange,
  onAttributesChange,
  onAttributeSemanticsChange,
  onLiteralsChange,
  onMethodsChange,
  onMethodSemanticsChange,
  onSourceMultiplicityChange,
  onTargetMultiplicityChange,
  onSourceRoleNameChange,
  onTargetRoleNameChange,
  onSourceNavigableChange,
  onTargetNavigableChange,
  onRelationStereotypeChange,
  onSave,
}: DiagramEditorDialogProps) => {
  const attributeErrors = nodeHasAttributes ? validateUmlAttributes(attributes) : []
  const methodErrors = !nodeIsEnum ? validateUmlMethods(methods) : []
  const memberError = [...attributeErrors, ...methodErrors][0]
  const attributeRows: UmlAttributeInput[] = attributes.split('\n').filter(Boolean).map((line, index) => ({ ...parseUmlAttribute(line), ...attributeSemantics[index] }))
  const methodRows: UmlMethodInput[] = methods.split('\n').filter(Boolean).map((line, index) => ({ ...parseUmlMethod(line), ...methodSemantics[index] }))
  const updateAttributes = (index: number, field: string, value: string | boolean) => {
    const rows = attributeRows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row)
    onAttributesChange(rows.map(formatUmlAttribute).join('\n'))
    onAttributeSemanticsChange(rows.map(({ visibility, isStatic, isAbstract, isDerived, defaultValue }) => ({ visibility, isStatic, isAbstract, isDerived, defaultValue })))
  }
  const updateMethods = (index: number, field: string, value: string | boolean) => {
    const rows = methodRows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row)
    onMethodsChange(rows.map(formatUmlMethod).join('\n'))
    onMethodSemanticsChange(rows.map(({ visibility, isStatic, isAbstract, isDerived }) => ({ visibility, isStatic, isAbstract, isDerived })))
  }
  const visibilityOptions = [['', '—'], ['+', '+'], ['-', '-'], ['#', '#'], ['~', '~']] as const

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl overflow-hidden rounded-2xl p-4 sm:max-h-[calc(100dvh-2rem)] sm:p-6">
        <DialogHeader>
          <DialogTitle>{mode === 'node' ? 'Editar elemento' : 'Editar relación'}</DialogTitle>
          <DialogDescription>
            {mode === 'node'
              ? 'Modifica nombre, atributos y métodos.'
              : 'Modifica multiplicidades de la relación.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden pr-1">
        {mode === 'node' ? (
          <div className="min-w-0 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="editor-name">Nombre</Label>
              <Input id="editor-name" value={name} onChange={(event) => onNameChange(event.target.value)} className="h-10 w-full" />
            </div>
            {nodeIsEnum ? (
              <div className="space-y-2">
                <Label htmlFor="editor-literals">Literals</Label>
                <Textarea id="editor-literals" value={literals} onChange={(event) => onLiteralsChange(event.target.value)} className="min-h-32 w-full font-mono text-sm" />
              </div>
            ) : nodeHasAttributes ? (
              <div className="min-w-0 space-y-3">
                <Label>Atributos</Label>
                <div className="min-w-0 space-y-4">
                  {attributeRows.map((row, index) => <div key={index} className="min-w-0 rounded-lg border p-4">
                    <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_auto] sm:items-end">
                      <div className="min-w-0">
                        <select id={`editor-attribute-${index}-visibility`} aria-label="Signo del atributo" value={row.visibility ?? ''} onChange={(event) => updateAttributes(index, 'visibility', event.target.value)} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm">
                          {visibilityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      <div className="min-w-0 space-y-2">
                        <Label htmlFor={`editor-attribute-${index}-name`}>Nombre</Label>
                        <Input id={`editor-attribute-${index}-name`} value={row.name} onChange={(event) => updateAttributes(index, 'name', event.target.value)} placeholder="nombre" className="h-10 w-full" />
                      </div>
                      <div className="min-w-0 space-y-2">
                        <Label htmlFor={`editor-attribute-${index}-type`}>Tipo</Label>
                        <Input id={`editor-attribute-${index}-type`} value={row.type} onChange={(event) => updateAttributes(index, 'type', event.target.value)} placeholder="Tipo opcional" className="h-10 w-full" />
                      </div>
                      <div className="flex items-end justify-end">
                        <Button type="button" variant="ghost" size="icon" aria-label="Eliminar atributo" onClick={() => { const rows = attributeRows.filter((_, rowIndex) => rowIndex !== index); onAttributesChange(rows.map(formatUmlAttribute).join('\n')); onAttributeSemanticsChange(rows.map(({ visibility, isStatic, isAbstract, isDerived, defaultValue }) => ({ visibility, isStatic, isAbstract, isDerived, defaultValue }))) }}><Trash2 className="size-4" /></Button>
                      </div>
                    </div>
                  </div>)}
                  <Button type="button" variant="outline" size="sm" onClick={() => { const rows: UmlAttributeInput[] = [...attributeRows, { name: 'atributo', type: '', multiplicity: '', visibility: '', isStatic: false, isAbstract: false, isDerived: false, defaultValue: '' }]; onAttributesChange(rows.map(formatUmlAttribute).join('\n')); onAttributeSemanticsChange(rows.map(({ visibility, isStatic, isAbstract, isDerived, defaultValue }) => ({ visibility, isStatic, isAbstract, isDerived, defaultValue }))) }}><Plus className="mr-1 size-4" />Atributo</Button>
                </div>
                <p className="text-xs text-muted-foreground">El tipo es opcional. La notación UML se genera automáticamente.</p>
              </div>
            ) : null}
            {!nodeIsEnum && <div className="min-w-0 space-y-3">
              <Label>Métodos</Label>
              <div className="min-w-0 space-y-4">
                {methodRows.map((row, index) => <div key={index} className="min-w-0 rounded-lg border p-4">
                  <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_auto] lg:items-end">
                    <div className="min-w-0">
                      <select id={`editor-method-${index}-visibility`} aria-label="Signo del método" value={row.visibility ?? ''} onChange={(event) => updateMethods(index, 'visibility', event.target.value)} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm">
                        {visibilityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <Input id={`editor-method-${index}-name`} aria-label="Nombre del método" value={row.name} onChange={(event) => updateMethods(index, 'name', event.target.value)} placeholder="método" className="h-10 w-full" />
                    </div>
                    <div className="min-w-0">
                      <Input id={`editor-method-${index}-parameters`} aria-label="Parámetros del método" value={row.parameters} onChange={(event) => updateMethods(index, 'parameters', event.target.value)} placeholder="item: Item" className="h-10 w-full" />
                    </div>
                    <div className="min-w-0">
                      <Input id={`editor-method-${index}-return`} aria-label="Tipo de retorno del método" value={row.returnType} onChange={(event) => updateMethods(index, 'returnType', event.target.value)} placeholder="void" className="h-10 w-full" />
                    </div>
                    <div className="flex items-end justify-end">
                      <Button type="button" variant="ghost" size="icon" aria-label="Eliminar método" onClick={() => { const rows = methodRows.filter((_, rowIndex) => rowIndex !== index); onMethodsChange(rows.map(formatUmlMethod).join('\n')); onMethodSemanticsChange(rows.map(({ visibility, isStatic, isAbstract, isDerived }) => ({ visibility, isStatic, isAbstract, isDerived }))) }}><Trash2 className="size-4" /></Button>
                    </div>
                  </div>
                </div>)}
                <Button type="button" variant="outline" size="sm" onClick={() => { const rows: UmlMethodInput[] = [...methodRows, { name: 'metodo', parameters: '', returnType: 'void', visibility: '', isStatic: false, isAbstract: false, isDerived: false, defaultValue: '' }]; onMethodsChange(rows.map(formatUmlMethod).join('\n')); onMethodSemanticsChange(rows.map(({ visibility, isStatic, isAbstract, isDerived }) => ({ visibility, isStatic, isAbstract, isDerived }))) }}><Plus className="mr-1 size-4" />Método</Button>
              </div>
              <p className="text-xs text-muted-foreground">Ejemplo: `calcularTotal(items: List&lt;Item&gt;): Decimal`. Parámetros separados por coma.</p>
            </div>}
             {memberError && <p className="text-sm text-destructive">{memberError}</p>}
           </div>
        ) : relationConfig && (
          <div className="min-w-0 space-y-4">
            {(relationConfig.relationType === 'association' || relationConfig.relationType === 'aggregation' || relationConfig.relationType === 'composition') && <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2"><Label htmlFor="editor-source-role">Rol origen</Label><Input id="editor-source-role" value={sourceRoleName} onChange={(event) => onSourceRoleNameChange(event.target.value)} placeholder="rol" className="h-10 w-full" /><label htmlFor="editor-source-navigable" className="flex items-center gap-2 text-sm text-muted-foreground"><input id="editor-source-navigable" type="checkbox" checked={sourceNavigable} onChange={(event) => onSourceNavigableChange(event.target.checked)} /> Navegable</label></div>
              <div className="min-w-0 space-y-2"><Label htmlFor="editor-target-role">Rol destino</Label><Input id="editor-target-role" value={targetRoleName} onChange={(event) => onTargetRoleNameChange(event.target.value)} placeholder="rol" className="h-10 w-full" /><label htmlFor="editor-target-navigable" className="flex items-center gap-2 text-sm text-muted-foreground"><input id="editor-target-navigable" type="checkbox" checked={targetNavigable} onChange={(event) => onTargetNavigableChange(event.target.checked)} /> Navegable</label></div>
            </div>}
            {relationConfig.relationType === 'dependency' && <div className="min-w-0 space-y-2"><Label htmlFor="editor-stereotype">Estereotipo</Label><Input id="editor-stereotype" value={relationStereotype} onChange={(event) => onRelationStereotypeChange(event.target.value)} placeholder="use" className="h-10 w-full" /></div>}
            {relationConfig && !relationConfig.hasMultiplicity ? (
           <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Esta relación no usa multiplicidades.
          </div>
        ) : relationConfig?.sourceFixed ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="editor-source-mult">Multiplicity source</Label>
              <Input id="editor-source-mult" value={sourceMultiplicityValue} disabled className="h-10 w-full" />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="editor-target-mult">Multiplicity target</Label>
              <Input
                id="editor-target-mult"
                value={targetMultiplicity}
                onChange={(event) => onTargetMultiplicityChange(event.target.value)}
                placeholder="0..*"
                className="h-10 w-full"
              />
            </div>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="editor-source-mult">Multiplicity source</Label>
              <Input
                id="editor-source-mult"
                value={sourceMultiplicity}
                onChange={(event) => onSourceMultiplicityChange(event.target.value)}
                placeholder="0..*"
                className="h-10 w-full"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="editor-target-mult">Multiplicity target</Label>
              <Input
                id="editor-target-mult"
                value={targetMultiplicity}
                onChange={(event) => onTargetMultiplicityChange(event.target.value)}
                placeholder="1"
                className="h-10 w-full"
              />
            </div>
          </div>
        )}
          </div>
        )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave} disabled={Boolean(memberError)}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
