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

  it('preserves and validates UML methods without treating them as attributes', () => {
    const analysis = normalizeAndValidateUml({
      elements: [{ id: 'order', type: 'uml.Class', name: 'Order', methods: ['+calculateTotal(items: List<Order>): Decimal', '-cancel(): void'] }],
      connections: [],
    });

    expect(analysis.errors).toEqual([]);
    expect(analysis.elements[0].structuredMethods).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'calculateTotal', visibility: '+', sourceReturnType: 'Decimal', javaReturnType: 'BigDecimal', parameters: [expect.objectContaining({ name: 'items', sourceType: 'List<Order>', javaType: 'List<Order>' })] }),
      expect.objectContaining({ name: 'cancel', visibility: '-', sourceReturnType: 'void', javaReturnType: 'Void' }),
    ]));
    expect(renderUmlAnalysis(analysis, { enabled: false })).toContain('## Métodos detectados');
    expect(renderUmlAnalysis(analysis, { enabled: false })).toContain('+calculateTotal(items: List<Order>): Decimal');
  });

  it('rejects duplicate operation signatures and incompatible interface returns', () => {
    const duplicate = normalizeAndValidateUml({ elements: [{ id: 'worker', type: 'uml.Class', name: 'Worker', methods: ['+run(items: Array<String>): String', '+run(items: String[]): String'] }], connections: [] });
    const incompatible = normalizeAndValidateUml({ elements: [
      { id: 'contract', type: 'uml.Interface', name: 'Contract', methods: ['+send(): String'] },
      { id: 'worker', type: 'uml.Class', name: 'Worker', methods: ['+send(): Integer'] },
    ], connections: [{ id: 'worker-contract', type: 'implementation', sourceId: 'worker', targetId: 'contract' }] });
    expect(duplicate.errors).toEqual([expect.stringContaining('Firma de operación duplicada')]);
    expect(incompatible.errors).toEqual([expect.stringContaining('retorno Java Integer, incompatible con Contract (String)')]);
  });

  it('validates interface overrides, conflicting parent contracts, and covariant returns', () => {
    const override = normalizeAndValidateUml({ elements: [
      { id: 'parent', type: 'uml.Interface', name: 'ParentContract', methods: ['+read(): String'] },
      { id: 'child', type: 'uml.Interface', name: 'ChildContract', methods: ['+read(): Integer'] },
    ], connections: [{ id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' }] });
    const conflictingParents = normalizeAndValidateUml({ elements: [
      { id: 'parent-a', type: 'uml.Interface', name: 'ParentA', methods: ['+read(): String'] },
      { id: 'parent-b', type: 'uml.Interface', name: 'ParentB', methods: ['+read(): Integer'] },
      { id: 'child', type: 'uml.Interface', name: 'ChildContract' },
    ], connections: [
      { id: 'child-parent-a', type: 'inheritance', sourceId: 'child', targetId: 'parent-a' },
      { id: 'child-parent-b', type: 'inheritance', sourceId: 'child', targetId: 'parent-b' },
    ] });
    const covariant = normalizeAndValidateUml({ elements: [
      { id: 'animal', type: 'uml.Class', name: 'Animal' },
      { id: 'dog', type: 'uml.Class', name: 'Dog' },
      { id: 'parent', type: 'uml.Interface', name: 'ParentContract', methods: ['+read(): Animal'] },
      { id: 'child', type: 'uml.Interface', name: 'ChildContract', methods: ['+read(): Dog'] },
    ], connections: [
      { id: 'dog-animal', type: 'inheritance', sourceId: 'dog', targetId: 'animal' },
      { id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' },
    ] });
    expect(override.errors).toEqual([expect.stringContaining('retorno Java Integer, incompatible con ParentContract (String)')]);
    expect(conflictingParents.errors).toEqual([expect.stringContaining('Requisitos heredados incompatibles en ChildContract.read()')]);
    expect(covariant.errors).toEqual([]);
  });

  it('validates overrides of inherited concrete protected methods', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'parent', type: 'uml.Class', name: 'Parent', methods: ['#read(): String'] },
      { id: 'child', type: 'uml.Class', name: 'Child', methods: ['+read(): Integer'] },
    ], connections: [{ id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' }] });

    expect(analysis.errors).toEqual([expect.stringContaining('retorno Java Integer, incompatible con Parent (String)')]);
  });

  it('rejects instance and required contract methods colliding with inherited static methods', () => {
    const instanceCollision = normalizeAndValidateUml({ elements: [
      { id: 'parent', type: 'uml.Class', name: 'Parent', methods: ['#lookup(): void {static}'] },
      { id: 'child', type: 'uml.Class', name: 'Child', methods: ['+lookup(): void'] },
    ], connections: [{ id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' }] });
    const contractCollision = normalizeAndValidateUml({ elements: [
      { id: 'parent', type: 'uml.Class', name: 'Parent', methods: ['+lookup(): void {static}'] },
      { id: 'contract', type: 'uml.Interface', name: 'Contract', methods: ['+lookup(): void'] },
      { id: 'child', type: 'uml.Class', name: 'Child' },
    ], connections: [
      { id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' },
      { id: 'child-contract', type: 'implementation', sourceId: 'child', targetId: 'contract' },
    ] });
    const staticHiding = normalizeAndValidateUml({ elements: [
      { id: 'parent', type: 'uml.Class', name: 'Parent', methods: ['+lookup(): void {static}'] },
      { id: 'child', type: 'uml.Class', name: 'Child', methods: ['+lookup(): void {static}'] },
    ], connections: [{ id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' }] });
    const privateStatic = normalizeAndValidateUml({ elements: [
      { id: 'parent', type: 'uml.Class', name: 'Parent', methods: ['-lookup(): void {static}'] },
      { id: 'child', type: 'uml.Class', name: 'Child', methods: ['+lookup(): void'] },
    ], connections: [{ id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' }] });

    expect(instanceCollision.errors).toEqual([expect.stringContaining('método estático heredado')]);
    expect(contractCollision.errors).toEqual([expect.stringContaining('método estático heredado')]);
    expect(staticHiding.errors).toEqual([]);
    expect(privateStatic.errors).toEqual([]);
  });

  it('accepts empty relationship multiplicities and renders endpoints separately', () => {
    const analysis = normalizeAndValidateUml({ elements: [{ id: 'a', type: 'uml.Class', name: 'A' }, { id: 'b', type: 'uml.Class', name: 'B' }], connections: [{ id: 'ab', type: 'association', sourceId: 'a', targetId: 'b', sourceMultiplicity: '', targetMultiplicity: '' }] });
    expect(analysis.errors).toEqual([]);
    expect(analysis.connections[0].source).toEqual({ lower: null, upper: null });
    expect(renderUmlAnalysis(analysis, { enabled: false })).toContain('A [sin multiplicidad] -[association]-> [sin multiplicidad] B');
    expect(renderUmlAnalysis(analysis, { enabled: false })).not.toContain('..**');
  });

  it('normalizes supported relationship multiplicities and preserves reversed input separately', () => {
    const snapshot = {
      elements: [
        { id: 'a', type: 'uml.Class', name: 'A' },
        { id: 'b', type: 'uml.Class', name: 'B' },
        { id: 'c', type: 'uml.Class', name: 'C' },
        { id: 'd', type: 'uml.Class', name: 'D' },
      ],
      connections: [
        { id: 'exact-range', type: 'association', sourceId: 'a', targetId: 'b', sourceMultiplicity: '2', targetMultiplicity: '2..3' },
        { id: 'unbounded', type: 'association', sourceId: 'c', targetId: 'd', sourceMultiplicity: '3..*', targetMultiplicity: '*' },
        { id: 'reversed-alias', type: 'association', sourceId: 'a', targetId: 'c', sourceMultiplicity: '1..0', targetMultiplicity: '0..*' },
      ],
    };
    const analysis = normalizeAndValidateUml(snapshot);

    expect(analysis.errors).toEqual([]);
    expect(snapshot.connections[2]).toMatchObject({ sourceMultiplicity: '1..0', targetMultiplicity: '0..*' });
    expect(analysis.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'exact-range', source: { lower: 2, upper: 2 }, target: { lower: 2, upper: 3 } }),
      expect.objectContaining({ id: 'unbounded', source: { lower: 3, upper: null }, target: { lower: 0, upper: null }, targetMultiplicity: '0..*' }),
      expect.objectContaining({ id: 'reversed-alias', source: { lower: 0, upper: 1 }, sourceMultiplicity: '0..1', sourceMultiplicityOriginal: '1..0', target: { lower: 0, upper: null } }),
    ]));
  });

  it('creates association-class and joined-inheritance tables', () => {
    const analysis = normalizeAndValidateUml({
      elements: [
        { id: 'user', type: 'uml.Class', name: 'User', attributes: ['id: int', 'createdAt: date', 'updatedAt: String'] },
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
    ]));
    expect(association?.columns.map((column) => column.name)).not.toEqual(expect.arrayContaining(['created_at', 'updated_at']));
    expect(association?.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'role_id', sourceType: 'UUID', javaType: 'UUID' }),
      expect.objectContaining({ name: 'permission_id', sourceType: 'UUID', javaType: 'UUID' }),
    ]));
    expect(analysis.relationalModel.tables.find((table) => table.name === 'member')).toMatchObject({
      inheritance: { strategy: 'joined', baseTable: 'user', childTable: 'member', foreignKeyColumn: 'id' },
    });
    expect(analysis.relationalModel.tables.find((table) => table.name === 'member')?.columns.find((column) => column.name === 'id')).toMatchObject({ sourceType: 'UUID', javaType: 'UUID', foreignKey: true, referencedTable: 'user', referencedColumn: 'id' });
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

  it('uses generated UUID identity and audit columns instead of UML attributes', () => {
    const analysis = normalizeAndValidateUml({ elements: [{ id: 'member', type: 'uml.Class', name: 'Member', attributes: ['id: Long', 'createdAt: String', 'updatedAt: Long', 'mombershipNumber: String', 'departpment: String', 'rquipement: String'] }], connections: [] });
    const table = analysis.relationalModel.tables[0];
    expect(table.columns.filter((column) => column.name === 'id')).toHaveLength(1);
    expect(table.columns.find((column) => column.sourceName === 'id')).toMatchObject({ name: 'id', sourceType: 'UUID', javaType: 'UUID', primaryKey: true });
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

  it('rejects duplicate physical table names before persistence generation', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'first', type: 'uml.Class', name: 'UserProfile' },
      { id: 'second', type: 'uml.Class', name: 'User_Profile' },
    ], connections: [] });
    expect(analysis.errors).toContain('Nombre físico de tabla duplicado: user_profile');
  });

  it('derives the requested relationship FKs and records orientation', () => {
    const names = ['Payment', 'Membership', 'User', 'Role', 'Member', 'Workout', 'Trainer', 'Exercise'].map((name) => ({ id: name.toLowerCase(), type: 'uml.Class', name, attributes: ['id: int'] }));
    const pairs = [
      { sourceId: 'payment', targetId: 'membership', sourceMultiplicity: '0..*', targetMultiplicity: '1' },
      { sourceId: 'user', targetId: 'role', sourceMultiplicity: '1', targetMultiplicity: '0..*' },
      { sourceId: 'membership', targetId: 'member', sourceMultiplicity: '0..*', targetMultiplicity: '1' },
      { sourceId: 'workout', targetId: 'trainer', sourceMultiplicity: '0..*', targetMultiplicity: '1' },
      { sourceId: 'exercise', targetId: 'workout', sourceMultiplicity: '0..*', targetMultiplicity: '1' },
    ];
    const analysis = normalizeAndValidateUml({ elements: names, connections: pairs.map((pair, index) => ({ id: `r${index}`, type: 'association', ...pair })) });
    expect(analysis.relationalModel.relationships.flatMap((relationship) => relationship.foreignKeys)).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'payment', column: 'membership_id', referencedTable: 'membership', referencedColumn: 'id' }),
      expect.objectContaining({ table: 'role', column: 'user_id', referencedTable: 'user', referencedColumn: 'id' }),
      expect.objectContaining({ table: 'membership', column: 'member_id', referencedTable: 'member', referencedColumn: 'id' }),
      expect.objectContaining({ table: 'workout', column: 'trainer_id', referencedTable: 'trainer', referencedColumn: 'id' }),
      expect.objectContaining({ table: 'exercise', column: 'workout_id', referencedTable: 'workout', referencedColumn: 'id' }),
    ]));
    expect(analysis.relationalModel.relationships[0]).toMatchObject({ orientation: 'payment.membership_id -> membership.id', rule: expect.stringContaining('extremo de muchos') });
    expect(analysis.relationalModel.tables.flatMap((table) => table.columns.filter((column) => column.foreignKey).map((column) => column.canonicalName))).toEqual(expect.arrayContaining(['membership_id', 'member_id', 'user_id', 'trainer_id', 'workout_id']));
    expect(analysis.relationalModel.tables.flatMap((table) => table.columns.filter((column) => column.foreignKey))).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'membership_id', sourceType: 'UUID', javaType: 'UUID', referencedTable: 'membership' }),
      expect.objectContaining({ name: 'user_id', sourceType: 'UUID', javaType: 'UUID', referencedTable: 'user' }),
      expect.objectContaining({ name: 'member_id', sourceType: 'UUID', javaType: 'UUID', referencedTable: 'member' }),
      expect.objectContaining({ name: 'trainer_id', sourceType: 'UUID', javaType: 'UUID', referencedTable: 'trainer' }),
      expect.objectContaining({ name: 'workout_id', sourceType: 'UUID', javaType: 'UUID', referencedTable: 'workout' }),
    ]));
    expect(analysis.relationalModel.relationships.flatMap((relationship) => relationship.foreignKeys)).toEqual(expect.arrayContaining([
      expect.objectContaining({ column: 'membership_id', sourceType: 'UUID', javaType: 'UUID' }),
      expect.objectContaining({ column: 'user_id', sourceType: 'UUID', javaType: 'UUID' }),
    ]));
    const userRole = analysis.relationalModel.relationships.find((relationship) => relationship.sourceName === 'User' || relationship.targetName === 'User');
    expect(userRole).toMatchObject({ orientation: 'role.user_id -> user.id', rule: expect.stringContaining('extremo de muchos') });
    expect(userRole?.rule).not.toMatch(/Role-User|authentication|authorization/i);
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

  it('accepts interface inheritance and rejects class/interface inheritance misuse', () => {
    const valid = normalizeAndValidateUml({
      elements: [
        { id: 'parent', type: 'uml.Interface', name: 'ParentContract' },
        { id: 'child', type: 'uml.Interface', name: 'ChildContract' },
      ],
      connections: [{ id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' }],
    });
    const invalid = normalizeAndValidateUml({
      elements: [
        { id: 'class', type: 'uml.Class', name: 'Worker' },
        { id: 'interface', type: 'uml.Interface', name: 'Contract' },
      ],
      connections: [{ id: 'class-interface', type: 'inheritance', sourceId: 'class', targetId: 'interface' }],
    });
    expect(valid.errors).toEqual([]);
    expect(invalid.errors).toEqual([expect.stringContaining('herencia class-interface')]);
  });

  it('does not fabricate FKs for isolated or ambiguous relationships', () => {
    const analysis = normalizeAndValidateUml({ elements: [{ id: 'payment', type: 'uml.Class', name: 'MembershipPayment' }, { id: 'a', type: 'uml.Class', name: 'A' }, { id: 'b', type: 'uml.Class', name: 'B' }], connections: [{ id: 'ab', type: 'association', sourceId: 'a', targetId: 'b', sourceMultiplicity: '', targetMultiplicity: '' }] });
    expect(analysis.relationalModel.tables.find((table) => table.name === 'membership_payment')?.columns).toHaveLength(1);
    expect(analysis.relationalModel.relationships[0].foreignKeys).toEqual([]);
    expect(analysis.structuredWarnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UML_RELATIONSHIP_AMBIGUOUS', severity: 'warning', originalValue: '|' })]));
  });

  it('normalizes optional member semantics and canonicalizes legacy enum usage', () => {
    const analysis = normalizeAndValidateUml({
      elements: [
        { id: 'status', type: 'uml.Enumeration', name: 'Status', literals: ['ACTIVE'] },
        { id: 'user', type: 'uml.Class', name: 'User', attributes: ['-/total: int = 0 {static}'], methods: ['#reset(): void {abstract, static}'] },
      ],
      connections: [{ id: 'uses-status', type: 'enumUsage', sourceId: 'status', targetId: 'user' }],
    });

    expect(analysis.errors).toEqual([]);
    expect(analysis.elements.find((element) => element.id === 'user')?.structuredAttributes[0]).toMatchObject({ isStatic: true, isDerived: true, defaultValue: '0' });
    expect(analysis.elements.find((element) => element.id === 'user')?.structuredMethods[0]).toMatchObject({ isStatic: true, isAbstract: true });
    expect(analysis.connections[0]).toMatchObject({ type: 'dependency', usage: 'enum', stereotype: 'use', sourceId: 'user', targetId: 'status' });
  });

  it('reports actionable relationship endpoint, self-link, multiplicity, and composition errors', () => {
    const analysis = normalizeAndValidateUml({
      elements: [
        { id: 'class', type: 'uml.Class', name: 'Class' },
        { id: 'interface', type: 'uml.Interface', name: 'Contract' },
        { id: 'enum', type: 'uml.Enumeration', name: 'Status', literals: ['ACTIVE'] },
      ],
      connections: [
        { id: 'bad-association', type: 'association', sourceId: 'class', targetId: 'enum' },
        { id: 'bad-implementation', type: 'implementation', sourceId: 'interface', targetId: 'class' },
        { id: 'self', type: 'association', sourceId: 'class', targetId: 'class' },
        { id: 'bad-multiplicity', type: 'association', sourceId: 'class', targetId: 'interface', sourceMultiplicity: '2..1' },
        { id: 'bad-composition', type: 'composition', sourceId: 'class', targetId: 'class', sourceMultiplicity: '0..*' },
      ],
    });

    expect(analysis.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('requiere clases o clases abstractas'),
      expect.stringContaining('requiere una clase concreta y una interfaz'),
      expect.stringContaining('no puede conectar una clase consigo misma'),
      expect.stringContaining('multiplicidad inválida'),
      expect.stringContaining('composición'),
    ]));
  });

  it('rejects malformed multiplicity syntax as well as invalid semantic ranges', () => {
    const analysis = normalizeAndValidateUml({
      elements: [{ id: 'a', type: 'uml.Class', name: 'A' }, { id: 'b', type: 'uml.Class', name: 'B' }],
      connections: [
        { id: 'malformed', type: 'association', sourceId: 'a', targetId: 'b', sourceMultiplicity: 'many', targetMultiplicity: '1...0' },
        { id: 'reversed', type: 'association', sourceId: 'a', targetId: 'b', sourceMultiplicity: '2..1', targetMultiplicity: '1' },
      ],
    });

    expect(analysis.errors.filter((error) => error.includes('multiplicidad'))).toHaveLength(2);
  });
});
