import { parseDiagramCommands } from './diagram-command-parser';

const diagramData = {
  elements: [
    { id: 'user-id', name: 'User', attributes: ['email: String'] },
    { id: 'post-id', name: 'Post', attributes: [] },
  ],
  connections: [{ id: 'user-post', sourceId: 'user-id', targetId: 'post-id' }],
};

describe('parseDiagramCommands', () => {
  it('parses every supported command category', () => {
    const result = parseDiagramCommands([
      'crear clase Account',
      'crear interfaz Auditable',
      'crear clase abstracta BaseEntity',
      'crear enum Status ACTIVE, INACTIVE',
      'agregar atributo title:String a Post',
      'eliminar atributo email de User',
      'renombrar Account a CustomerAccount',
      'eliminar relación User -> Post',
      'crear relación User 1 -> * Post',
      'eliminar relación User -> Post',
      'eliminar CustomerAccount',
    ].join('\n'), diagramData);

    expect(result.success).toBe(true);
    expect(result.actions.map((action) => action.type)).toEqual([
      'create_class', 'create_interface', 'create_abstract_class', 'create_enum', 'add_attribute',
      'remove_attribute', 'rename_element', 'delete_element', 'create_relationship', 'delete_element', 'delete_element',
    ]);
    expect(result.actions.filter((action) => ['create_class', 'create_interface', 'create_abstract_class', 'create_enum', 'create_relationship'].includes(String(action.type))).every((action) => Boolean((action.data as any).id))).toBe(true);
    expect(result.actions.filter((action) => !['create_class', 'create_interface', 'create_abstract_class', 'create_enum', 'create_relationship'].includes(String(action.type))).every((action) => !('id' in (action.data as any)))).toBe(true);
  });

  it('accepts semicolon-separated commands and case-insensitive references', () => {
    const result = parseDiagramCommands('agregar atributo title:String a post; eliminar atributo email de USER', diagramData);

    expect(result.success).toBe(true);
    expect(result.actions).toHaveLength(2);
  });

  it('returns no partial actions for unknown or ambiguous references', () => {
    const unknown = parseDiagramCommands('crear clase Account\nagregar atributo title:String a Missing', diagramData);
    const ambiguous = parseDiagramCommands('eliminar user', { elements: [{ id: '1', name: 'User' }, { id: '2', name: 'user' }] });

    expect(unknown).toMatchObject({ success: false, actions: [] });
    expect(unknown.message).toContain('No existe la clase o interfaz "Missing"');
    expect(ambiguous).toMatchObject({ success: false, actions: [] });
    expect(ambiguous.message).toContain('ambigua');
  });
});
