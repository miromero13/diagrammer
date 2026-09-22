import { featurePackageName } from './feature-name';
import { UmlConnection, UmlElement, UmlMethod } from './uml-analysis';

const primitiveTypes: Record<string, string> = {
  string: 'String', str: 'String', text: 'String', char: 'String', character: 'String',
  int: 'Integer', integer: 'Integer', long: 'Long', float: 'Float', double: 'Double',
  decimal: 'BigDecimal', bigdecimal: 'BigDecimal', number: 'BigDecimal', boolean: 'Boolean', bool: 'Boolean',
  date: 'LocalDate', datetime: 'LocalDateTime', localdate: 'LocalDate', localdatetime: 'LocalDateTime',
  uuid: 'UUID', void: 'void',
};

const javaImports: Record<string, string> = {
  BigDecimal: 'java.math.BigDecimal',
  LocalDate: 'java.time.LocalDate',
  LocalDateTime: 'java.time.LocalDateTime',
  List: 'java.util.List',
  Map: 'java.util.Map',
  Set: 'java.util.Set',
  UUID: 'java.util.UUID',
};

const classLike = (element?: UmlElement) => element?.kind === 'class' || element?.kind === 'abstract';
const entityName = (element: UmlElement) => `${element.name}Entity`;
const elementMap = (elements: UmlElement[]) => new Map(elements.map((element) => [element.name.toLowerCase(), element]));
const sortedConnections = (relationships: UmlConnection[], sourceId: string, type: string, elementsById: Map<string, UmlElement>) => relationships
  .filter((connection) => connection.sourceId === sourceId && connection.type === type)
  .sort((a, b) => (elementsById.get(a.targetId)?.name || a.targetName || a.targetId).localeCompare(elementsById.get(b.targetId)?.name || b.targetName || b.targetId) || a.id.localeCompare(b.id));

const splitGeneric = (value: string) => {
  const open = value.indexOf('<');
  if (open < 0 || !value.endsWith('>')) return null;
  const base = value.slice(0, open);
  const body = value.slice(open + 1, -1);
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  [...body].forEach((character, index) => {
    if (character === '<') depth += 1;
    if (character === '>') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
  });
  parts.push(body.slice(start));
  return { base, parts };
};

const referencedElement = (type: string, elements: Map<string, UmlElement>) => elements.get(type.toLowerCase());

const renderedElementType = (element: UmlElement) => element.kind === 'interface' || element.kind === 'enum' ? element.name : entityName(element);

export const renderedType = (type: string, elements: Map<string, UmlElement>): string => {
  const compact = (type || 'void').replace(/\s/g, '');
  if (compact.endsWith('[]')) return `${renderedType(compact.slice(0, -2), elements)}[]`;
  const generic = splitGeneric(compact);
  if (generic) {
    const base = generic.base.toLowerCase();
    if (base === 'array' && generic.parts.length === 1) return `${renderedType(generic.parts[0], elements)}[]`;
    const name = generic.base.charAt(0).toUpperCase() + generic.base.slice(1).toLowerCase();
    const parts = generic.parts.map((part) => renderedType(part, elements));
    return name === 'Map' && parts.length === 1 ? `Map<String, ${parts[0]}>` : `${name}<${parts.join(', ')}>`;
  }
  return primitiveTypes[compact.toLowerCase()] || renderedElementType(referencedElement(compact, elements) || { name: compact, kind: 'class' } as UmlElement);
};

export const importForType = (type: string, elements: Map<string, UmlElement>, basePackage: string, result: Set<string>) => {
  const compact = (type || '').replace(/\s/g, '');
  if (compact.endsWith('[]')) return importForType(compact.slice(0, -2), elements, basePackage, result);
  const generic = splitGeneric(compact);
  if (generic) {
    const name = generic.base.charAt(0).toUpperCase() + generic.base.slice(1).toLowerCase();
    if (javaImports[name]) result.add(javaImports[name]);
    generic.parts.forEach((part) => importForType(part, elements, basePackage, result));
    return;
  }
  if (javaImports[renderedType(compact, elements)]) result.add(javaImports[renderedType(compact, elements)]);
  const element = referencedElement(compact, elements);
  if (element) {
    const packageName = element.kind === 'enum' ? `${basePackage}.common.enums` : `${basePackage}.${featurePackageName(element.name)}`;
    result.add(`${packageName}.${renderedElementType(element)}`);
  }
};

