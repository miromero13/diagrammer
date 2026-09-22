import { generateDomainModel } from './domain-model-generator';
import { SecurityResolution } from './security-resolution';
import { normalizeAndValidateUml, UmlElement } from './uml-analysis';

const attributes = (values: Array<[string, string]>) => values.map(([canonicalName, javaType]) => ({ name: canonicalName, sourceName: canonicalName, canonicalName, sourceType: javaType, javaType, visibility: null, multiplicity: { lower: null, upper: null } }));
const element = (id: string, name: string, kind: UmlElement['kind'], values: Array<[string, string]>): UmlElement => ({ id, name, kind, attributes: [], structuredAttributes: attributes(values), methods: [], structuredMethods: [], literals: [] });

describe('generateDomainModel', () => {
  it('generates normalized concrete entities, interfaces, and abstract classes without relationships or operations', () => {
    const account = element('account', 'Account', 'class', [['email', 'String'], ['passwordHash', 'String']]);
    const user = element('user', 'User', 'class', [['name', 'String']]);
    const product = element('product', 'Product', 'class', [['sku', 'String']]);
    const files = generateDomainModel([
      account,
      user,
      product,
      element('invoice', 'Invoice', 'class', [['id', 'Long'], ['createdAt', 'String'], ['updatedAt', 'Long'], ['amount', 'BigDecimal'], ['dueDate', 'LocalDate'], ['processedAt', 'LocalDateTime'], ['externalId', 'UUID']]),
      element('auditable', 'Auditable', 'interface', [['identifiers', 'List<UUID>']]),
      element('document', 'Document', 'abstract', [['dates', 'Set<LocalDate>'], ['amounts', 'Map<BigDecimal>']]),
      element('status', 'Status', 'enum', []),
    ], 'com.example.generated', { enabled: true, principal: account, loginField: 'email', credentialField: 'passwordHash' } as SecurityResolution);

    expect(files).toHaveLength(6);
    expect(files.filter((file) => file.path.endsWith('accounts/AccountEntity.java'))).toHaveLength(1);
    expect(files.find((file) => file.path.endsWith('accounts/AccountEntity.java'))?.source).toContain('@JsonIgnore');
    expect(files.find((file) => file.path.endsWith('users/UserEntity.java'))?.source).toContain('package com.example.generated.users;');
    expect(files.find((file) => file.path.endsWith('products/ProductEntity.java'))?.source).toContain('package com.example.generated.products;');
    expect(files.find((file) => file.path.endsWith('auditables/Auditable.java'))?.source).toContain('package com.example.generated.auditables;');
    expect(files.find((file) => file.path.endsWith('auditables/Auditable.java'))?.source).toContain('public interface Auditable');
    expect(files.find((file) => file.path.endsWith('documents/Document.java'))?.source).toContain('package com.example.generated.documents;');
    expect(files.find((file) => file.path.endsWith('documents/Document.java'))?.source).toContain('public abstract class Document');
    expect(files.some((file) => file.path.includes('/domain/'))).toBe(false);
    const invoice = files.find((file) => file.path.endsWith('invoices/InvoiceEntity.java'))?.source;
    const auditable = files.find((file) => file.path.endsWith('auditables/Auditable.java'))?.source;
    const document = files.find((file) => file.path.endsWith('documents/Document.java'))?.source;
    expect(invoice).toContain('import java.math.BigDecimal;');
    expect(invoice).toContain('import java.time.LocalDate;');
    expect(invoice).toContain('import java.time.LocalDateTime;');
    expect(invoice).toContain('import java.util.UUID;');
    expect(invoice).toContain('public BigDecimal amount;');
    expect(invoice).not.toMatch(/public .* (id|createdAt|updatedAt);/);
    expect(auditable).toContain('import java.util.List;');
    expect(auditable).toContain('import java.util.UUID;');
    expect(auditable).toContain('public static final List<UUID> identifiers = null;');
    expect(document).toContain('import java.util.Set;');
    expect(document).toContain('import java.util.Map;');
    expect(document).toContain('public Map<String, BigDecimal> amounts;');
    expect(files.map((file) => file.source).join('\n')).not.toMatch(/ManyToOne|JoinColumn|implements /);
  });

  it('renders operations, contracts, relationships, and compilable abstract methods', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'account', type: 'uml.Class', name: 'Account', methods: ['+lookup(filters: Map<String, Account>): List<Account>'] },
      { id: 'contract', type: 'uml.Interface', name: 'AccountService', methods: ['+send(account: Account): void', '+factory(): Account {static}'] },
      { id: 'parent', type: 'uml.AbstractClass', name: 'Parent', methods: ['#archive(): void {abstract}'] },
      { id: 'child', type: 'uml.Class', name: 'Child' },
    ], connections: [
      { id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' },
      { id: 'child-contract', type: 'implementation', sourceId: 'child', targetId: 'contract' },
    ] });
    expect(analysis.errors).toEqual([]);
    const generated = generateDomainModel(analysis.normalizedModel.elements, 'com.example.generated', { enabled: false }, analysis.normalizedModel.relationships);
    const account = generated.find((file) => file.path.endsWith('accounts/AccountEntity.java'))?.source;
    const contract = generated.find((file) => file.path.endsWith('accountservices/AccountService.java'))?.source;
    const child = generated.find((file) => file.path.endsWith('childs/ChildEntity.java'))?.source;

    expect(account).toContain('public List<AccountEntity> lookup(Map<String, AccountEntity> filters)');
    expect(account).toContain('throw new UnsupportedOperationException("UML operation requires implementation: lookup")');
    expect(account).toContain('import java.util.List;');
    expect(account).toContain('import java.util.Map;');
    expect(contract).toContain('public void send(AccountEntity account);');
    expect(contract).toContain('public static AccountEntity factory()');
    expect(contract).toContain('throw new UnsupportedOperationException("UML operation requires implementation: factory")');
    expect(child).toContain('class ChildEntity extends ParentEntity implements AccountService');
    expect(child).toContain('public void send(AccountEntity account)');
    expect(child).toContain('public void archive()');
  });

  it('renders interface attributes as initialized Java constants', () => {
    const analysis = normalizeAndValidateUml({ elements: [{ id: 'contract', type: 'uml.Interface', name: 'Contract', attributes: ['+limit: int = 3', '+label: String = hello', '+slug: String = hello-world', '+quoted: String = "world"', '+flag: String = false', '+constant: String = DEFAULT_LABEL'] }], connections: [] });
    const source = generateDomainModel(analysis.normalizedModel.elements, 'com.example.generated', { enabled: false })[0].source;
    expect(source).toContain('public static final Integer limit = 3;');
    expect(source).toContain('public static final String label = "hello";');
    expect(source).toContain('public static final String slug = "hello-world";');
    expect(source).toContain('public static final String quoted = "world";');
    expect(source).toContain('public static final String flag = "false";');
    expect(source).toContain('public static final String constant = DEFAULT_LABEL;');
  });

  it('renders classifier-typed interface attributes with entity types and imports', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'animal', type: 'uml.Class', name: 'Animal' },
      { id: 'contract', type: 'uml.Interface', name: 'Contract', attributes: ['+animal: Animal', '+animals: List<Animal>'] },
    ], connections: [] });
    const source = generateDomainModel(analysis.normalizedModel.elements, 'com.example.generated', { enabled: false })
      .find((file) => file.path.endsWith('contracts/Contract.java'))?.source;

    expect(analysis.errors).toEqual([]);
    expect(source).toContain('import com.example.generated.animals.AnimalEntity;');
    expect(source).toContain('import java.util.List;');
    expect(source).toContain('public static final AnimalEntity animal = null;');
    expect(source).toContain('public static final List<AnimalEntity> animals = null;');
  });

  it('promotes a concrete class with an abstract operation to an abstract Java class', () => {
    const analysis = normalizeAndValidateUml({ elements: [{ id: 'job', type: 'uml.Class', name: 'Job', methods: ['+run(): void {abstract}'] }], connections: [] });
    const source = generateDomainModel(analysis.normalizedModel.elements, 'com.example.generated', { enabled: false })[0].source;
    expect(source).toContain('public abstract class JobEntity');
    expect(source).toContain('public abstract void run();');
  });

  it('synthesizes one concrete implementation for an inherited abstract operation', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'parent', type: 'uml.AbstractClass', name: 'Parent', methods: ['+run(): void {abstract}'] },
      { id: 'child', type: 'uml.Class', name: 'Child' },
    ], connections: [{ id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' }] });
    const child = generateDomainModel(analysis.normalizedModel.elements, 'com.example.generated', { enabled: false }, analysis.normalizedModel.relationships)
      .find((file) => file.path.endsWith('childs/ChildEntity.java'))?.source;

    expect(analysis.errors).toEqual([]);
    expect(child?.match(/public void run\(\)/g)).toHaveLength(1);
    expect(child).toContain('throw new UnsupportedOperationException("UML operation requires implementation: run")');
  });

  it('normalizes conflicting interface operations to one public instance method', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'contract', type: 'uml.Interface', name: 'Contract', methods: ['+send(): void'] },
      { id: 'worker', type: 'uml.Class', name: 'Worker', methods: ['-send(): void', '+send(): void {static}'] },
    ], connections: [{ id: 'worker-contract', type: 'implementation', sourceId: 'worker', targetId: 'contract' }] });
    const source = generateDomainModel(analysis.normalizedModel.elements, 'com.example.generated', { enabled: false }, analysis.normalizedModel.relationships).find((file) => file.path.endsWith('workers/WorkerEntity.java'))?.source;
    expect(source).toContain('public void send()');
    expect(source?.match(/public void send\(\)/g)).toHaveLength(1);
    expect(source).not.toContain('static void send');
    expect(source).toContain('throw new UnsupportedOperationException("UML operation requires implementation: send")');
  });

  it('carries interface contracts through promoted abstract parents to concrete children', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'contract', type: 'uml.Interface', name: 'Contract', methods: ['+execute(): void'] },
      { id: 'parent', type: 'uml.Class', name: 'Parent', methods: ['+template(): void {abstract}'] },
      { id: 'child', type: 'uml.Class', name: 'Child' },
    ], connections: [
      { id: 'parent-contract', type: 'implementation', sourceId: 'parent', targetId: 'contract' },
      { id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' },
    ] });
    const generated = generateDomainModel(analysis.normalizedModel.elements, 'com.example.generated', { enabled: false }, analysis.normalizedModel.relationships);
    const parent = generated.find((file) => file.path.endsWith('parents/ParentEntity.java'))?.source;
    const child = generated.find((file) => file.path.endsWith('childs/ChildEntity.java'))?.source;
    expect(parent).toContain('public abstract class ParentEntity extends BaseEntity implements Contract');
    expect(child).toContain('public void execute()');
    expect(child).toContain('throw new UnsupportedOperationException("UML operation requires implementation: execute")');
  });

  it('renders interface inheritance as Java interface extends', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'parent-a', type: 'uml.Interface', name: 'ParentA', methods: ['+parentA(): void'] },
      { id: 'parent-b', type: 'uml.Interface', name: 'ParentB', methods: ['+parentB(): void'] },
      { id: 'child', type: 'uml.Interface', name: 'ChildContract', methods: ['+child(): void', '+use(parent: ParentA): ParentA'] },
      { id: 'worker', type: 'uml.Class', name: 'Worker' },
    ], connections: [
      { id: 'child-parent-b', type: 'inheritance', sourceId: 'child', targetId: 'parent-b' },
      { id: 'child-parent-a', type: 'inheritance', sourceId: 'child', targetId: 'parent-a' },
      { id: 'worker-child', type: 'implementation', sourceId: 'worker', targetId: 'child' },
    ] });
    const generated = generateDomainModel(analysis.normalizedModel.elements, 'com.example.generated', { enabled: false }, analysis.normalizedModel.relationships);
    const child = generated.find((file) => file.path.endsWith('childcontracts/ChildContract.java'))?.source;
    const worker = generated.find((file) => file.path.endsWith('workers/WorkerEntity.java'))?.source;
    expect(analysis.errors).toEqual([]);
    expect(child).toContain('public interface ChildContract extends ParentA, ParentB');
    expect(child).toContain('import com.example.generated.parentas.ParentA;');
    expect(child).toContain('import com.example.generated.parentbs.ParentB;');
    expect(child?.match(/import com\.example\.generated\.parentas\.ParentA;/g)).toHaveLength(1);
    expect(worker).toContain('public void child()');
    expect(worker).toContain('public void parentA()');
    expect(worker).toContain('public void parentB()');
    expect(worker?.indexOf('public void child()')).toBeLessThan(worker?.indexOf('public void parentA()') ?? -1);
  });

  it('keeps the most specific covariant interface return when implementing a child contract', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'animal', type: 'uml.Class', name: 'Animal' },
      { id: 'dog', type: 'uml.Class', name: 'Dog' },
      { id: 'parent', type: 'uml.Interface', name: 'ParentContract', methods: ['+read(): Animal'] },
      { id: 'child', type: 'uml.Interface', name: 'ChildContract', methods: ['+read(): Dog'] },
      { id: 'worker', type: 'uml.Class', name: 'Worker' },
    ], connections: [
      { id: 'dog-animal', type: 'inheritance', sourceId: 'dog', targetId: 'animal' },
      { id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' },
      { id: 'worker-child', type: 'implementation', sourceId: 'worker', targetId: 'child' },
    ] });
    const worker = generateDomainModel(analysis.normalizedModel.elements, 'com.example.generated', { enabled: false }, analysis.normalizedModel.relationships)
      .find((file) => file.path.endsWith('workers/WorkerEntity.java'))?.source;

    expect(analysis.errors).toEqual([]);
    expect(worker).toContain('public DogEntity read()');
    expect(worker?.match(/public .* read\(\)/g)).toHaveLength(1);
  });

  it('keeps the most specific covariant classifier array return', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'animal', type: 'uml.Class', name: 'Animal' },
      { id: 'dog', type: 'uml.Class', name: 'Dog' },
      { id: 'parent', type: 'uml.Interface', name: 'ParentContract', methods: ['+read(): Animal[]'] },
      { id: 'child', type: 'uml.Interface', name: 'ChildContract', methods: ['+read(): Dog[]'] },
      { id: 'worker', type: 'uml.Class', name: 'Worker' },
    ], connections: [
      { id: 'dog-animal', type: 'inheritance', sourceId: 'dog', targetId: 'animal' },
      { id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' },
      { id: 'worker-child', type: 'implementation', sourceId: 'worker', targetId: 'child' },
    ] });
    const worker = generateDomainModel(analysis.normalizedModel.elements, 'com.example.generated', { enabled: false }, analysis.normalizedModel.relationships)
      .find((file) => file.path.endsWith('workers/WorkerEntity.java'))?.source;

    expect(analysis.errors).toEqual([]);
    expect(worker).toContain('public DogEntity[] read()');
    expect(worker?.match(/public .* read\(\)/g)).toHaveLength(1);
  });

  it('keeps a covariant child-contract override when the parent provides a broader concrete method', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'animal', type: 'uml.Class', name: 'Animal' },
      { id: 'dog', type: 'uml.Class', name: 'Dog' },
      { id: 'parent', type: 'uml.Class', name: 'Parent', methods: ['+read(): Animal'] },
      { id: 'contract', type: 'uml.Interface', name: 'ChildContract', methods: ['+read(): Dog'] },
      { id: 'child', type: 'uml.Class', name: 'Child' },
    ], connections: [
      { id: 'dog-animal', type: 'inheritance', sourceId: 'dog', targetId: 'animal' },
      { id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' },
      { id: 'child-contract', type: 'implementation', sourceId: 'child', targetId: 'contract' },
    ] });
    const child = generateDomainModel(analysis.normalizedModel.elements, 'com.example.generated', { enabled: false }, analysis.normalizedModel.relationships)
      .find((file) => file.path.endsWith('childs/ChildEntity.java'))?.source;

    expect(analysis.errors).toEqual([]);
    expect(child).toContain('public DogEntity read()');
    expect(child?.match(/public .* read\(\)/g)).toHaveLength(1);
  });

  it('does not let non-public inherited methods satisfy child interface contracts', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'animal', type: 'uml.Class', name: 'Animal' },
      { id: 'dog', type: 'uml.Class', name: 'Dog' },
      { id: 'parent', type: 'uml.Class', name: 'Parent', methods: ['#read(): Animal', '-secret(): Animal'] },
      { id: 'contract', type: 'uml.Interface', name: 'ChildContract', methods: ['+read(): Dog', '+secret(): Dog'] },
      { id: 'child', type: 'uml.Class', name: 'Child' },
    ], connections: [
      { id: 'dog-animal', type: 'inheritance', sourceId: 'dog', targetId: 'animal' },
      { id: 'child-parent', type: 'inheritance', sourceId: 'child', targetId: 'parent' },
      { id: 'child-contract', type: 'implementation', sourceId: 'child', targetId: 'contract' },
    ] });
    const child = generateDomainModel(analysis.normalizedModel.elements, 'com.example.generated', { enabled: false }, analysis.normalizedModel.relationships)
      .find((file) => file.path.endsWith('childs/ChildEntity.java'))?.source;

    expect(analysis.errors).toEqual([]);
    expect(child?.match(/public DogEntity read\(\)/g)).toHaveLength(1);
    expect(child?.match(/public DogEntity secret\(\)/g)).toHaveLength(1);
  });
});
