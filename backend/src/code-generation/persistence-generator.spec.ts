import { generatePersistence } from './persistence-generator';
import { resolveSecurityCase, SecurityResolution } from './security-resolution';
import { normalizeAndValidateUml, UmlAnalysis } from './uml-analysis';

const security = (analysis: UmlAnalysis, enabled = false): SecurityResolution => enabled
  ? resolveSecurityCase(analysis, { principalClassId: 'account', loginField: 'email', credentialField: 'passwordHash', testUserLogin: 'test@example.com', testUserPassword: 'safe-test-password' })
  : { enabled: false };

const files = (analysis: UmlAnalysis, enabled = false) => generatePersistence(analysis, 'com.example.generated', security(analysis, enabled));

describe('generatePersistence', () => {
  it('generates relationally named principal and product entities without identity/access tables', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'account', type: 'uml.Class', name: 'Account', attributes: ['email: String', 'passwordHash: String'] },
      { id: 'product', type: 'uml.Class', name: 'Product', attributes: ['sku: String'] },
    ], connections: [] });
    const generated = files(analysis, true);
    const account = generated.find((file) => file.path.endsWith('accounts/entity/AccountEntity.java'))?.source;
    const migration = generated.find((file) => file.path.endsWith('V1__model.sql'))?.source;
    expect(account).toContain('@Table(name = "account")');
    expect(account).toContain('@Column(name = "email", nullable = false, unique = true)');
    expect(account).toContain('@JsonIgnore');
    expect(generated.some((file) => file.path.endsWith('accounts/repository/AccountRepository.java'))).toBe(false);
    expect(generated.some((file) => file.path.endsWith('products/repository/ProductRepository.java'))).toBe(true);
    expect(migration).toContain('CREATE TABLE account');
    expect(migration).toContain('CREATE TABLE product');
    expect(migration).toContain('uk_account_email');
    expect(migration).not.toMatch(/roles|permissions/i);
  });

  it('generates Permission as a normal feature entity, repository, and table', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'permission', type: 'uml.Class', name: 'Permission', attributes: ['name: String'] },
    ], connections: [] });
    const generated = files(analysis);
    const entity = generated.find((file) => file.path.endsWith('permissions/entity/PermissionEntity.java'))?.source;
    const repository = generated.find((file) => file.path.endsWith('permissions/repository/PermissionRepository.java'))?.source;
    const migration = generated.find((file) => file.path.endsWith('V1__model.sql'))?.source;

    expect(entity).toContain('@Entity');
    expect(entity).toContain('@Table(name = "permission")');
    expect(repository).toContain('JpaRepository<PermissionEntity, UUID>');
    expect(migration).toContain('CREATE TABLE permission');
  });

  it('maps one-to-many and optional foreign keys from the relational model', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'order', type: 'uml.Class', name: 'Order' },
      { id: 'customer', type: 'uml.Class', name: 'Customer' },
    ], connections: [{ id: 'orders-customer', type: 'association', sourceId: 'order', targetId: 'customer', sourceMultiplicity: '0..*', targetMultiplicity: '0..1' }] });
    const generated = files(analysis);
    const order = generated.find((file) => file.path.endsWith('orders/entity/OrderEntity.java'))?.source;
    const customer = generated.find((file) => file.path.endsWith('customers/entity/CustomerEntity.java'))?.source;
    const migration = generated.find((file) => file.path.endsWith('V1__model.sql'))?.source;
    expect(order).toContain('@ManyToOne');
    expect(order).toContain('@JoinColumn(name = "customer_id", nullable = true)');
    expect(customer).toContain('@OneToMany(mappedBy = "customer")');
    expect(migration).toContain('customer_id UUID');
    expect(migration).toContain('idx_order_customer_id');
  });

  it('creates deterministic many-to-many join tables', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'student', type: 'uml.Class', name: 'Student' },
      { id: 'course', type: 'uml.Class', name: 'Course' },
    ], connections: [{ id: 'student-course', type: 'association', sourceId: 'student', targetId: 'course', sourceMultiplicity: '0..*', targetMultiplicity: '0..*' }] });
    const generated = files(analysis);
    const student = generated.find((file) => file.path.endsWith('students/entity/StudentEntity.java'))?.source;
    const migration = generated.find((file) => file.path.endsWith('V1__model.sql'))?.source;
    expect(student).toContain('@ManyToMany');
    expect(student).toContain('@JoinTable(name = "course_student"');
    expect(migration).toContain('CREATE TABLE course_student');
    expect(migration).toContain('PRIMARY KEY (student_id, course_id)');
  });

  it('keeps aggregation non-destructive and cascades composition collections', () => {
    const composition = normalizeAndValidateUml({ elements: [
      { id: 'order', type: 'uml.Class', name: 'Order' },
      { id: 'line', type: 'uml.Class', name: 'Line' },
    ], connections: [{ id: 'order-line', type: 'composition', sourceId: 'order', targetId: 'line', sourceMultiplicity: '1', targetMultiplicity: '0..*' }] });
    const aggregation = normalizeAndValidateUml({ elements: [
      { id: 'team', type: 'uml.Class', name: 'Team' },
      { id: 'member', type: 'uml.Class', name: 'Member' },
    ], connections: [{ id: 'team-member', type: 'aggregation', sourceId: 'team', targetId: 'member', sourceMultiplicity: '1', targetMultiplicity: '0..*' }] });
    const compositionOwner = files(composition).find((file) => file.path.endsWith('orders/entity/OrderEntity.java'))?.source;
    const aggregationOwner = files(aggregation).find((file) => file.path.endsWith('teams/entity/TeamEntity.java'))?.source;
    expect(compositionOwner).toContain('cascade = CascadeType.ALL, orphanRemoval = true');
    expect(aggregationOwner).not.toContain('CascadeType.REMOVE');
  });

  it('maps explicit one-to-one ownership and association classes', () => {
    const oneToOne = normalizeAndValidateUml({ elements: [
      { id: 'profile', type: 'uml.Class', name: 'Profile' },
      { id: 'account', type: 'uml.Class', name: 'Account' },
    ], connections: [{ id: 'profile-account', type: 'association', sourceId: 'profile', targetId: 'account', sourceMultiplicity: '1', targetMultiplicity: '0..1', sourceNavigable: true, targetNavigable: false }] });
    const profile = files(oneToOne).find((file) => file.path.endsWith('profiles/entity/ProfileEntity.java'))?.source;
    const profileMigration = files(oneToOne).find((file) => file.path.endsWith('V1__model.sql'))?.source;
    expect(profile).toContain('@OneToOne');
    expect(profile).toContain('@JoinColumn(name = "account_id", nullable = true)');
    expect(profileMigration).toContain('account_id UUID');

    const association = normalizeAndValidateUml({ elements: [
      { id: 'student', type: 'uml.Class', name: 'Student' },
      { id: 'course', type: 'uml.Class', name: 'Course' },
      { id: 'enrollment', type: 'uml.Class', name: 'Enrollment', attributes: ['createdAt: date'] },
    ], connections: [{ id: 'student-course', type: 'association', sourceId: 'student', targetId: 'course', sourceMultiplicity: '0..*', targetMultiplicity: '0..*', associationClassId: 'enrollment' }] });
    const enrollment = files(association).find((file) => file.path.endsWith('enrollments/entity/EnrollmentEntity.java'))?.source;
    const associationMigration = files(association).find((file) => file.path.endsWith('V1__model.sql'))?.source;
    expect(enrollment).toContain('@ManyToOne');
    expect(enrollment).toContain('@JoinColumn(name = "student_id", nullable = false)');
    expect(associationMigration).toContain('uk_enrollment_course_id_student_id');
  });

  it('maps enums and joined inheritance', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'status', type: 'uml.Enumeration', name: 'Status', literals: ['ACTIVE', 'ARCHIVED'] },
      { id: 'document', type: 'uml.AbstractClass', name: 'Document', attributes: ['title: String'] },
      { id: 'invoice', type: 'uml.Class', name: 'Invoice', attributes: ['status: Status'] },
    ], connections: [
      { id: 'invoice-document', type: 'inheritance', sourceId: 'invoice', targetId: 'document' },
      { id: 'invoice-status', type: 'enumUsage', sourceId: 'invoice', targetId: 'status' },
    ] });
    const generated = files(analysis);
    const base = generated.find((file) => file.path.endsWith('documents/entity/DocumentEntity.java'))?.source;
    const child = generated.find((file) => file.path.endsWith('invoices/entity/InvoiceEntity.java'))?.source;
    const enumFile = generated.find((file) => file.path.endsWith('statuss/model/Status.java'))?.source;
    expect(base).toContain('@Inheritance(strategy = InheritanceType.JOINED)');
    expect(child).toContain('class InvoiceEntity extends DocumentEntity');
    expect(child).toContain('@Enumerated(EnumType.STRING)');
    expect(enumFile).toContain('enum Status');
  });

  it('rejects ambiguous one-to-one ownership instead of omitting persistence', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'profile', type: 'uml.Class', name: 'Profile' },
      { id: 'account', type: 'uml.Class', name: 'Account' },
    ], connections: [{ id: 'profile-account', type: 'association', sourceId: 'profile', targetId: 'account', sourceMultiplicity: '1', targetMultiplicity: '0..1' }] });
    expect(() => files(analysis)).toThrow('ambiguous ownership');
  });
});
