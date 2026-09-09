import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

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
  name: string
  attributes: string
  methods: string
  sourceMultiplicity: string
  targetMultiplicity: string
  sourceMultiplicityValue: string
  onOpenChange: (open: boolean) => void
  onNameChange: (value: string) => void
  onAttributesChange: (value: string) => void
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
  name,
  attributes,
  methods,
  sourceMultiplicity,
  targetMultiplicity,
  sourceMultiplicityValue,
  onOpenChange,
  onNameChange,
  onAttributesChange,
  onMethodsChange,
  onSourceMultiplicityChange,
  onTargetMultiplicityChange,
  onSave,
}: DiagramEditorDialogProps) => {
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
            {nodeHasAttributes ? (
              <div className="space-y-2">
                <Label htmlFor="editor-attributes">Atributos</Label>
                <Textarea
                  id="editor-attributes"
                  value={attributes}
                  onChange={(event) => onAttributesChange(event.target.value)}
                  className="min-h-28 font-mono text-sm"
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="editor-methods">Métodos</Label>
              <Textarea
                id="editor-methods"
                value={methods}
                onChange={(event) => onMethodsChange(event.target.value)}
                className="min-h-28 font-mono text-sm"
              />
            </div>
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
          <Button onClick={onSave}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
