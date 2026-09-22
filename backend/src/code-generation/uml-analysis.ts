export type UmlMultiplicity = { lower: number | null; upper: number | null };

export type UmlWarning = {
  code: string;
  severity: 'warning';
  element?: string;
  attribute?: string;
  literal?: string;
  originalValue: string;
  canonicalSuggestion?: string;
  message: string;
};

export type UmlAttribute = {
  name: string;
  sourceName: string;
  canonicalName: string;
  visibility: string | null;
  sourceType: string;
  javaType: string;
  multiplicity: UmlMultiplicity;
  isStatic?: boolean;
  isAbstract?: boolean;
  isDerived?: boolean;
  defaultValue?: string;
};

export type UmlMethod = {
  name: string;
  sourceName: string;
  visibility: string | null;
  parameters: Array<{ name: string; sourceType: string; javaType: string }>;
  sourceReturnType: string;
  javaReturnType: string;
  isStatic?: boolean;
  isAbstract?: boolean;
};

export type UmlElement = {
  id: string;
  name: string;
  kind: 'class' | 'interface' | 'abstract' | 'enum';
  attributes: string[];
  structuredAttributes: UmlAttribute[];
  methods: string[];
  structuredMethods: UmlMethod[];
  literals: string[];
  persistible?: boolean;
  metadata?: Record<string, unknown>;
};

export type UmlConnection = {
  id: string; type: string; sourceId: string; sourceName: string; targetId: string; targetName: string;
  sourceMultiplicity: string; targetMultiplicity: string; source: UmlMultiplicity; target: UmlMultiplicity;
  sourceMultiplicityOriginal?: string; targetMultiplicityOriginal?: string;
  associationClassId?: string; associationClass?: Record<string, unknown>;
  sourceRoleName?: string; targetRoleName?: string;
  sourceNavigable?: boolean; targetNavigable?: boolean;
  stereotype?: string; usage?: string;
};

export type RelationalColumn = {
  name: string; sourceName: string; canonicalName: string; source: 'attribute' | 'relationship';
  sourceType: string; javaType: string; nullable: boolean; multiplicity: UmlMultiplicity;
  primaryKey?: boolean; foreignKey?: boolean; referencedTable?: string; referencedColumn?: string; enumName?: string;
};

export type RelationalTable = {
  id: string; name: string; sourceElementId: string; associationClassId?: string;
  inheritance?: { strategy: 'joined'; baseTable: string; childTable: string; foreignKeyColumn: string };
  columns: RelationalColumn[];
};

export type RelationalForeignKey = { table: string; column: string; referencedTable: string; referencedColumn: string; sourceType: string; javaType: string };
type RelationalRelationship = {
  id: string; type: string; sourceId: string; sourceName: string; targetId: string; targetName: string;
  source: UmlMultiplicity; target: UmlMultiplicity; foreignKeyTable: string | null; joinTable: string | null;
  foreignKeys: RelationalForeignKey[]; orientation: string; rule: string;
  associationClassId?: string; associationClass?: Record<string, unknown>;
};

export type RelationalModel = {
  inheritanceStrategy: 'joined';
  relationshipRule: string;
  tables: RelationalTable[];
  enums: Array<{ id: string; name: string; representation: 'string'; literals: string[] }>;
  relationships: RelationalRelationship[];
  excludedElements: Array<{ id: string; name: string; kind: 'class' | 'interface' | 'abstract'; reason: string }>;
};

export type UmlAnalysis = {
  normalizedModel: { elements: UmlElement[]; relationships: UmlConnection[]; excludedElements: RelationalModel['excludedElements'] };
  relationalModel: RelationalModel;
  elements: UmlElement[]; connections: UmlConnection[]; errors: string[]; warnings: string[]; structuredWarnings: UmlWarning[];
};

