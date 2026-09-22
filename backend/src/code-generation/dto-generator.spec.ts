import { generateDtos } from './dto-generator';
import { normalizeAndValidateUml } from './uml-analysis';

describe('generateDtos', () => {
  it('generates deterministic request, response, query, validation, and scalar mapping files', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'account', type: 'uml.Class', name: 'Account', attributes: ['nickname: String', 'email: String [1]', 'id: UUID'] },
      { id: 'status', type: 'uml.Enumeration', name: 'Status', literals: ['ACTIVE'] },
      { id: 'order', type: 'uml.Class', name: 'Order', attributes: ['status: Status', 'account: Account'] },
    ], connections: [{ id: 'order-account', type: 'association', sourceId: 'order', targetId: 'account', sourceMultiplicity: '0..*', targetMultiplicity: '0..1' }, { id: 'order-status', type: 'enumUsage', sourceId: 'order', targetId: 'status' }] });
    const generated = generateDtos(analysis, 'com.example.generated');
    const create = generated.find((file) => file.path.endsWith('accounts/dto/CreateAccountDto.java'))?.source;
    const update = generated.find((file) => file.path.endsWith('accounts/dto/UpdateAccountDto.java'))?.source;
    const response = generated.find((file) => file.path.endsWith('accounts/dto/AccountResponseDto.java'))?.source;
    const query = generated.find((file) => file.path.endsWith('accounts/dto/AccountQueryDto.java'))?.source;
    const mapper = generated.find((file) => file.path.endsWith('accounts/mapper/AccountMapper.java'))?.source;

    expect(generated).toHaveLength(10);
    expect(create).toContain('@NotNull');
    expect(create).toContain('public String email;');
    expect(create).toContain('public String nickname;');
    expect(create).not.toContain('UUID id');
    expect(update).not.toContain('@NotNull');
    expect(response).toContain('public UUID id;');
    expect(query).toContain('public Integer page;');
    expect(query).toContain('public Integer size;');
    expect(mapper).toContain('import org.springframework.stereotype.Component;');
    expect(mapper).toContain('@Component');
    expect(mapper).toContain('entity.email = dto.email;');
    expect(mapper).toContain('if (dto.email != null) entity.email = dto.email;');
    expect(mapper).toContain('response.id = entity.getId();');
    expect(mapper).not.toContain('account = dto.account');
    expect(mapper).not.toContain('@Email');
  });

  it('does not invent validation when multiplicity is absent', () => {
    const analysis = normalizeAndValidateUml({ elements: [{ id: 'product', type: 'uml.Class', name: 'Product', attributes: ['name: String', 'price: BigDecimal'] }], connections: [] });
    const create = generateDtos(analysis, 'com.example.generated').find((file) => file.path.endsWith('products/dto/CreateProductDto.java'))?.source;

    expect(create).not.toContain('jakarta.validation');
    expect(create).not.toContain('@Size');
    expect(create).not.toContain('@Email');
  });

  it('keeps abstract entity mappers compile-safe', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'document', type: 'uml.AbstractClass', name: 'Document', attributes: ['title: String'] },
      { id: 'job', type: 'uml.Class', name: 'Job', attributes: ['title: String'], methods: ['+run(): void {abstract}'] },
      { id: 'invoice', type: 'uml.Class', name: 'Invoice' },
    ], connections: [{ id: 'invoice-document', type: 'inheritance', sourceId: 'invoice', targetId: 'document' }] });
    const mapper = generateDtos(analysis, 'com.example.generated').find((file) => file.path.endsWith('documents/mapper/DocumentMapper.java'))?.source;

    expect(mapper).toContain('toEntity(CreateDocumentDto dto, DocumentEntity entity)');
    expect(mapper).not.toContain('new DocumentEntity()');

    const promotedMapper = generateDtos(analysis, 'com.example.generated').find((file) => file.path.endsWith('jobs/mapper/JobMapper.java'))?.source;
    expect(promotedMapper).toContain('toEntity(CreateJobDto dto, JobEntity entity)');
    expect(promotedMapper).not.toContain('new JobEntity()');
  });
});
