import { randomUUID } from 'crypto';

type DiagramElement = { id?: unknown; name?: unknown; attributes?: unknown[] };
type DiagramConnection = { id?: unknown; sourceId?: unknown; targetId?: unknown; source?: unknown; target?: unknown };
type DiagramData = { elements?: DiagramElement[]; connections?: DiagramConnection[]; content?: DiagramData; links?: DiagramConnection[] };

export type DiagramCommandResult = {
  success: boolean;
  message: string;
  actions: Array<Record<string, unknown>>;
};

const identifier = /^[A-Za-z_$][\w$]*$/;
const multiplicity = /^(?:\d+|\d+\.\.\*|\d+\.\.\d+|\*)$/;
const typeName = /^[A-Za-z_$][\w$]*(?:<[A-Za-z_$][\w$]*>)?(?:\[\])?$/;

const guide = `No pude interpretar el comando. Usa una instrucción por línea o separada por punto y coma:
crear clase Nombre
crear interfaz Nombre
crear clase abstracta Nombre
crear enum Nombre A, B, C
agregar atributo nombre:Tipo a Clase
eliminar atributo nombre de Clase
renombrar Clase a NuevoNombre
eliminar Clase
crear relación Origen 1 -> * Destino
eliminar relación Origen -> Destino`;

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const elementName = (element: DiagramElement) => text(element.name).replace(/^<<(?:interface|abstract|enumeration|enum)>>\n/i, '');
const endpoint = (value: unknown) => typeof value === 'object' && value !== null ? text((value as { id?: unknown }).id) : text(value);

export const containsDiagramCommand = (message: string): boolean => message.split(/[;\n]/).some((part) =>
  /^(?:crear\s+(?:clase|interfaz|enum|relación)|agregar\s+atributo|eliminar\s+(?:atributo|relación)|renombrar|eliminar\s+\S+)(?=\s|$)/i.test(part.trim()));