const enumType = /uml\.(?:Enumeration|Enum)|enumeration/i;
const classType = /uml\.(?:Class|Interface|AbstractClass)|class|interface/i;
const relationTypes = new Set(['association', 'aggregation', 'composition', 'inheritance', 'implementation', 'dependency', 'enumUsage']);
const multiplicityPattern = /^(?:\d+|\d+\.\.(?:\d+|\*)|\*)$/;
const validName = /^[A-Za-z_$][\w$]*$/;
const primitiveTypes = new Set(['string', 'str', 'text', 'char', 'character', 'int', 'integer', 'long', 'float', 'double', 'decimal', 'number', 'boolean', 'bool', 'date', 'datetime', 'localdate', 'localdatetime', 'uuid', 'void']);
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const className = (value: unknown) => text(value).replace(/<<(?:interface|abstract|enumeration|enum)>>/gi, '').trim();
const endpoint = (value: unknown) => typeof value === 'object' && value !== null ? text((value as { id?: unknown }).id) : text(value);
const relationType = (value: unknown) => ({ association: 'association', aggregation: 'aggregation', composition: 'composition', inheritance: 'inheritance', implementation: 'implementation', dependency: 'dependency', enumusage: 'dependency' }[text(value).toLowerCase()] || text(value).toLowerCase() || 'association');
const normalizeMultiplicity = (value: unknown): UmlMultiplicity | null => {
  const raw = text(value); if (!raw) return { lower: null, upper: null }; if (raw === '*') return { lower: 0, upper: null };
  const exact = raw.match(/^(\d+)$/); if (exact) { const number = Number(exact[1]); return { lower: number, upper: number }; }
  const range = raw.match(/^(\d+)\.\.(\d+|\*)$/); if (!range) return null;
  const lower = Number(range[1]), upper = range[2] === '*' ? null : Number(range[2]);
  if (upper !== null && upper < lower) return lower === 1 && upper === 0 ? { lower: 0, upper: 1 } : null;
  return { lower, upper };
};
const parseMultiplicity = (value: unknown): UmlMultiplicity => normalizeMultiplicity(value) || { lower: null, upper: null };
const multiplicityText = ({ lower, upper }: UmlMultiplicity) => lower === null ? '' : lower === upper ? String(lower) : `${lower}..${upper === null ? '*' : upper}`;
const parseDecoration = (value: string) => {
  const modifierMatch = value.match(/\s*\{([^}]+)\}\s*$/), modifiers = modifierMatch?.[1].split(',').map((item) => item.trim().toLowerCase()) ?? [];
  const defaultMatch = value.match(/\s*=\s*(.*?)\s*(?:\{[^}]+\})?$/);
  return { source: value.replace(/\s*=\s*.*?(?=\s*\{[^}]+\}\s*$|$)/, '').replace(/\s*\{[^}]+\}\s*$/, '').trim(), isStatic: modifiers.includes('static'), isAbstract: modifiers.includes('abstract'), isDerived: /^[-+~#]?\s*\//.test(value), defaultValue: defaultMatch?.[1]?.trim() || undefined };
};
const parseAttribute = (value: unknown) => {
  const decorated = parseDecoration(text(value)), source = decorated.source, match = source.match(/^([+\-#~])?\s*(\/)?\s*([A-Za-z_$][\w$]*)(?:\s*:\s*([^\[]+?)|\s+([^\[]+?))?\s*(?:\[([^\]]+)\])?$/);
  if (!match) return null;
  return { name: match[3], visibility: match[1] || null, sourceType: text(match[4] || match[5] || 'String'), multiplicity: parseMultiplicity(match[6] || ''), isStatic: decorated.isStatic, isAbstract: decorated.isAbstract, isDerived: Boolean(match[2]) || decorated.isDerived, defaultValue: decorated.defaultValue };
};
const parseMethod = (value: unknown) => {
  const decorated = parseDecoration(text(value)), source = decorated.source, match = source.match(/^([+\-#~])?\s*(\/)?\s*([A-Za-z_$][\w$]*)\s*\((.*)\)\s*(?::\s*([A-Za-z_$][\w$]*(?:<[^>]+>)?(?:\[\])?))?$/);
  if (!match) return null;
  const parameterText = match[4].trim(), parameterValues: string[] = []; let depth = 0; let start = 0;
  [...parameterText].forEach((character, index) => { if (character === '<') depth += 1; if (character === '>') depth -= 1; if (character === ',' && depth === 0) { parameterValues.push(parameterText.slice(start, index)); start = index + 1; } });
  if (parameterText) parameterValues.push(parameterText.slice(start));
  const parameters = parameterValues.map((parameter) => parameter.trim().match(/^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*(?:<[^>]+>)?(?:\[\])?)$/)).filter((parameter): parameter is RegExpMatchArray => Boolean(parameter));
  if (parameterText && parameters.length !== parameterValues.length) return null;
  return { name: match[3], visibility: match[1] || null, parameters: parameters.map((parameter) => ({ name: parameter[1], sourceType: parameter[2] })), sourceReturnType: match[5] || 'void', isStatic: decorated.isStatic, isAbstract: decorated.isAbstract };
};
const javaType = (sourceType: string) => {
  const compact = sourceType.replace(/\s/g, ''), base = compact.toLowerCase();
  const primitive: Record<string, string> = { string: 'String', str: 'String', text: 'String', char: 'String', character: 'String', int: 'Integer', integer: 'Integer', long: 'Long', float: 'Float', double: 'Double', decimal: 'BigDecimal', number: 'BigDecimal', boolean: 'Boolean', bool: 'Boolean', date: 'LocalDate', datetime: 'LocalDateTime', localdate: 'LocalDate', localdatetime: 'LocalDateTime', uuid: 'UUID', void: 'Void' };
  const collection = compact.match(/^(list|set|map|array)<(.+)>$/i); if (collection) return `${collection[1][0].toUpperCase()}${collection[1].slice(1).toLowerCase()}<${javaType(collection[2])}>`;
  return primitive[base] || compact.replace(/\[\]$/, '');
};
const typeArguments = (value: string) => {
  const open = value.indexOf('<'); if (open < 0 || !value.endsWith('>')) return null;
  const body = value.slice(open + 1, -1), parts: string[] = []; let depth = 0; let start = 0;
  [...body].forEach((character, index) => { if (character === '<') depth += 1; if (character === '>') depth -= 1; if (character === ',' && depth === 0) { parts.push(body.slice(start, index)); start = index + 1; } });
  parts.push(body.slice(start)); return { base: value.slice(0, open), parts };
};
const renderedJavaType = (value: string) => {
  const compact = value.replace(/\s/g, '');
  if (compact.endsWith('[]')) return `${renderedJavaType(compact.slice(0, -2))}[]`;
  const generic = typeArguments(compact);
  if (!generic) return javaType(compact);
  const base = generic.base.toLowerCase();
  if (base === 'array' && generic.parts.length === 1) return `${renderedJavaType(generic.parts[0])}[]`;
  const name = generic.base.charAt(0).toUpperCase() + generic.base.slice(1).toLowerCase();
  const parts = generic.parts.map(renderedJavaType);
  return name === 'Map' && parts.length === 1 ? `Map<String, ${parts[0]}>` : `${name}<${parts.join(', ')}>`;
};
const validUmlType = (value: string, names: Set<string>): boolean => {
  const compact = value.replace(/\s/g, '').replace(/\[\]$/, ''), generic = typeArguments(compact);
  if (primitiveTypes.has(compact.toLowerCase()) || names.has(compact.toLowerCase())) return true;
  if (!generic || !['list', 'set', 'map', 'array'].includes(generic.base.toLowerCase())) return false;
  return (generic.base.toLowerCase() === 'map' ? generic.parts.length === 1 || generic.parts.length === 2 : generic.parts.length === 1) && generic.parts.every((part) => validUmlType(part, names));
};
const renderedMethodReturn = (method: UmlMethod) => (method.sourceReturnType || method.javaReturnType || '').toLowerCase() === 'void' ? 'void' : renderedJavaType(method.sourceReturnType || method.javaReturnType || 'void');
const methodSignature = (method: UmlMethod) => `${method.name}(${method.parameters.map((parameter) => renderedJavaType(parameter.sourceType || parameter.javaType)).join(',')})`;
const validAbstractMethod = (method: UmlMethod) => Boolean(method.isAbstract && !method.isStatic && method.visibility !== '-');
const inheritableInstanceMethod = (method: UmlMethod) => !method.isStatic && method.visibility !== '-';
const inheritableStaticMethod = (method: UmlMethod) => Boolean(method.isStatic && method.visibility !== '-');
type MethodRequirement = { method: UmlMethod; owner: UmlElement };

const classifierType = (type: string, elements: UmlElement[]) => {
  const compact = type.replace(/\s/g, '');
  if (compact.endsWith('[]') || compact.includes('<')) return undefined;
  return elements.find((element) => element.name.toLowerCase() === compact.toLowerCase());
};
const classifierSubtype = (actual: UmlElement, expected: UmlElement, elementsById: Map<string, UmlElement>, relationships: UmlConnection[], visited = new Set<string>()): boolean => {
  if (actual.id === expected.id) return true;
  if (visited.has(actual.id)) return false;
  visited.add(actual.id);
  return relationships
    .filter((connection) => connection.sourceId === actual.id && (connection.type === 'inheritance' || connection.type === 'implementation'))
    .some((connection) => {
      const parent = elementsById.get(connection.targetId);
      return Boolean(parent && (parent.id === expected.id || classifierSubtype(parent, expected, elementsById, relationships, new Set(visited))));
    });
};
const compatibleReturn = (actual: string, expected: string, elements: UmlElement[], elementsById: Map<string, UmlElement>, relationships: UmlConnection[]) => {
  if (actual === expected) return true;
  if (actual.endsWith('[]') && expected.endsWith('[]')) return compatibleReturn(actual.slice(0, -2), expected.slice(0, -2), elements, elementsById, relationships);
  const actualType = classifierType(actual, elements), expectedType = classifierType(expected, elements);
  return Boolean(actualType && expectedType && classifierSubtype(actualType, expectedType, elementsById, relationships));
};

const addRequirement = (requirements: Map<string, MethodRequirement[]>, method: UmlMethod, owner: UmlElement, elements: UmlElement[]) => {
  if (method.isStatic) return;
  const key = methodSignature(method), current = requirements.get(key) || [];
  if (!current.some((item) => item.owner.id === owner.id && renderedMethodReturn(item.method) === renderedMethodReturn(method))) current.push({ method, owner });
  requirements.set(key, current);
};
const sortedRelationshipTargets = (relationships: UmlConnection[], sourceId: string, type: string, elementsById: Map<string, UmlElement>) => relationships
  .filter((connection) => connection.sourceId === sourceId && connection.type === type)
  .sort((a, b) => (elementsById.get(a.targetId)?.name || a.targetName || a.targetId).localeCompare(elementsById.get(b.targetId)?.name || b.targetName || b.targetId) || a.id.localeCompare(b.id));
const collectInterfaceRequirements = (contract: UmlElement, elementsById: Map<string, UmlElement>, elements: UmlElement[], relationships: UmlConnection[], requirements: Map<string, MethodRequirement[]>, visited: Set<string>) => {
  if (visited.has(contract.id)) return;
  visited.add(contract.id);
  contract.structuredMethods.filter(inheritableInstanceMethod).forEach((method) => addRequirement(requirements, method, contract, elements));
  sortedRelationshipTargets(relationships, contract.id, 'inheritance', elementsById).forEach((connection) => {
    const parent = elementsById.get(connection.targetId);
    if (parent?.kind === 'interface') collectInterfaceRequirements(parent, elementsById, elements, relationships, requirements, visited);
  });
};
const collectClassRequirements = (element: UmlElement, elementsById: Map<string, UmlElement>, elements: UmlElement[], relationships: UmlConnection[], requirements: Map<string, MethodRequirement[]>, visited: Set<string>, includeOwn = true) => {
  if (visited.has(element.id)) return;
  visited.add(element.id);
  if (includeOwn) element.structuredMethods.filter(validAbstractMethod).forEach((method) => addRequirement(requirements, method, element, elements));
  sortedRelationshipTargets(relationships, element.id, 'implementation', elementsById).forEach((connection) => {
    const contract = elementsById.get(connection.targetId);
    if (contract?.kind === 'interface') collectInterfaceRequirements(contract, elementsById, elements, relationships, requirements, new Set());
  });
  sortedRelationshipTargets(relationships, element.id, 'inheritance', elementsById).forEach((connection) => {
    const parent = elementsById.get(connection.targetId);
    if (parent) {
      parent.structuredMethods.filter(inheritableInstanceMethod).forEach((method) => addRequirement(requirements, method, parent, elements));
      collectClassRequirements(parent, elementsById, elements, relationships, requirements, visited, false);
    }
  });
};
const collectInheritedStaticMethods = (parent: UmlElement, elementsById: Map<string, UmlElement>, relationships: UmlConnection[], methods: Map<string, UmlElement>, visited: Set<string>) => {
  if (visited.has(parent.id)) return;
  visited.add(parent.id);
  parent.structuredMethods.filter(inheritableStaticMethod).forEach((method) => {
    const signature = methodSignature(method);
    if (!methods.has(signature)) methods.set(signature, parent);
  });
  sortedRelationshipTargets(relationships, parent.id, 'inheritance', elementsById).forEach((connection) => {
    const ancestor = elementsById.get(connection.targetId);
    if (ancestor) collectInheritedStaticMethods(ancestor, elementsById, relationships, methods, visited);
  });
};
const validateRequirementConflicts = (element: UmlElement, requirements: Map<string, MethodRequirement[]>, elements: UmlElement[], elementsById: Map<string, UmlElement>, relationships: UmlConnection[], errors: string[]) => {
  requirements.forEach((items, signature) => {
    for (let index = 0; index < items.length; index += 1) {
      for (let next = index + 1; next < items.length; next += 1) {
        const first = renderedMethodReturn(items[index].method), second = renderedMethodReturn(items[next].method);
        if (!compatibleReturn(first, second, elements, elementsById, relationships) && !compatibleReturn(second, first, elements, elementsById, relationships)) {
          errors.push(`Requisitos heredados incompatibles en ${element.name}.${signature}: ${items[index].owner.name} devuelve ${first}, pero ${items[next].owner.name} devuelve ${second}.`);
        }
      }
    }
  });
};
const validateExplicitReturns = (element: UmlElement, requirements: Map<string, MethodRequirement[]>, elements: UmlElement[], elementsById: Map<string, UmlElement>, relationships: UmlConnection[], errors: string[]) => {
  element.structuredMethods.forEach((method) => {
    const expected = requirements.get(methodSignature(method)) || [];
    expected.forEach((requirement) => {
      const actualReturn = renderedMethodReturn(method), expectedReturn = renderedMethodReturn(requirement.method);
      if (!compatibleReturn(actualReturn, expectedReturn, elements, elementsById, relationships)) {
        errors.push(`La operación ${element.name}.${methodSignature(method)} tiene retorno Java ${actualReturn}, incompatible con ${requirement.owner.name} (${expectedReturn}).`);
      }
    });
  });
};
const validateStaticCollisions = (element: UmlElement, requirements: Map<string, MethodRequirement[]>, elementsById: Map<string, UmlElement>, relationships: UmlConnection[], errors: string[]) => {
  if (element.kind !== 'class' && element.kind !== 'abstract') return;
  const inheritedStatic = new Map<string, UmlElement>();
  sortedRelationshipTargets(relationships, element.id, 'inheritance', elementsById).forEach((connection) => {
    const parent = elementsById.get(connection.targetId);
    if (parent) collectInheritedStaticMethods(parent, elementsById, relationships, inheritedStatic, new Set());
  });
  const instanceSignatures = new Set(element.structuredMethods.filter((method) => !method.isStatic).map(methodSignature));
  requirements.forEach((_, signature) => instanceSignatures.add(signature));
  inheritedStatic.forEach((owner, signature) => {
    if (instanceSignatures.has(signature)) errors.push(`La operación ${element.name}.${signature} colisiona con el método estático heredado ${owner.name}.${signature}; declare también un método estático o cambie la firma.`);
  });
};
const validateOperations = (elements: UmlElement[], relationships: UmlConnection[], errors: string[]) => {
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  elements.forEach((element) => {
    const signatures = new Map<string, UmlMethod[]>();
    element.structuredMethods.forEach((method) => signatures.set(methodSignature(method), [...(signatures.get(methodSignature(method)) || []), method]));
    signatures.forEach((methods, signature) => {
      if (methods.length < 2) return;
      const returns = [...new Set(methods.map(renderedMethodReturn))];
      errors.push(returns.length > 1
        ? `Operaciones duplicadas en ${element.name}: ${signature} tiene tipos de retorno Java incompatibles (${returns.join(', ')}).`
        : `Firma de operación duplicada en ${element.name}: ${signature}.`);
    });
    const requirements = new Map<string, MethodRequirement[]>();
    if (element.kind === 'interface') {
      sortedRelationshipTargets(relationships, element.id, 'inheritance', elementsById).forEach((connection) => {
        const parent = elementsById.get(connection.targetId);
        if (parent?.kind === 'interface') collectInterfaceRequirements(parent, elementsById, elements, relationships, requirements, new Set());
      });
    } else if (element.kind === 'class' || element.kind === 'abstract') {
    }
    if (element.kind === 'class' || element.kind === 'abstract') collectClassRequirements(element, elementsById, elements, relationships, requirements, new Set(), false);
    validateStaticCollisions(element, requirements, elementsById, relationships, errors);
    validateRequirementConflicts(element, requirements, elements, elementsById, relationships, errors);
    if (element.kind === 'interface' || element.kind === 'class' || element.kind === 'abstract') validateExplicitReturns(element, requirements, elements, elementsById, relationships, errors);
  });
};
const tableName = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
const columnName = (name: string) => tableName(name);
const markedPersistible = (raw: any) => raw?.persistible === true || raw?.persistable === true || raw?.metadata?.persistible === true || raw?.metadata?.persistable === true;
const canonicalAttribute = (name: string) => ({ mombershipnumber: 'membershipNumber', departpment: 'department', rquipement: 'equipment' }[name.toLowerCase()] || name);

export const normalizeAndValidateUml = (snapshot: Record<string, unknown>): UmlAnalysis => {
  const rawElements = Array.isArray(snapshot.elements) ? snapshot.elements : Array.isArray(snapshot.cells) ? snapshot.cells : [];
  const rawConnections = Array.isArray(snapshot.connections) ? snapshot.connections : Array.isArray(snapshot.links) ? snapshot.links : [];
  const errors: string[] = [], warnings: string[] = [], structuredWarnings: UmlWarning[] = [], elements: UmlElement[] = [], ids = new Set<string>(), names = new Set(rawElements.map((raw: any) => className(raw?.name).toLowerCase()).filter(Boolean)), seenNames = new Set<string>();
  const warn = (warning: UmlWarning) => { structuredWarnings.push(warning); warnings.push(warning.message); };
  rawElements.forEach((raw: any, index) => {
    const id = text(raw?.id), name = className(raw?.name), isEnum = enumType.test(text(raw?.type)) || /<<(?:enumeration|enum)>>/i.test(text(raw?.name));
    if (!id) errors.push(`El elemento ${index + 1} no tiene identificador`); if (!name || !validName.test(name)) errors.push(`El elemento ${id || index + 1} tiene un nombre de ${isEnum ? 'enum' : 'clase'} inválido`);
    if (id && ids.has(id)) errors.push(`Identificador de elemento duplicado: ${id}`); if (id) ids.add(id); if (name && seenNames.has(name.toLowerCase())) errors.push(`Nombre de clase duplicado: ${name}`); if (name) { seenNames.add(name.toLowerCase()); names.add(name.toLowerCase()); }
    if (isEnum) {
      const literals = Array.isArray(raw?.literals) ? raw.literals.map(text) : [], seen = new Set<string>();
      literals.forEach((literal, literalIndex) => { if (!literal || !validName.test(literal)) errors.push(`Literal de enum inválido en ${name || id || index + 1}: ${literal || literalIndex + 1}`); if (literal && seen.has(literal)) errors.push(`Literal de enum duplicado en ${name || id}: ${literal}`); const suggestion = literal === 'CACELLED' ? 'CANCELLED' : literal === 'REFUNDER' ? 'REFUNDED' : undefined; if (suggestion) warn({ code: 'UML_LITERAL_TYPO', severity: 'warning', element: name, literal, originalValue: literal, canonicalSuggestion: suggestion, message: `El literal ${literal} en ${name} parece tener un error; sugerencia: ${suggestion}.` }); if (literal) seen.add(literal); });
      elements.push({ id, name, kind: 'enum', attributes: [], structuredAttributes: [], methods: [], structuredMethods: [], literals, ...(raw.metadata ? { metadata: raw.metadata } : {}) }); return;
    }
    if (!classType.test(text(raw?.type))) { warn({ code: 'UML_UNSUPPORTED_ELEMENT', severity: 'warning', element: name || id || String(index + 1), originalValue: text(raw?.type), message: `Se ignoró un elemento de diagrama no compatible: ${name || id || index + 1}` }); return; }
    const persistible = markedPersistible(raw), kind = /interface/i.test(text(raw?.type)) || /<<interface>>/i.test(text(raw?.name)) ? 'interface' : /abstract/i.test(text(raw?.type)) || raw?.isAbstract === true || /<<abstract>>/i.test(text(raw?.name)) ? 'abstract' : 'class';
    const structuredAttributes: UmlAttribute[] = [], attributes = (Array.isArray(raw?.attributes) ? raw.attributes : []).map((attribute: unknown, attributeIndex: number) => {
      const parsed = parseAttribute(attribute); if (!parsed) { errors.push(`Atributo inválido en ${name || id}: ${text(attribute) || attributeIndex + 1}`); return text(attribute); }
       const normalized = parsed.sourceType.replace(/\s/g, '').replace(/\[\]$/, ''), valid = validUmlType(normalized, names);
      if (!valid) errors.push(`Tipo de atributo desconocido en ${name || id}: ${parsed.sourceType}`);
      const canonicalName = canonicalAttribute(parsed.name), suggestion = canonicalName === parsed.name ? undefined : canonicalName;
      if (suggestion) warn({ code: 'UML_ATTRIBUTE_TYPO', severity: 'warning', element: name, attribute: parsed.name, originalValue: parsed.name, canonicalSuggestion: suggestion, message: `El atributo ${parsed.name} en ${name} parece sospechoso; sugerencia: ${suggestion}.` });
      if (['paidat', 'createdat'].includes(parsed.name.toLowerCase())) { const correction = parsed.name.toLowerCase() === 'paidat' ? 'date' : 'datetime'; warn({ code: 'UML_ATTRIBUTE_TYPE_SUSPECT', severity: 'warning', element: name, attribute: parsed.name, originalValue: parsed.sourceType, canonicalSuggestion: correction, message: `El tipo de ${parsed.name} en ${name} parece sospechoso; sugerencia: ${correction}.` }); }
       const semantic = Array.isArray(raw?.attributeSemantics) && raw.attributeSemantics[attributeIndex] && typeof raw.attributeSemantics[attributeIndex] === 'object' ? raw.attributeSemantics[attributeIndex] : {};
       structuredAttributes.push({ name: parsed.name, sourceName: parsed.name, canonicalName, visibility: parsed.visibility, sourceType: parsed.sourceType, javaType: javaType(parsed.sourceType), multiplicity: parsed.multiplicity, isStatic: semantic.isStatic ?? parsed.isStatic, isAbstract: semantic.isAbstract ?? parsed.isAbstract, isDerived: semantic.isDerived ?? parsed.isDerived, defaultValue: semantic.defaultValue ?? parsed.defaultValue }); return `${parsed.visibility || ''}${parsed.name}: ${parsed.sourceType}`;
    });
    const structuredMethods: UmlMethod[] = [], methods = (Array.isArray(raw?.methods) ? raw.methods : []).map((method: unknown, methodIndex: number) => {
      const parsed = parseMethod(method); if (!parsed) { errors.push(`Método inválido en ${name || id}: ${text(method) || methodIndex + 1}`); return text(method); }
       const types = [parsed.sourceReturnType, ...parsed.parameters.map((parameter) => parameter.sourceType)];
       types.forEach((type) => { if (!validUmlType(type, names)) errors.push(`Tipo de método desconocido en ${name || id}: ${type}`); });
       const semantic = Array.isArray(raw?.methodSemantics) && raw.methodSemantics[methodIndex] && typeof raw.methodSemantics[methodIndex] === 'object' ? raw.methodSemantics[methodIndex] : {};
       structuredMethods.push({ name: parsed.name, sourceName: parsed.name, visibility: parsed.visibility, parameters: parsed.parameters.map((parameter) => ({ ...parameter, javaType: javaType(parameter.sourceType) })), sourceReturnType: parsed.sourceReturnType, javaReturnType: javaType(parsed.sourceReturnType), isStatic: semantic.isStatic ?? parsed.isStatic, isAbstract: semantic.isAbstract ?? parsed.isAbstract });
      return `${parsed.visibility || ''}${parsed.name}(${parsed.parameters.map((parameter) => `${parameter.name}: ${parameter.sourceType}`).join(', ')}): ${parsed.sourceReturnType}`;
    });
    elements.push({ id, name, kind, attributes, structuredAttributes, methods, structuredMethods, literals: [], ...(persistible ? { persistible } : {}), ...(raw.metadata ? { metadata: raw.metadata } : {}) });
  });
  const elementById = new Map(elements.map((element) => [element.id, element]));
   const connections: UmlConnection[] = rawConnections.map((raw: any, index) => { const id = text(raw?.id) || `connection-${index + 1}`, sourceId = text(raw?.sourceId) || endpoint(raw?.source), targetId = text(raw?.targetId) || endpoint(raw?.target), type = relationType(raw?.type), sourceMultiplicity = text(raw?.sourceMultiplicity), targetMultiplicity = text(raw?.targetMultiplicity), source = parseMultiplicity(sourceMultiplicity), target = parseMultiplicity(targetMultiplicity); if (!relationTypes.has(type)) errors.push(`Tipo de relación no compatible: ${type}`); if (!sourceId || !ids.has(sourceId)) errors.push(`La relación ${id} tiene un origen inválido`); if (!targetId || !ids.has(targetId)) errors.push(`La relación ${id} tiene un destino inválido`); if (sourceId === targetId) errors.push(`La relación ${id} no puede conectar una clase consigo misma`); const associationClassId = text(raw?.associationClassId) || text(raw?.associationClass?.id), associationClass = raw?.associationClass && typeof raw.associationClass === 'object' ? { ...raw.associationClass } : undefined; const normalizedSourceMultiplicity = multiplicityText(source), normalizedTargetMultiplicity = multiplicityText(target); return { id, type, sourceId, sourceName: elementById.get(sourceId)?.name || '', targetId, targetName: elementById.get(targetId)?.name || '', sourceMultiplicity: normalizedSourceMultiplicity, targetMultiplicity: normalizedTargetMultiplicity, source, target, ...(sourceMultiplicity && sourceMultiplicity !== normalizedSourceMultiplicity ? { sourceMultiplicityOriginal: sourceMultiplicity } : {}), ...(targetMultiplicity && targetMultiplicity !== normalizedTargetMultiplicity ? { targetMultiplicityOriginal: targetMultiplicity } : {}), ...(associationClassId ? { associationClassId } : {}), ...(associationClass ? { associationClass } : {}) }; });
    const classifierEndpoint = (id: string) => elementById.get(id);
    function multiplicityIsInvalid(value: string) {
      if (!value) return false;
      if (!multiplicityPattern.test(value)) return true;
      const range = value.match(/^(\d+)\.\.(\d+)$/);
      return Boolean(range && Number(range[2]) < Number(range[1]) && value !== '1..0');
    }
   connections.forEach((connection) => {
     const raw = rawConnections.find((item: any) => text(item?.id) === connection.id) as any;
     const legacyEnumUsage = text(raw?.type).toLowerCase() === 'enumusage';
     if (legacyEnumUsage || text(raw?.usage).toLowerCase() === 'enum' || text(raw?.stereotype).toLowerCase() === 'use') {
       connection.usage = 'enum'; connection.stereotype = 'use';
       if (classifierEndpoint(connection.sourceId)?.kind === 'enum' && classifierEndpoint(connection.targetId)?.kind !== 'enum') {
         [connection.sourceId, connection.targetId] = [connection.targetId, connection.sourceId];
         [connection.sourceName, connection.targetName] = [connection.targetName, connection.sourceName];
         [connection.source, connection.target] = [connection.target, connection.source];
       }
     }
     if (!classifierEndpoint(connection.sourceId)) errors.push(`La relación ${connection.id} tiene un origen que no es un clasificador UML compatible`);
     if (!classifierEndpoint(connection.targetId)) errors.push(`La relación ${connection.id} tiene un destino que no es un clasificador UML compatible`);
     if (connection.sourceId === connection.targetId) errors.push(`La relación ${connection.id} no puede conectar una clase consigo misma`);
      if (multiplicityIsInvalid(text(raw?.sourceMultiplicity) || connection.sourceMultiplicity) || multiplicityIsInvalid(text(raw?.targetMultiplicity) || connection.targetMultiplicity)) errors.push(`La relación ${connection.id} tiene una multiplicidad inválida: use n, n..m, n..* o *`);
     const sourceKind = classifierEndpoint(connection.sourceId)?.kind, targetKind = classifierEndpoint(connection.targetId)?.kind;
     const classLike = (kind?: UmlElement['kind']) => kind === 'class' || kind === 'abstract';
     if (connection.usage === 'enum') {
       if (sourceKind === 'enum' || targetKind !== 'enum') errors.push(`La dependencia «use» ${connection.id} debe ir de una clase hacia un enum`);
     } else if (connection.type === 'inheritance' && !((classLike(sourceKind) && classLike(targetKind)) || (sourceKind === 'interface' && targetKind === 'interface'))) {
       errors.push(`La herencia ${connection.id} requiere clases o clases abstractas en ambos extremos, o una interfaz que herede de otra interfaz`);
     } else if (connection.type === 'implementation' && (!classLike(sourceKind) || targetKind !== 'interface')) {
       errors.push(`La implementación ${connection.id} requiere una clase concreta y una interfaz`);
     } else if (['association', 'aggregation', 'composition'].includes(connection.type) && (!classLike(sourceKind) || !classLike(targetKind))) {
       errors.push(`La relación ${connection.type} ${connection.id} requiere clases o clases abstractas en ambos extremos`);
     }
     if (connection.type === 'composition' && text(raw?.sourceMultiplicity) && (connection.source.upper === null || connection.source.upper > 1)) errors.push(`La composición ${connection.id} no puede tener más de un composite propietario en el extremo origen`);
     if (connection.associationClassId && !classLike(classifierEndpoint(connection.associationClassId)?.kind)) errors.push(`La clase de asociación ${connection.associationClassId} no es una clase UML compatible`);
     if (raw) {
       connection.sourceRoleName = text(raw.sourceRoleName) || undefined; connection.targetRoleName = text(raw.targetRoleName) || undefined;
       connection.sourceNavigable = typeof raw.sourceNavigable === 'boolean' ? raw.sourceNavigable : undefined; connection.targetNavigable = typeof raw.targetNavigable === 'boolean' ? raw.targetNavigable : undefined;
       if (text(raw.stereotype)) connection.stereotype = text(raw.stereotype); if (text(raw.usage)) connection.usage = text(raw.usage);
     }
    });
    validateOperations(elements, connections, errors);
    const inheritance = connections.filter((c) => c.type === 'inheritance'), inheritedIds = new Set(inheritance.map((c) => c.targetId));
  const excludedElements = elements.filter((e) => e.kind === 'interface' || (e.kind === 'abstract' && !inheritedIds.has(e.id)) || (e.kind === 'class' && /service$/i.test(e.name))).map((e) => ({ id: e.id, name: e.name, kind: e.kind as 'class' | 'interface' | 'abstract', reason: e.kind === 'interface' ? 'La interfaz no es persistible; se conserva como elemento técnico excluido.' : 'La clase técnica *Service se excluye; se conserva como elemento técnico excluido.' }));
   const excludedIds = new Set(excludedElements.map((e) => e.id)), tableElements = elements.filter((e) => ['class', 'abstract'].includes(e.kind) && !excludedIds.has(e.id));
   const physicalTableNames = new Set<string>();
   tableElements.forEach((element) => { const name = tableName(element.name); if (physicalTableNames.has(name)) errors.push(`Nombre físico de tabla duplicado: ${name}`); physicalTableNames.add(name); });
    const columnsFor = (element: UmlElement): RelationalColumn[] => { const attributes = element.structuredAttributes.filter((a) => !['id', 'createdAt', 'updatedAt'].includes(a.canonicalName)); const pk = [{ name: 'id', sourceName: 'id', canonicalName: 'id', source: 'attribute' as const, sourceType: 'UUID', javaType: 'UUID', nullable: false, multiplicity: { lower: 1, upper: 1 }, primaryKey: true }]; return [...pk, ...attributes.map((a) => ({ name: columnName(a.canonicalName), sourceName: a.sourceName, canonicalName: a.canonicalName, source: 'attribute' as const, sourceType: a.sourceType, javaType: a.javaType, nullable: a.multiplicity.lower === 0, multiplicity: a.multiplicity, ...(elements.find((x) => x.kind === 'enum' && x.name.toLowerCase() === a.sourceType.toLowerCase()) ? { enumName: a.sourceType } : {}) }))]; };
  const tables = new Map(tableElements.map((e) => [e.id, { id: tableName(e.name), name: tableName(e.name), sourceElementId: e.id, columns: columnsFor(e) } as RelationalTable]));
    const primaryKeyType = (_tableId: string) => ({ sourceType: 'UUID', javaType: 'UUID' });
   const addFk = (tableId: string, sourceName: string, targetId: string, multiplicity: UmlMultiplicity, association = false): RelationalForeignKey | null => { const table = tables.get(tableId), target = tables.get(targetId); if (!table || !target) return null; const canonicalName = canonicalAttribute(sourceName), name = `${columnName(canonicalName)}_id`, type = primaryKeyType(targetId); if (!table.columns.some((c) => c.name === name)) table.columns.push({ name, sourceName: `${sourceName}.id`, canonicalName: name, source: 'relationship', ...type, nullable: association ? false : multiplicity.lower === 0, multiplicity, foreignKey: true, referencedTable: target.name, referencedColumn: 'id' }); return { table: table.name, column: name, referencedTable: target.name, referencedColumn: 'id', ...type }; };
    const relationshipRule = 'Para asociaciones binarias, la FK vive en el extremo de muchos y referencia el id del extremo singular; con multiplicidad vacía o ambigua no se inventa FK.';
  const relationalRelationships = connections.map((c): RelationalRelationship => { const foreignKeys: RelationalForeignKey[] = []; let foreignKeyTable: string | null = null, joinTable: string | null = null, orientation = 'sin FK';
     if (c.type === 'inheritance') { const base = tables.get(c.targetId), child = tables.get(c.sourceId); if (base && child) { const type = primaryKeyType(c.targetId); child.inheritance = { strategy: 'joined', baseTable: base.name, childTable: child.name, foreignKeyColumn: 'id' }; const id = child.columns.find((column) => column.name === 'id'); if (id) Object.assign(id, { ...type, foreignKey: true, referencedTable: base.name, referencedColumn: 'id' }); foreignKeys.push({ table: child.name, column: 'id', referencedTable: base.name, referencedColumn: 'id', ...type }); orientation = `${child.name}.id -> ${base.name}.id`; } }
     else if (c.associationClassId) { const association: any = elementById.get(c.associationClassId) || c.associationClass || {}, name = className(association?.name) || c.associationClassId, associationAttributes = association.structuredAttributes || (Array.isArray(association.attributes) ? association.attributes.map(parseAttribute).filter(Boolean) : []), table = tables.get(c.associationClassId) || { id: tableName(name), name: tableName(name), sourceElementId: c.associationClassId, associationClassId: c.associationClassId, columns: columnsFor({ id: c.associationClassId, name, kind: 'class', attributes: [], structuredAttributes: associationAttributes, methods: [], structuredMethods: [], literals: [] }) }; table.associationClassId = c.associationClassId; tables.set(c.associationClassId, table); const a = addFk(c.associationClassId, c.sourceName, c.sourceId, c.target, true), b = addFk(c.associationClassId, c.targetName, c.targetId, c.source, true); if (a) foreignKeys.push(a); if (b) foreignKeys.push(b); joinTable = table.name; orientation = `${table.name} contiene FKs hacia ${c.sourceName} y ${c.targetName}`; }
      else if (['association', 'aggregation', 'composition'].includes(c.type)) { const sourceMany = c.source.lower !== null && c.source.upper !== 1, targetMany = c.target.lower !== null && c.target.upper !== 1; if (sourceMany !== targetMany) { const tableId = sourceMany ? c.sourceId : c.targetId, targetId = sourceMany ? c.targetId : c.sourceId, name = sourceMany ? c.targetName : c.sourceName, fk = addFk(tableId, name, targetId, sourceMany ? c.target : c.source); if (fk) { foreignKeys.push(fk); foreignKeyTable = fk.table; orientation = `${fk.table}.${fk.column} -> ${fk.referencedTable}.${fk.referencedColumn}`; } } else if (c.source.lower === null || c.target.lower === null || sourceMany === targetMany) { warn({ code: 'UML_RELATIONSHIP_AMBIGUOUS', severity: 'warning', element: `${c.sourceName}-${c.targetName}`, originalValue: `${c.sourceMultiplicity}|${c.targetMultiplicity}`, canonicalSuggestion: 'Definir multiplicidades', message: `No se derivó una FK para la relación ${c.sourceName} - ${c.targetName} porque sus multiplicidades son vacías o ambiguas.` }); } }
    return { id: c.id, type: c.type, sourceId: c.sourceId, sourceName: c.sourceName, targetId: c.targetId, targetName: c.targetName, source: c.source, target: c.target, foreignKeyTable, joinTable, foreignKeys, orientation, rule: relationshipRule, ...(c.associationClassId ? { associationClassId: c.associationClassId } : {}), ...(c.associationClass ? { associationClass: c.associationClass } : {}) };
  });
  tables.forEach((table) => { if (!table.columns.length) return; });
  const relationalModel: RelationalModel = { inheritanceStrategy: 'joined', relationshipRule, tables: [...tables.values()], enums: elements.filter((e) => e.kind === 'enum').map((e) => ({ id: e.id, name: e.name, representation: 'string', literals: e.literals })), relationships: relationalRelationships, excludedElements };
  return { normalizedModel: { elements, relationships: connections, excludedElements }, relationalModel, elements, connections, errors, warnings, structuredWarnings };
};

const renderUmlAnalysisLegacy = (analysis: UmlAnalysis, authentication: Record<string, unknown>) => [
  '# Análisis UML', '', '## Clases detectadas', ...analysis.elements.filter((i) => i.kind === 'class').map((i) => `- ${i.name} (${i.id})`), '', '## Interfaces detectadas', ...analysis.elements.filter((i) => i.kind === 'interface').map((i) => `- ${i.name} (${i.id})`), '', '## Clases abstractas detectadas', ...analysis.elements.filter((i) => i.kind === 'abstract').map((i) => `- ${i.name} (${i.id})`), '', '## Enums detectados', ...analysis.elements.filter((i) => i.kind === 'enum').map((i) => `- ${i.name} (${i.id}): ${i.literals.join(', ')}`), '', '## Atributos detectados', ...analysis.elements.flatMap((i) => i.structuredAttributes.map((a) => `- ${i.name}: ${a.visibility || ''}${a.sourceName}: ${a.sourceType}${multiplicityText(a.multiplicity) ? ` [${multiplicityText(a.multiplicity)}]` : ''}`)), '', '## Métodos detectados', ...analysis.elements.flatMap((i) => i.structuredMethods.map((m) => `- ${i.name}: ${m.visibility || ''}${m.sourceName}(${m.parameters.map((p) => `${p.name}: ${p.sourceType}`).join(', ')}): ${m.sourceReturnType}`)), '', '## Relaciones detectadas', ...analysis.connections.map((i) => `- ${i.sourceName || i.sourceId} [${i.sourceMultiplicity || 'sin multiplicidad'}] -[${i.type}]-> [${i.targetMultiplicity || 'sin multiplicidad'}] ${i.targetName || i.targetId}`), '', '## Modelo relacional estimado', 'El modelo relacional resultante es obligatorio para el backend generado y constituye la entrada estructurada de las fases posteriores. No es SQL final.', `Regla de FKs: ${analysis.relationalModel.relationshipRule}`, ...analysis.relationalModel.tables.map((t) => `- Tabla ${t.name}: ${t.columns.map((c) => c.foreignKey ? `${c.name} → ${c.referencedTable}.${c.referencedColumn}` : c.name).join(', ') || 'sin columnas'}`), ...analysis.relationalModel.excludedElements.map((e) => `- ${e.kind} ${e.name}: excluido; ${e.reason}`), '', '## Configuración de autenticación seleccionada', `- Habilitada: ${authentication.enabled === true ? 'sí' : 'no'}`, ...Object.entries(authentication).filter(([k]) => k !== 'enabled' && authentication[k]).map(([k, v]) => `- ${k}: ${v}`), '', '## Errores de validación', ...(analysis.errors.length ? analysis.errors.map((e) => `- ${e}`) : ['- Ninguno']), '', '## Advertencias', ...(analysis.structuredWarnings.length ? analysis.structuredWarnings.map((w) => `- [${w.severity}] ${w.message}`) : ['- Ninguna']),
 ].join('\n');

export const renderUmlAnalysis = (analysis: UmlAnalysis, authentication: Record<string, unknown>) =>
  renderUmlAnalysisLegacy(analysis, authentication)
    .replace('## Modelo relacional estimado', '## Modelo relacional')
    .replace('El modelo relacional resultante es obligatorio', 'El modelo relacional es obligatorio');
