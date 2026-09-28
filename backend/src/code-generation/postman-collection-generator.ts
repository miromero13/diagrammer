import { featurePackageName } from './feature-name';
import { SecurityResolution } from './security-resolution';
import { generatedRelationFields, GeneratedRelation } from './dto-generator';
import { eligibleCrudElements } from './service-generator';
import { UmlAnalysis, UmlAttribute, UmlElement } from './uml-analysis';

const DEFAULT_BASE_URL = 'http://localhost:8090/api';
const UUID_PLACEHOLDER = '{{$guid}}';
const BASE_ENTITY_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);
const SCALAR_TYPES = new Set(['String', 'Integer', 'Long', 'Float', 'Double', 'BigDecimal', 'Boolean', 'LocalDate', 'LocalDateTime', 'UUID']);

type PostmanVariable = { key: string; value: string; type: 'string' };
type PostmanHeader = { key: string; value: string; type: 'text' };
type PostmanAuth =
  | { type: 'bearer'; bearer: Array<{ key: 'token'; value: '{{token}}'; type: 'string' }> }
  | { type: 'noauth' };
type PostmanUrl = { raw: string; host: string[]; path: string[] };
type PostmanBody = { mode: 'raw'; raw: string; options: { raw: { language: 'json' } } };
type PostmanRequest = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  header: PostmanHeader[];
  url: PostmanUrl;
  auth?: PostmanAuth;
  body?: PostmanBody;
};
type PostmanEvent = { listen: 'test'; script: { type: 'text/javascript'; exec: string[] } };
type PostmanRequestItem = { name: string; request: PostmanRequest; event?: PostmanEvent[] };
type PostmanFolder = { name: string; item: PostmanRequestItem[] };

export type PostmanCollection = {
  info: { name: string; schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' };
  variable: PostmanVariable[];
  auth?: PostmanAuth;
  item: Array<PostmanFolder | PostmanRequestItem>;
};

const bearerAuth = (): PostmanAuth => ({ type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] });

const url = (route: string, id = false): PostmanUrl => {
  const path = id ? [route, UUID_PLACEHOLDER] : [route];
  return { raw: `{{baseUrl}}/${path.join('/')}`, host: ['{{baseUrl}}'], path };
};

const jsonBody = (value: Record<string, string | number | boolean | string[]>): PostmanBody => ({
  mode: 'raw',
  raw: JSON.stringify(value, null, 2),
  options: { raw: { language: 'json' } },
});

const jsonHeader: PostmanHeader = { key: 'Content-Type', value: 'application/json', type: 'text' };

const inheritedElements = (analysis: UmlAnalysis, element: UmlElement) => {
  const elements = new Map(analysis.normalizedModel.elements.map((candidate) => [candidate.id, candidate]));
  const parents = new Map(analysis.normalizedModel.relationships
    .filter((connection) => connection.type === 'inheritance')
    .map((connection) => [connection.sourceId, connection.targetId]));
  const chain: UmlElement[] = [];
  const visited = new Set<string>();
  let current: UmlElement | undefined = element;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    const parentId = parents.get(current.id);
    current = parentId ? elements.get(parentId) : undefined;
  }
  return chain;
};

const exampleValue = (attribute: UmlAttribute, enumValues?: string[]): string | number | boolean => {
  const type = attribute.javaType.toLowerCase();
  if (enumValues?.length) return enumValues[0];
  if (type === 'boolean') return true;
  if (['integer', 'long'].includes(type)) return 1;
  if (['float', 'double', 'bigdecimal'].includes(type)) return 1.5;
  if (type === 'localdate') return '2025-01-01';
  if (type === 'localdatetime') return '2025-01-01T00:00:00';
  if (type === 'uuid') return UUID_PLACEHOLDER;
  return 'example';
};

const exampleFields = (analysis: UmlAnalysis, element: UmlElement, relations: GeneratedRelation[]) => {
  const enums = new Map(analysis.relationalModel.enums.map((item) => [item.name.toLowerCase(), item.literals]));
  const fields = new Map<string, string | number | boolean | string[]>();
  inheritedElements(analysis, element).flatMap((owner) => owner.structuredAttributes).forEach((attribute) => {
    if (BASE_ENTITY_FIELDS.has(attribute.canonicalName) || !SCALAR_TYPES.has(attribute.javaType) && !enums.has(attribute.sourceType.toLowerCase())) return;
    fields.set(attribute.canonicalName, exampleValue(attribute, enums.get(attribute.sourceType.toLowerCase())));
  });
  relations.filter((relation) => relation.writable).sort((a, b) => a.fieldName.localeCompare(b.fieldName)).forEach((relation) => {
    fields.set(`${relation.fieldName}${relation.collection ? 'Ids' : 'Id'}`, relation.collection ? [UUID_PLACEHOLDER] : UUID_PLACEHOLDER);
  });
  return Object.fromEntries([...fields.entries()].sort(([a], [b]) => a.localeCompare(b)));
};

const request = (
  name: string,
  method: PostmanRequest['method'],
  route: string,
  security: SecurityResolution,
  body?: Record<string, string | number | boolean | string[]>,
  id = false,
): PostmanRequestItem => ({
  name,
  request: {
    method,
    header: body ? [jsonHeader] : [],
    url: url(route, id),
    ...(security.enabled ? { auth: bearerAuth() } : {}),
    ...(body ? { body: jsonBody(body) } : {}),
  },
});

const authenticationFolder = (security: SecurityResolution): PostmanFolder => ({
  name: 'Authentication',
  item: [
    {
      name: 'Login',
      request: {
        method: 'POST',
        header: [jsonHeader],
        url: url('auth/login'),
        auth: { type: 'noauth' },
        body: jsonBody({
          [security.loginField || 'login']: '{{authLogin}}',
          [security.credentialField || 'password']: '{{authPassword}}',
        }),
      },
      event: [{
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            'const body = pm.response.json();',
            "if (body?.data?.access_token) pm.collectionVariables.set('token', body.data.access_token);",
          ],
        },
      }],
    },
    {
      name: 'Current session',
      request: {
        method: 'GET',
        header: [],
        url: url('auth/session'),
        auth: bearerAuth(),
      },
    },
  ],
});

export function generatePostmanCollection(analysis: UmlAnalysis, security: SecurityResolution, projectName = 'Generated Spring Boot Backend'): PostmanCollection {
  const resources = eligibleCrudElements(analysis, security).map(({ element }) => {
    const route = featurePackageName(element.name);
    const body = exampleFields(analysis, element, generatedRelationFields(analysis, element));
    return {
      name: element.name,
      item: [
        request(`Create ${element.name}`, 'POST', route, security, body),
        request(`List ${element.name}s`, 'GET', route, security),
        request(`Get ${element.name}`, 'GET', route, security, undefined, true),
        request(`Update ${element.name}`, 'PUT', route, security, body, true),
        request(`Delete ${element.name}`, 'DELETE', route, security, undefined, true),
      ],
    } satisfies PostmanFolder;
  });

  return {
    info: {
      name: `${projectName} API`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      { key: 'baseUrl', value: DEFAULT_BASE_URL, type: 'string' },
      { key: 'token', value: '', type: 'string' },
      ...(security.enabled ? [
        { key: 'authLogin', value: security.testUserLogin || '', type: 'string' as const },
        { key: 'authPassword', value: '', type: 'string' as const },
      ] : []),
    ],
    ...(security.enabled ? { auth: bearerAuth() } : {}),
    item: [
      ...(security.enabled ? [authenticationFolder(security)] : []),
      ...resources,
    ],
  };
}
