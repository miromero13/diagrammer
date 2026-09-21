import { generateDomainModel } from './domain-model-generator';
import { SecurityResolution } from './security-resolution';
import { UmlElement } from './uml-analysis';

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
    expect(auditable).toContain('public List<UUID> identifiers;');
    expect(document).toContain('import java.util.Set;');
    expect(document).toContain('import java.util.Map;');
    expect(document).toContain('public Map<String, BigDecimal> amounts;');
    expect(files.map((file) => file.source).join('\n')).not.toMatch(/ManyToOne|JoinColumn|implements /);
  });
});