export const parseDiagramCommands = (message: string, diagramData?: DiagramData | null): DiagramCommandResult => {
  const commands = message.split(/[;\n]/).map((command) => command.trim()).filter(Boolean);
  if (commands.length === 0) return { success: false, message: guide, actions: [] };

  const content = diagramData?.content ?? diagramData ?? {};
  const elements: DiagramElement[] = Array.isArray(content.elements) ? content.elements.map((element) => ({ ...element, attributes: Array.isArray(element.attributes) ? [...element.attributes] : [] })) : [];
  const connections: DiagramConnection[] = Array.isArray(content.connections) ? content.connections.map((connection) => ({ ...connection })) : Array.isArray(content.links) ? content.links.map((connection) => ({ ...connection })) : [];
  const actions: Array<Record<string, unknown>> = [];
  const understood: string[] = [];

  const fail = (message: string): DiagramCommandResult => ({ success: false, message: `${message}\n\n${guide}`, actions: [] });
  const valid = (value: string, label: string) => identifier.test(value) ? null : fail(`${label} inválido: "${value}". Debe ser un identificador UML/Java.`);
  const resolveElement = (reference: string): DiagramElement | DiagramCommandResult => {
    const matches = elements.filter((element) => elementName(element).toLowerCase() === reference.toLowerCase());
    if (matches.length === 0) return fail(`No existe la clase o interfaz "${reference}" en el diagrama.`);
    if (matches.length > 1) return fail(`La referencia "${reference}" es ambigua: hay ${matches.length} elementos con ese nombre.`);
    return matches[0];
  };

  for (const command of commands) {
    let match = command.match(/^crear clase abstracta\s+([A-Za-z_$][\w$]*)$/i);
    if (match) {
      const name = match[1];
      if (elements.some((element) => elementName(element).toLowerCase() === name.toLowerCase())) return fail(`Ya existe un elemento llamado "${name}".`);
      const id = randomUUID();
      elements.push({ id, name, attributes: [] });
      actions.push({ type: 'create_abstract_class', data: { id, name, attributes: [], methods: [], position: { x: 100, y: 100 } } });
      understood.push(`crear clase abstracta ${name}`);
      continue;
    }

    match = command.match(/^crear (clase|interfaz)\s+([A-Za-z_$][\w$]*)$/i);
    if (match) {
      const [, kind, name] = match;
      if (elements.some((element) => elementName(element).toLowerCase() === name.toLowerCase())) return fail(`Ya existe un elemento llamado "${name}".`);
      const id = randomUUID();
      elements.push({ id, name, attributes: [] });
      actions.push({ type: kind.toLowerCase() === 'interfaz' ? 'create_interface' : 'create_class', data: { id, name, attributes: [], methods: [], position: { x: 100, y: 100 } } });
      understood.push(`crear ${kind.toLowerCase()} ${name}`);
      continue;
    }

    match = command.match(/^crear enum\s+([A-Za-z_$][\w$]*)\s+(.+)$/i);
    if (match) {
      const [, name, values] = match;
      if (elements.some((element) => elementName(element).toLowerCase() === name.toLowerCase())) return fail(`Ya existe un elemento llamado "${name}".`);
      const literals = values.split(',').map((value) => value.trim());
      if (literals.length === 0 || literals.some((literal) => !identifier.test(literal))) return fail('Los literales del enum deben ser identificadores UML/Java separados por comas.');
      if (new Set(literals.map((literal) => literal.toLowerCase())).size !== literals.length) return fail(`El enum "${name}" tiene literales duplicados.`);
      const id = randomUUID();
      elements.push({ id, name, attributes: [] });
      actions.push({ type: 'create_enum', data: { id, name, literals, position: { x: 100, y: 100 } } });
      understood.push(`crear enum ${name}`);
      continue;
    }

    match = command.match(/^agregar atributo\s+([A-Za-z_$][\w$]*)\s*:\s*([^\s]+)\s+a\s+([A-Za-z_$][\w$]*)$/i);
    if (match) {
      const [, name, type, targetName] = match;
      const invalidName = valid(name, 'El nombre del atributo');
      if (invalidName || !typeName.test(type)) return invalidName ?? fail(`El tipo "${type}" no es compatible con UML/Java.`);
      const target = resolveElement(targetName);
      if ('success' in target) return target;
      const attributes = target.attributes as string[];
      if (attributes.some((attribute) => text(attribute).replace(/^[+\-#~]\s*/, '').split(/\s*:/)[0] === name)) return fail(`El atributo "${name}" ya existe en "${targetName}".`);
      attributes.push(`${name}: ${type}`);
      actions.push({ type: 'add_attribute', data: { targetId: text(target.id), addAttributes: [`${name}: ${type}`] } });
      understood.push(`agregar atributo ${name}:${type} a ${targetName}`);
      continue;
    }

    match = command.match(/^eliminar atributo\s+([A-Za-z_$][\w$]*)\s+de\s+([A-Za-z_$][\w$]*)$/i);
    if (match) {
      const [, name, targetName] = match;
      const target = resolveElement(targetName);
      if ('success' in target) return target;
      const attributes = target.attributes as string[];
      const matches = attributes.filter((attribute) => text(attribute).replace(/^[+\-#~]\s*/, '').split(/\s*:/)[0] === name);
      if (matches.length === 0) return fail(`No existe el atributo "${name}" en "${targetName}".`);
      if (matches.length > 1) return fail(`El atributo "${name}" es ambiguo en "${targetName}".`);
      target.attributes = attributes.filter((attribute) => attribute !== matches[0]);
      actions.push({ type: 'remove_attribute', data: { targetId: text(target.id), removeAttributes: matches } });
      understood.push(`eliminar atributo ${name} de ${targetName}`);
      continue;
    }

    match = command.match(/^renombrar\s+([A-Za-z_$][\w$]*)\s+a\s+([A-Za-z_$][\w$]*)$/i);
    if (match) {
      const [, currentName, name] = match;
      const target = resolveElement(currentName);
      if ('success' in target) return target;
      if (elements.some((element) => element !== target && elementName(element).toLowerCase() === name.toLowerCase())) return fail(`Ya existe un elemento llamado "${name}".`);
      target.name = name;
      actions.push({ type: 'rename_element', data: { targetId: text(target.id), name } });
      understood.push(`renombrar ${currentName} a ${name}`);
      continue;
    }

    match = command.match(/^eliminar\s+([A-Za-z_$][\w$]*)$/i);
    if (match) {
      const target = resolveElement(match[1]);
      if ('success' in target) return target;
      const id = text(target.id);
      elements.splice(elements.indexOf(target), 1);
      for (let index = connections.length - 1; index >= 0; index -= 1) if (endpoint(connections[index].sourceId ?? connections[index].source) === id || endpoint(connections[index].targetId ?? connections[index].target) === id) connections.splice(index, 1);
      actions.push({ type: 'delete_element', data: { targetId: id } });
      understood.push(`eliminar ${match[1]}`);
      continue;
    }

    match = command.match(/^crear relación\s+([A-Za-z_$][\w$]*)\s+(\S+)\s*->\s*(\S+)\s+([A-Za-z_$][\w$]*)$/i);
    if (match) {
      const [, sourceName, sourceMultiplicity, targetMultiplicity, targetName] = match;
      if (!multiplicity.test(sourceMultiplicity) || !multiplicity.test(targetMultiplicity)) return fail('Las multiplicidades deben ser números, *, n..m o n..*.');
      const source = resolveElement(sourceName);
      if ('success' in source) return source;
      const target = resolveElement(targetName);
      if ('success' in target) return target;
      const id = randomUUID();
      connections.push({ id, sourceId: text(source.id), targetId: text(target.id) });
      actions.push({ type: 'create_relationship', data: { id, type: 'association', sourceId: text(source.id), targetId: text(target.id), sourceMultiplicity, targetMultiplicity } });
      understood.push(`crear relación ${sourceName} ${sourceMultiplicity} -> ${targetMultiplicity} ${targetName}`);
      continue;
    }

    match = command.match(/^eliminar relación\s+([A-Za-z_$][\w$]*)\s*->\s*([A-Za-z_$][\w$]*)$/i);
    if (match) {
      const [, sourceName, targetName] = match;
      const source = resolveElement(sourceName);
      if ('success' in source) return source;
      const target = resolveElement(targetName);
      if ('success' in target) return target;
      const matches = connections.filter((connection) => endpoint(connection.sourceId ?? connection.source) === text(source.id) && endpoint(connection.targetId ?? connection.target) === text(target.id));
      if (matches.length === 0) return fail(`No existe una relación de "${sourceName}" a "${targetName}".`);
      if (matches.length > 1) return fail(`La relación de "${sourceName}" a "${targetName}" es ambigua.`);
      connections.splice(connections.indexOf(matches[0]), 1);
      actions.push({ type: 'delete_element', data: { targetId: text(matches[0].id) } });
      understood.push(`eliminar relación ${sourceName} -> ${targetName}`);
      continue;
    }

    return fail(`Comando no reconocido: "${command}".`);
  }

  return { success: true, message: `Entendido: ${understood.join('; ')}.`, actions };
};
