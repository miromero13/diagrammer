import { generatePostmanCollection } from './postman-collection-generator';
import { resolveSecurityCase, SecurityResolution } from './security-resolution';
import { normalizeAndValidateUml } from './uml-analysis';

const noSecurity: SecurityResolution = { enabled: false };

describe('generatePostmanCollection', () => {
  it('generates deterministic CRUD folders, UUID paths, and UML-derived bodies', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'product', type: 'uml.Class', name: 'Product', attributes: ['name: String [1]', 'price: BigDecimal', 'active: Boolean'] },
      { id: 'category', type: 'uml.Class', name: 'Category', attributes: ['label: String'] },
    ], connections: [{ id: 'product-category', type: 'association', sourceId: 'product', targetId: 'category', sourceMultiplicity: '0..*', targetMultiplicity: '1' }] });

    const first = generatePostmanCollection(analysis, noSecurity, 'catalog');
    const second = generatePostmanCollection(analysis, noSecurity, 'catalog');
    const product = first.item.find((item) => item.name === 'Product') as { item: Array<{ name: string; request: { url: { raw: string }; body?: { raw: string } } }> };
    const create = product.item.find((item) => item.name === 'Create Product');
    const update = product.item.find((item) => item.name === 'Update Product');

    expect(first).toEqual(second);
    expect(first.info.schema).toContain('v2.1.0');
    expect(first.variable).toEqual([
      { key: 'baseUrl', value: 'http://localhost:8090/api', type: 'string' },
      { key: 'token', value: '', type: 'string' },
    ]);
    expect(first.item.map((item) => item.name)).toEqual(['Category', 'Product']);
    expect(product.item.map((item) => item.name)).toEqual([
      'Create Product', 'List Products', 'Get Product', 'Update Product', 'Delete Product',
    ]);
    expect(create?.request.url.raw).toBe('{{baseUrl}}/products');
    expect(update?.request.url.raw).toBe('{{baseUrl}}/products/{{$guid}}');
    expect(JSON.parse(create?.request.body?.raw || '{}')).toEqual({
      active: true,
      categoryId: '{{$guid}}',
      name: 'example',
      price: 1.5,
    });
  });

  it('adds authentication requests and variables without embedding the configured password', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'account', type: 'uml.Class', name: 'Account', attributes: ['email: String', 'passwordHash: String'] },
      { id: 'product', type: 'uml.Class', name: 'Product', attributes: ['name: String'] },
    ], connections: [] });
    const security = resolveSecurityCase(analysis, {
      enabled: true,
      principalClassId: 'account',
      loginField: 'email',
      credentialField: 'passwordHash',
      testUserLogin: 'test@example.com',
      testUserPassword: 'do-not-embed-this-password',
    });
    const collection = generatePostmanCollection(analysis, security);
    const serialized = JSON.stringify(collection);
    const auth = collection.item.find((item) => item.name === 'Authentication') as { item: Array<{ name: string; request: { url: { raw: string }; body?: { raw: string } } }> };

    expect(collection.auth).toEqual({ type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] });
    expect(collection.variable).toContainEqual({ key: 'authLogin', value: 'test@example.com', type: 'string' });
    expect(collection.variable).toContainEqual({ key: 'authPassword', value: '', type: 'string' });
    expect(auth.item.map((item) => item.name)).toEqual(['Login', 'Current session']);
    expect(auth.item[0].request.url.raw).toBe('{{baseUrl}}/auth/login');
    expect(auth.item[1].request.url.raw).toBe('{{baseUrl}}/auth/session');
    expect(auth.item[0].request.body?.raw).toContain('"passwordHash": "{{authPassword}}"');
    expect(serialized).not.toContain('do-not-embed-this-password');
  });
});