const methodReturnType = (method: UmlMethod) => method.sourceReturnType || method.javaReturnType || 'void';
const methodParameterType = (parameter: UmlMethod['parameters'][number]) => parameter.sourceType || parameter.javaType;
const methodKey = (method: UmlMethod, elements: Map<string, UmlElement>) => `${method.name}(${method.parameters.map((parameter) => renderedType(methodParameterType(parameter), elements)).join(',')})`;
const javaAbstractMethod = (method: UmlMethod) => Boolean(method.isAbstract && !method.isStatic && method.visibility !== '-');
const publicInstanceMethod = (method: UmlMethod) => !method.isStatic && (method.visibility === '+' || method.visibility === null);
const classifierSubtype = (actual: UmlElement, expected: UmlElement, elementsById: Map<string, UmlElement>, relationships: UmlConnection[], visited = new Set<string>()): boolean => {
  if (actual.id === expected.id) return true;
  if (visited.has(actual.id)) return false;
  visited.add(actual.id);
  return relationships
    .filter((connection) => connection.sourceId === actual.id && (connection.type === 'inheritance' || connection.type === 'implementation'))
    .some((connection) => {
      const parent = elementsById.get(connection.targetId);
      return Boolean(parent && classifierSubtype(parent, expected, elementsById, relationships, new Set(visited)));
    });
};
const arrayComponentType = (type: string) => {
  const compact = type.replace(/\s/g, '');
  if (compact.endsWith('[]')) return compact.slice(0, -2);
  const array = compact.match(/^array<(.+)>$/i);
  return array?.[1];
};
const returnTypeCompatible = (actual: string, expected: string, elementsById: Map<string, UmlElement>, elements: Map<string, UmlElement>, relationships: UmlConnection[]): boolean => {
  const actualReturn = renderedType(actual, elements), expectedReturn = renderedType(expected, elements);
  if (actualReturn === expectedReturn) return true;
  const actualComponent = arrayComponentType(actual), expectedComponent = arrayComponentType(expected);
  if (Boolean(actualComponent) !== Boolean(expectedComponent)) return false;
  if (actualComponent && expectedComponent) return returnTypeCompatible(actualComponent, expectedComponent, elementsById, elements, relationships);
  const actualElement = elements.get(actual.replace(/\s/g, '').toLowerCase()), expectedElement = elements.get(expected.replace(/\s/g, '').toLowerCase());
  return Boolean(actualElement && expectedElement && classifierSubtype(actualElement, expectedElement, elementsById, relationships));
};
const returnCompatible = (actual: UmlMethod, expected: UmlMethod, elementsById: Map<string, UmlElement>, elements: Map<string, UmlElement>, relationships: UmlConnection[]) => {
  return returnTypeCompatible(methodReturnType(actual), methodReturnType(expected), elementsById, elements, relationships);
};
const selectRequiredMethod = (current: UmlMethod | undefined, candidate: UmlMethod, elementsById: Map<string, UmlElement>, elements: Map<string, UmlElement>, relationships: UmlConnection[]) => {
  if (!current) return candidate;
  if (returnCompatible(candidate, current, elementsById, elements, relationships)) return candidate;
  if (returnCompatible(current, candidate, elementsById, elements, relationships)) return current;
  const currentReturn = renderedType(methodReturnType(current), elements), candidateReturn = renderedType(methodReturnType(candidate), elements);
  return candidateReturn.localeCompare(currentReturn) < 0 ? candidate : current;
};
const addRequiredMethod = (result: Map<string, UmlMethod>, method: UmlMethod, elementsById: Map<string, UmlElement>, elements: Map<string, UmlElement>, relationships: UmlConnection[]) => {
  const key = methodKey(method, elements);
  result.set(key, selectRequiredMethod(result.get(key), method, elementsById, elements, relationships));
};

const addInterfaceMethods = (contract: UmlElement, elementsById: Map<string, UmlElement>, typeElements: Map<string, UmlElement>, relationships: UmlConnection[], result: Map<string, UmlMethod>, visited: Set<string>) => {
  if (visited.has(contract.id)) return;
  visited.add(contract.id);
  contract.structuredMethods.filter((method) => !method.isStatic).forEach((method) => addRequiredMethod(result, method, elementsById, typeElements, relationships));
  sortedConnections(relationships, contract.id, 'inheritance', elementsById).forEach((connection) => {
    const parent = elementsById.get(connection.targetId);
    if (parent?.kind === 'interface') addInterfaceMethods(parent, elementsById, typeElements, relationships, result, visited);
  });
};

