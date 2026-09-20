import { normalizeAndValidateUml, renderUmlAnalysis } from './uml-analysis';

describe('UML analysis', () => {
  it('normalizes valid classes and relationships and renders the required report', () => {
    const analysis = normalizeAndValidateUml({
      elements: [
        { id: 'order', type: 'uml.Class', name: 'Order', attributes: ['+customer: Customer'] },
        { id: 'customer', type: 'uml.Class', name: 'Customer', attributes: ['-name: String'] },
      ],
       connections: [{ id: 'order-customer', type: 'association', sourceId: 'order', targetId: 'customer', sourceMultiplicity: '0..*', targetMultiplicity: '1' }],
    });

    expect(analysis.errors).toEqual([]);
    expect(analysis.elements[0]).toMatchObject({ id: 'order', name: 'Order', kind: 'class', structuredAttributes: [{ name: 'customer', sourceType: 'Customer', javaType: 'Customer' }] });
    expect(analysis.relationalModel.tables).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'order' })]));
    expect(analysis.relationalModel.excludedElements).toEqual([]);
    expect(JSON.parse(JSON.stringify(analysis))).toMatchObject({ normalizedModel: expect.any(Object), relationalModel: expect.any(Object) });
    expect(renderUmlAnalysis(analysis, { enabled: false })).toContain('## Clases detectadas');
    expect(analysis.relationalModel.tables.find((table) => table.name === 'order')?.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'customer_id', source: 'relationship', referencedTable: 'customer', referencedColumn: 'id' }),
    ]));
    expect(renderUmlAnalysis(analysis, { enabled: false })).toContain('## Modelo relacional');
    expect(renderUmlAnalysis(analysis, { enabled: false })).not.toContain('## Modelo relacional estimado');
    expect(renderUmlAnalysis(analysis, { enabled: false })).toContain('El modelo relacional es obligatorio');
  });

  it('accepts UML enums and enum-typed attributes while rejecting malformed attributes', () => {
    const analysis = normalizeAndValidateUml({
      elements: [
        { id: 'status', type: 'uml.Enumeration', name: 'MembershipStatus', literals: ['ACTIVE', 'CANCELLED'] },
        { id: 'user', type: 'uml.Class', name: 'User', attributes: ['status: MembershipStatus [1]', 'name:'] },
      ],
      connections: [{ id: 'user-status', type: 'enumUsage', sourceId: 'user', targetId: 'status' }],
    });

    expect(analysis.errors).toEqual([expect.stringContaining('Atributo inválido')]);
    expect(analysis.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'status', name: 'MembershipStatus', kind: 'enum', literals: ['ACTIVE', 'CANCELLED'] }),
    ]));
    expect(analysis.elements.find((element) => element.name === 'User')?.attributes).toContain('status: MembershipStatus');
    expect(analysis.elements.find((element) => element.name === 'User')?.structuredAttributes[0]).toMatchObject({ sourceType: 'MembershipStatus', javaType: 'MembershipStatus', multiplicity: { lower: 1, upper: 1 } });
    expect(analysis.relationalModel.enums[0]).toMatchObject({ representation: 'string', literals: ['ACTIVE', 'CANCELLED'] });
    expect(renderUmlAnalysis(analysis, { enabled: false })).toContain('## Enums detectados');
  });

  it('rejects invalid enum names and literals', () => {
    const analysis = normalizeAndValidateUml({
      elements: [{ id: 'status', type: 'uml.Enumeration', name: 'Invalid Status', literals: ['ACTIVE', 'ACTIVE', 'NOT-VALID'] }],
      connections: [],
    });

    expect(analysis.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('nombre de enum inválido'),
      expect.stringContaining('Literal de enum duplicado'),
      expect.stringContaining('Literal de enum inválido'),
    ]));
  });

  it('accepts UML visibility markers and optional attribute types', () => {
    const analysis = normalizeAndValidateUml({
      elements: [{
        id: 'user',
        type: 'uml.Class',
        name: 'User',
        attributes: ['- name: String [1]', '+email: String', 'phone', 'age Integer', 'initial: char', '-paidAt: char [1]'],
      }],
      connections: [],
    });

    expect(analysis.errors).toEqual([]);
    expect(analysis.elements[0].attributes).toEqual([
      '-name: String',
      '+email: String',
      'phone: String',
      'age: Integer',
      'initial: char',
      '-paidAt: char',
    ]);
    expect(analysis.elements[0].structuredAttributes.at(-1)).toMatchObject({ name: 'paidAt', visibility: '-', sourceType: 'char', javaType: 'String', multiplicity: { lower: 1, upper: 1 } });
  });

  it('accepts empty relationship multiplicities and renders endpoints separately', () => {
    const analysis = normalizeAndValidateUml({ elements: [{ id: 'a', type: 'uml.Class', name: 'A' }, { id: 'b', type: 'uml.Class', name: 'B' }], connections: [{ id: 'ab', type: 'association', sourceId: 'a', targetId: 'b', sourceMultiplicity: '', targetMultiplicity: '' }] });
    expect(analysis.errors).toEqual([]);
    expect(analysis.connections[0].source).toEqual({ lower: null, upper: null });
    expect(renderUmlAnalysis(analysis, { enabled: false })).toContain('A [sin multiplicidad] -[association]-> [sin multiplicidad] B');
    expect(renderUmlAnalysis(analysis, { enabled: false })).not.toContain('..**');
  });

  it('creates association-class and joined-inheritance tables', () => {
    const analysis = normalizeAndValidateUml({
      elements: [
        { id: 'user', type: 'uml.Class', name: 'User', attributes: ['id: int'] },
        { id: 'member', type: 'uml.Class', name: 'Member', attributes: ['membershipNumber: String'] },
        { id: 'role', type: 'uml.Class', name: 'Role', attributes: ['id: int'] },
        { id: 'permission', type: 'uml.Class', name: 'Permission', attributes: ['id: int'] },
        { id: 'role-permission', type: 'uml.Class', name: 'RolePermission', attributes: ['createdAt: date'] },
      ],
      connections: [
        { id: 'member-user', type: 'inheritance', sourceId: 'member', targetId: 'user' },
        { id: 'role-permission-link', type: 'association', sourceId: 'role', targetId: 'permission', associationClassId: 'role-permission' },
      ],
    });
    const association = analysis.relationalModel.tables.find((table) => table.name === 'role_permission');
    expect(association).toMatchObject({ associationClassId: 'role-permission' });
    expect(association?.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'role_id', source: 'relationship', referencedTable: 'role' }),
      expect.objectContaining({ name: 'permission_id', source: 'relationship', referencedTable: 'permission' }),
      expect.objectContaining({ name: 'created_at', source: 'attribute' }),
    ]));
    expect(association?.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'role_id', sourceType: 'int', javaType: 'Integer' }),
      expect.objectContaining({ name: 'permission_id', sourceType: 'int', javaType: 'Integer' }),
    ]));
    expect(analysis.relationalModel.tables.find((table) => table.name === 'member')).toMatchObject({
      inheritance: { strategy: 'joined', baseTable: 'user', childTable: 'member', foreignKeyColumn: 'id' },
    });
    expect(analysis.relationalModel.tables.find((table) => table.name === 'member')?.columns.find((column) => column.name === 'id')).toMatchObject({ sourceType: 'int', javaType: 'Integer', foreignKey: true, referencedTable: 'user' });
  });

  it('excludes technical elements and reports usable UML warnings', () => {
    const analysis = normalizeAndValidateUml({
      elements: [
        { id: 'service', type: 'uml.Class', name: 'EmailNotificationService' },
        { id: 'api', type: 'uml.Interface', name: 'NotificacionService' },
        { id: 'user', type: 'uml.Class', name: 'User', attributes: ['paidAt: int', 'createdAt: char', 'mombershipNumber: String', 'departpment: String', 'rquipement: String'] },
        { id: 'status', type: 'uml.Enumeration', name: 'Status', literals: ['CACELLED', 'REFUNDER'] },
      ],
      connections: [],
    });
    expect(analysis.errors).toEqual([]);
    expect(analysis.relationalModel.excludedElements.map((element) => element.name)).toEqual(expect.arrayContaining(['EmailNotificationService', 'NotificacionService']));
    expect(analysis.warnings.join(' ')).toEqual(expect.stringContaining('paidAt'));
    expect(analysis.warnings.join(' ')).toEqual(expect.stringContaining('equipment'));
    expect(analysis.warnings.join(' ')).toEqual(expect.stringContaining('CANCELLED'));
    expect(JSON.parse(JSON.stringify(analysis))).toMatchObject({ normalizedModel: { elements: expect.any(Array), relationships: expect.any(Array), excludedElements: expect.any(Array) }, relationalModel: { tables: expect.any(Array), relationships: expect.any(Array), excludedElements: expect.any(Array) }, errors: expect.any(Array), warnings: expect.any(Array), structuredWarnings: expect.any(Array) });
  });

  it('uses UML ids as the PK, canonicalizes physical names, and structures warnings', () => {
    const analysis = normalizeAndValidateUml({ elements: [{ id: 'member', type: 'uml.Class', name: 'Member', attributes: ['id: Long', 'mombershipNumber: String', 'departpment: String', 'rquipement: String'] }], connections: [] });
    const table = analysis.relationalModel.tables[0];
    expect(table.columns.filter((column) => column.name === 'id')).toHaveLength(1);
    expect(table.columns.find((column) => column.sourceName === 'id')).toMatchObject({ name: 'id', sourceType: 'Long', javaType: 'Long', primaryKey: true });
    expect(table.columns.map((column) => column.name)).toEqual(['id', 'membership_number', 'department', 'equipment']);
    expect(analysis.elements[0].structuredAttributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceName: 'mombershipNumber', canonicalName: 'membershipNumber' }),
      expect.objectContaining({ sourceName: 'departpment', canonicalName: 'department' }),
      expect.objectContaining({ sourceName: 'rquipement', canonicalName: 'equipment' }),
    ]));
    expect(analysis.structuredWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UML_ATTRIBUTE_TYPO', severity: 'warning', attribute: 'mombershipNumber', originalValue: 'mombershipNumber', canonicalSuggestion: 'membershipNumber', message: expect.stringContaining('mombershipNumber') }),
    ]));
  });

  it('derives the requested relationship FKs and records orientation', () => {
    const names = ['Payment', 'Membership', 'User', 'Role', 'Member', 'Workout', 'Trainer', 'Exercise'].map((name) => ({ id: name.toLowerCase(), type: 'uml.Class', name, attributes: ['id: int'] }));
    const pairs = [['payment', 'membership'], ['user', 'role'], ['membership', 'member'], ['workout', 'trainer'], ['exercise', 'workout']];
    const analysis = normalizeAndValidateUml({ elements: names, connections: pairs.map(([sourceId, targetId], index) => ({ id: `r${index}`, type: 'association', sourceId, targetId, sourceMultiplicity: '0..*', targetMultiplicity: '1' })) });
    expect(analysis.relationalModel.relationships.flatMap((relationship) => relationship.foreignKeys)).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'payment', column: 'membership_id', referencedTable: 'membership', referencedColumn: 'id' }),
      expect.objectContaining({ table: 'user', column: 'role_id', referencedTable: 'role', referencedColumn: 'id' }),
      expect.objectContaining({ table: 'membership', column: 'member_id', referencedTable: 'member', referencedColumn: 'id' }),
      expect.objectContaining({ table: 'workout', column: 'trainer_id', referencedTable: 'trainer', referencedColumn: 'id' }),
      expect.objectContaining({ table: 'exercise', column: 'workout_id', referencedTable: 'workout', referencedColumn: 'id' }),
    ]));
    expect(analysis.relationalModel.relationships[0]).toMatchObject({ orientation: 'payment.membership_id -> membership.id', rule: expect.stringContaining('extremo de muchos') });
    expect(analysis.relationalModel.tables.flatMap((table) => table.columns.filter((column) => column.foreignKey).map((column) => column.canonicalName))).toEqual(expect.arrayContaining(['membership_id', 'role_id', 'member_id', 'trainer_id', 'workout_id']));
    expect(analysis.relationalModel.tables.flatMap((table) => table.columns.filter((column) => column.foreignKey))).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'membership_id', sourceType: 'int', javaType: 'Integer', referencedTable: 'membership' }),
      expect.objectContaining({ name: 'role_id', sourceType: 'int', javaType: 'Integer', referencedTable: 'role' }),
      expect.objectContaining({ name: 'member_id', sourceType: 'int', javaType: 'Integer', referencedTable: 'member' }),
      expect.objectContaining({ name: 'trainer_id', sourceType: 'int', javaType: 'Integer', referencedTable: 'trainer' }),
      expect.objectContaining({ name: 'workout_id', sourceType: 'int', javaType: 'Integer', referencedTable: 'workout' }),
    ]));
    expect(analysis.relationalModel.relationships.flatMap((relationship) => relationship.foreignKeys)).toEqual(expect.arrayContaining([
      expect.objectContaining({ column: 'membership_id', sourceType: 'int', javaType: 'Integer' }),
      expect.objectContaining({ column: 'role_id', sourceType: 'int', javaType: 'Integer' }),
    ]));
    expect(analysis.relationalModel.relationships.find((relationship) => relationship.sourceName === 'User' || relationship.targetName === 'User')).toMatchObject({ orientation: 'user.role_id -> role.id', rule: expect.stringContaining('Role-User') });
  });

  it('does not warn for implementation relationships to technical elements', () => {
    const analysis = normalizeAndValidateUml({
      elements: [
        { id: 'user', type: 'uml.Class', name: 'User' },
        { id: 'service', type: 'uml.Interface', name: 'UserService' },
      ],
      connections: [{ id: 'implements', type: 'implementation', sourceId: 'user', targetId: 'service' }],
    });

    expect(analysis.structuredWarnings).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UML_RELATIONSHIP_NO_FK' })]));
    expect(analysis.warnings).toEqual([]);
  });

  it('does not fabricate FKs for isolated or ambiguous relationships', () => {
    const analysis = normalizeAndValidateUml({ elements: [{ id: 'payment', type: 'uml.Class', name: 'MembershipPayment' }, { id: 'a', type: 'uml.Class', name: 'A' }, { id: 'b', type: 'uml.Class', name: 'B' }], connections: [{ id: 'ab', type: 'association', sourceId: 'a', targetId: 'b', sourceMultiplicity: '', targetMultiplicity: '' }] });
    expect(analysis.relationalModel.tables.find((table) => table.name === 'membership_payment')?.columns).toHaveLength(1);
    expect(analysis.relationalModel.relationships[0].foreignKeys).toEqual([]);
    expect(analysis.structuredWarnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UML_RELATIONSHIP_AMBIGUOUS', severity: 'warning', originalValue: '|' })]));
  });
});
