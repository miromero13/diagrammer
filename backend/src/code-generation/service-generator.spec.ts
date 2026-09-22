import { generateServices } from './service-generator';
import { resolveSecurityCase, SecurityResolution } from './security-resolution';
import { normalizeAndValidateUml } from './uml-analysis';

const noSecurity: SecurityResolution = { enabled: false };

describe('generateServices', () => {
  it('generates deterministic CRUD contracts and implementations with sorted imports', () => {
    const analysis = normalizeAndValidateUml({ elements: [{ id: 'product', type: 'uml.Class', name: 'Product', attributes: ['name: String'] }], connections: [] });
    const first = generateServices(analysis, 'com.example.generated', noSecurity);
    const second = generateServices(analysis, 'com.example.generated', noSecurity);
    const contract = first.find((file) => file.path.endsWith('products/service/ProductService.java'))?.source;
    const implementation = first.find((file) => file.path.endsWith('products/service/ProductServiceImpl.java'))?.source;

    expect(first).toEqual(second);
    expect(contract).toContain('Optional<ProductResponseDto> edit(UUID id, UpdateProductDto dto);');
    expect(contract).toContain('List<ProductResponseDto> getMany();');
    expect(implementation).toContain('@Service\n@Transactional');
    expect(implementation).toContain('ProductServiceImpl(ProductRepository repository, ProductMapper mapper)');
    expect(implementation).toContain('repository.save(mapper.toEntity(dto))');
    expect(implementation).toContain('repository.findById(id).map(mapper::toResponse)');
    expect(implementation).toContain('repository.findAll().stream().map(mapper::toResponse).toList()');
    expect(implementation).toContain('repository.existsById(id)');
    expect(implementation).toContain('repository.deleteById(id)');
    expect(implementation).toContain('import com.example.generated.products.ProductRepository;');
    expect(implementation).toContain('import com.example.generated.products.mapper.ProductMapper;');
    expect(implementation).not.toContain('ProductQueryDto');

    const imports = implementation?.split('\n').filter((line) => line.startsWith('import '));
    expect(imports).toEqual([...imports].sort());
  });

  it('generates services only for concrete relational classes', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'product', type: 'uml.Class', name: 'Product' },
      { id: 'document', type: 'uml.AbstractClass', name: 'Document' },
      { id: 'contract', type: 'uml.Interface', name: 'ProductContract', methods: ['+publish(): void'] },
    ], connections: [] });
    const generated = generateServices(analysis, 'com.example.generated', noSecurity);

    expect(generated.map((file) => file.path)).toEqual([
      'src/main/java/com/example/generated/products/service/ProductService.java',
      'src/main/java/com/example/generated/products/service/ProductServiceImpl.java',
    ]);
  });

  it('excludes the authentication principal because its repository is not generated', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'account', type: 'uml.Class', name: 'Account', attributes: ['email: String', 'passwordHash: String'] },
      { id: 'product', type: 'uml.Class', name: 'Product' },
    ], connections: [] });
    const security = resolveSecurityCase(analysis, {
      enabled: true,
      principalClassId: 'account',
      loginField: 'email',
      credentialField: 'passwordHash',
      testUserLogin: 'test@example.com',
      testUserPassword: 'safe-test-password',
    });
    const generated = generateServices(analysis, 'com.example.generated', security);

    expect(generated.some((file) => file.path.includes('/accounts/'))).toBe(false);
    expect(generated.some((file) => file.path.includes('/products/'))).toBe(true);
  });

  it('does not reassign an explicitly realized UML interface to the CRUD service', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'product', type: 'uml.Class', name: 'Product' },
      { id: 'contract', type: 'uml.Interface', name: 'PublishingContract', methods: ['+publish(): void'] },
    ], connections: [{ id: 'product-contract', type: 'implementation', sourceId: 'product', targetId: 'contract' }] });
    const generated = generateServices(analysis, 'com.example.generated', noSecurity);
    const implementation = generated.find((file) => file.path.endsWith('ProductServiceImpl.java'))?.source;

    expect(implementation).toContain('implements ProductService');
    expect(implementation).not.toContain('PublishingContract');
    expect(implementation).not.toContain('publish(');
  });
});