const requiredInterfaceMethods = (element: UmlElement, elementsById: Map<string, UmlElement>, typeElements: Map<string, UmlElement>, relationships: UmlConnection[], result: Map<string, UmlMethod>) => {
  sortedConnections(relationships, element.id, 'implementation', elementsById).forEach((connection) => {
    const contract = elementsById.get(connection.targetId);
    if (contract?.kind === 'interface') addInterfaceMethods(contract, elementsById, typeElements, relationships, result, new Set());
  });
};

const requiredParentMethods = (parent: UmlElement, elementsById: Map<string, UmlElement>, typeElements: Map<string, UmlElement>, relationships: UmlConnection[], result: Map<string, UmlMethod>, visited: Set<string>) => {
  if (visited.has(parent.id)) return;
  visited.add(parent.id);
  parent.structuredMethods.filter(javaAbstractMethod).forEach((method) => addRequiredMethod(result, method, elementsById, typeElements, relationships));
  if (parent.kind === 'abstract' || isPromotedAbstract(parent)) requiredInterfaceMethods(parent, elementsById, typeElements, relationships, result);
  sortedConnections(relationships, parent.id, 'inheritance', elementsById).forEach((connection) => {
    const ancestor = elementsById.get(connection.targetId);
    if (ancestor) requiredParentMethods(ancestor, elementsById, typeElements, relationships, result, visited);
  });
};

export const isPromotedAbstract = (element: UmlElement) => element.kind === 'class' && element.structuredMethods.some(javaAbstractMethod);

const inheritedConcreteMethods = (parent: UmlElement, elementsById: Map<string, UmlElement>, typeElements: Map<string, UmlElement>, relationships: UmlConnection[], result: Map<string, UmlMethod>, visited: Set<string>) => {
  if (visited.has(parent.id)) return;
  visited.add(parent.id);
  parent.structuredMethods.filter((method) => publicInstanceMethod(method) && !javaAbstractMethod(method)).forEach((method) => addRequiredMethod(result, method, elementsById, typeElements, relationships));
  if (parent.kind === 'class' && !isPromotedAbstract(parent)) {
    const generated = new Map<string, UmlMethod>();
    requiredInterfaceMethods(parent, elementsById, typeElements, relationships, generated);
    relationships.filter((connection) => connection.sourceId === parent.id && connection.type === 'inheritance').forEach((connection) => {
      const ancestor = elementsById.get(connection.targetId);
      if (ancestor) requiredParentMethods(ancestor, elementsById, typeElements, relationships, generated, new Set());
    });
    generated.forEach((method) => addRequiredMethod(result, method, elementsById, typeElements, relationships));
  }
  sortedConnections(relationships, parent.id, 'inheritance', elementsById).forEach((connection) => {
    const ancestor = elementsById.get(connection.targetId);
    if (ancestor) inheritedConcreteMethods(ancestor, elementsById, typeElements, relationships, result, visited);
  });
};

export const operationPlan = (element: UmlElement, elements: UmlElement[], relationships: UmlConnection[]) => {
  const map = elementMap(elements);
  const byId = new Map(elements.map((candidate) => [candidate.id, candidate]));
  const required = new Map<string, UmlMethod>();
  if (element.kind === 'class' || element.kind === 'abstract') {
    requiredInterfaceMethods(element, byId, map, relationships, required);
  }
  const inherited = new Map<string, UmlMethod>();
  if (element.kind === 'class' && !isPromotedAbstract(element)) {
    sortedConnections(relationships, element.id, 'inheritance', byId).forEach((connection) => {
      const parent = byId.get(connection.targetId);
      if (parent) {
        inheritedConcreteMethods(parent, byId, map, relationships, inherited, new Set());
        requiredParentMethods(parent, byId, map, relationships, required, new Set());
      }
    });
    inherited.forEach((method, key) => {
      const requiredMethod = required.get(key);
      if (requiredMethod && returnCompatible(method, requiredMethod, byId, map, relationships)) required.delete(key);
    });
  }
  const canRemainAbstract = element.kind === 'abstract' || isPromotedAbstract(element);
  const methods: UmlMethod[] = [];
  const seen = new Set<string>();
  element.structuredMethods.forEach((method) => {
    const key = methodKey(method, map);
    const normalized = required.has(key)
      ? { ...method, visibility: '+', isStatic: false, isAbstract: canRemainAbstract && Boolean(method.isAbstract) }
      : method;
    if (!seen.has(key)) { seen.add(key); methods.push(normalized); }
  });
  if (element.kind === 'class' && !isPromotedAbstract(element)) {
    [...required.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([key, method]) => {
      if (!seen.has(key)) { seen.add(key); methods.push({ ...method, visibility: '+', isStatic: false, isAbstract: false }); }
    });
  }
  return { methods, promotedAbstract: isPromotedAbstract(element), map };
};

