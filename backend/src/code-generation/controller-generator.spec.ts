import { generateControllers } from './controller-generator';
import { resolveSecurityCase, SecurityResolution } from './security-resolution';
import { normalizeAndValidateUml } from './uml-analysis';

const noSecurity: SecurityResolution = { enabled: false };

describe('generateControllers', () => {
  it('generates deterministic CRUD routes with OpenAPI metadata and sorted imports', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'product', type: 'uml.Class', name: 'Product', attributes: ['name: String [1]'], methods: ['+publish(): void'] },
    ], connections: [] });
    const first = generateControllers(analysis, 'com.example.generated', noSecurity);
    const second = generateControllers(analysis, 'com.example.generated', noSecurity);
    const source = first[0].source;

    expect(first).toEqual(second);
    expect(first.map((file) => file.path)).toEqual([
      'src/main/java/com/example/generated/products/controller/ProductController.java',
    ]);
    expect(source).toContain('@RequestMapping("/products")');
    expect(source).toContain('@PostMapping');
    expect(source).toContain('@GetMapping');
    expect(source).toContain('@PutMapping("/{id}")');
    expect(source).toContain('@DeleteMapping("/{id}")');
    expect(source).toContain('@Tag(name = "Product"');
    expect(source).toContain('@Operation(summary = "Create Product"');
    expect(source).toContain('@Parameter(description = "Product UUID"');
    expect(source).toContain('@Valid @RequestBody CreateProductDto dto');
    expect(source).toContain('responseCode = "404"');
    expect(source).not.toContain('publish');

    const imports = source.split('\n').filter((line) => line.startsWith('import '));
    expect(imports).toEqual([...imports].sort());
  });

  it('excludes abstract, promoted-abstract, interface, and authentication-principal classes', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'account', type: 'uml.Class', name: 'Account', attributes: ['email: String', 'passwordHash: String'] },
      { id: 'product', type: 'uml.Class', name: 'Product' },
      { id: 'document', type: 'uml.AbstractClass', name: 'Document' },
      { id: 'job', type: 'uml.Class', name: 'Job', methods: ['+run(): void {abstract}'] },
      { id: 'contract', type: 'uml.Interface', name: 'ProductContract', methods: ['+publish(): void'] },
    ], connections: [] });
    const security = resolveSecurityCase(analysis, {
      enabled: true,
      principalClassId: 'account',
      loginField: 'email',
      credentialField: 'passwordHash',
      testUserLogin: 'test@example.com',
      testUserPassword: 'safe-test-password',
    });
    const generated = generateControllers(analysis, 'com.example.generated', security);

    expect(generated.map((file) => file.path)).toEqual([
      'src/main/java/com/example/generated/products/controller/ProductController.java',
    ]);
    expect(generated[0].source).toContain('@SecurityRequirement(name = "bearer-key")');
    expect(generated[0].source).toContain('responseCode = "401"');
    expect(generated[0].source).toContain('responseCode = "403"');
  });
});