export const operationImports = (element: UmlElement, elements: UmlElement[], relationships: UmlConnection[], basePackage: string) => {
  const plan = operationPlan(element, elements, relationships);
  const imports = new Set<string>();
  plan.methods.forEach((method) => {
    importForType(methodReturnType(method), plan.map, basePackage, imports);
    method.parameters.forEach((parameter) => importForType(methodParameterType(parameter), plan.map, basePackage, imports));
  });
  return imports;
};

const unsupportedBody = (name: string) => ` {\n        throw new UnsupportedOperationException("UML operation requires implementation: ${name}");\n    }`;

export const renderOperations = (element: UmlElement, elements: UmlElement[], relationships: UmlConnection[]) => {
  const plan = operationPlan(element, elements, relationships);
  return plan.methods.map((method) => {
    const returnType = renderedType(methodReturnType(method), plan.map);
    const parameters = method.parameters.map((parameter) => `${renderedType(methodParameterType(parameter), plan.map)} ${parameter.name}`).join(', ');
    if (element.kind === 'interface') {
      const staticMethod = Boolean(method.isStatic);
      const visibility = staticMethod && method.visibility === '-' ? 'private' : 'public';
      const abstract = method.isAbstract && !staticMethod ? ' abstract' : '';
      return `    ${visibility}${staticMethod ? ' static' : ''}${abstract} ${returnType} ${method.name}(${parameters})${staticMethod ? unsupportedBody(method.name) : ';'}`;
    }
    const abstract = javaAbstractMethod(method) && (element.kind === 'abstract' || plan.promotedAbstract);
    const visibility = method.visibility === '+' || method.visibility === null ? 'public' : method.visibility === '-' ? 'private' : method.visibility === '#' ? 'protected' : '';
    const modifiers = [visibility, method.isStatic && 'static', abstract && 'abstract'].filter(Boolean).join(' ');
    return `    ${modifiers ? `${modifiers} ` : ''}${returnType} ${method.name}(${parameters})${abstract ? ';' : unsupportedBody(method.name)}`;
  }).join('\n\n');
};

export const relationshipDeclaration = (element: UmlElement, elements: UmlElement[], relationships: UmlConnection[], basePackage: string, defaultExtends?: string) => {
  const map = new Map(elements.map((candidate) => [candidate.id, candidate]));
  const parents = sortedConnections(relationships, element.id, 'inheritance', map)
    .map((connection) => map.get(connection.targetId))
    .filter((candidate): candidate is UmlElement => Boolean(candidate && (element.kind === 'interface' ? candidate.kind === 'interface' : classLike(candidate))))
    .filter((candidate, index, values) => values.findIndex((item) => item.id === candidate.id) === index);
  const interfaces = [...new Map(relationships
    .filter((connection) => connection.sourceId === element.id && connection.type === 'implementation')
    .map((connection) => map.get(connection.targetId))
    .filter((candidate): candidate is UmlElement => candidate?.kind === 'interface')
    .map((candidate) => [candidate.name, candidate])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedParents = element.kind === 'interface' ? parents : parents.slice(0, 1);
  const extendsTypes = selectedParents.map(renderedElementType);
  const imports = new Set<string>();
  [...selectedParents, ...interfaces].forEach((target) => {
    const packageName = target.kind === 'enum' ? `${basePackage}.common.enums` : `${basePackage}.${featurePackageName(target.name)}`;
    imports.add(`${packageName}.${renderedElementType(target)}`);
  });
  return { extendsType: extendsTypes[0] || defaultExtends, extendsTypes, implementsTypes: interfaces.map((candidate) => candidate.name), imports };
};

export const renderedTypeForElement = renderedElementType;
