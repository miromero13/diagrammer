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
    expect(create).toContain('@Schema(description = "email field", requiredMode = Schema.RequiredMode.REQUIRED)');
    expect(create).toContain('@Schema(description = "CreateAccountDto API schema")');
    expect(create).toContain('public String email;');
    expect(create).toContain('public String nickname;');
    expect(create).not.toContain('UUID id');
    expect(update).not.toContain('@NotNull');
    expect(response).toContain('public UUID id;');
    expect(response).toContain('@Schema(description = "Entity identifier", format = "uuid"');
    expect(query).toContain('public Integer page;');
    expect(query).toContain('public Integer size;');
    expect(query).toContain('import io.swagger.v3.oas.annotations.media.Schema;');
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

  it('flattens inherited fields and emits owning relation IDs', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'user', type: 'uml.AbstractClass', name: 'User', attributes: ['name: String [1]'] },
      { id: 'admin', type: 'uml.Class', name: 'Admin', attributes: ['department: Department', 'level: Integer'] },
      { id: 'department', type: 'uml.Class', name: 'Department', attributes: ['name: String'] },
    ], connections: [
      { id: 'admin-user', type: 'inheritance', sourceId: 'admin', targetId: 'user' },
      { id: 'admin-department', type: 'association', sourceId: 'admin', targetId: 'department', sourceMultiplicity: '1', targetMultiplicity: '1' },
    ] });
    const create = generateDtos(analysis, 'com.example.generated').find((file) => file.path.endsWith('admins/dto/CreateAdminDto.java'))?.source;
    const update = generateDtos(analysis, 'com.example.generated').find((file) => file.path.endsWith('admins/dto/UpdateAdminDto.java'))?.source;
    const response = generateDtos(analysis, 'com.example.generated').find((file) => file.path.endsWith('admins/dto/AdminResponseDto.java'))?.source;
    const mapper = generateDtos(analysis, 'com.example.generated').find((file) => file.path.endsWith('admins/mapper/AdminMapper.java'))?.source;

    expect(create).toContain('public String name;');
    expect(create).toContain('public Integer level;');
    expect(create).toContain('public UUID departmentId;');
    expect(create).toContain('@NotNull');
    expect(create).not.toContain('userId');
    expect(update).toContain('public UUID departmentId;');
    expect(update).not.toContain('requiredMode = Schema.RequiredMode.REQUIRED');
    expect(response).toContain('public UUID departmentId;');
    expect(response).toContain('accessMode = Schema.AccessMode.READ_ONLY');
    expect(mapper).toContain('response.departmentId = entity.department == null ? null : entity.department.getId();');
  });

  it('makes only the many-to-many owner writable and maps both ID collections', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'article', type: 'uml.Class', name: 'Article' },
      { id: 'tag', type: 'uml.Class', name: 'Tag' },
    ], connections: [{ id: 'article-tags', type: 'association', sourceId: 'article', targetId: 'tag', sourceMultiplicity: '0..*', targetMultiplicity: '0..*' }] });
    const files = generateDtos(analysis, 'com.example.generated');
    const articleCreate = files.find((file) => file.path.endsWith('articles/dto/CreateArticleDto.java'))?.source;
    const tagCreate = files.find((file) => file.path.endsWith('tags/dto/CreateTagDto.java'))?.source;
    const tagResponse = files.find((file) => file.path.endsWith('tags/dto/TagResponseDto.java'))?.source;
    const articleMapper = files.find((file) => file.path.endsWith('articles/mapper/ArticleMapper.java'))?.source;

    expect(articleCreate).toContain('public List<UUID> tagsIds;');
    expect(tagCreate).not.toContain('articlesIds');
    expect(tagResponse).toContain('public List<UUID> articlesIds;');
    expect(articleMapper).toContain('entity.tags == null ? List.of()');
  });

  it('does not invent a one-to-one ID when multiplicities are ambiguous', () => {
    const analysis = normalizeAndValidateUml({ elements: [
      { id: 'profile', type: 'uml.Class', name: 'Profile' },
      { id: 'account', type: 'uml.Class', name: 'Account' },
    ], connections: [{ id: 'profile-account', type: 'association', sourceId: 'profile', targetId: 'account' }] });
    const files = generateDtos(analysis, 'com.example.generated');
    const profileCreate = files.find((file) => file.path.endsWith('profiles/dto/CreateProfileDto.java'))?.source;
    const accountResponse = files.find((file) => file.path.endsWith('accounts/dto/AccountResponseDto.java'))?.source;

    expect(profileCreate).not.toContain('accountId');
    expect(accountResponse).not.toContain('profileId');
  });
});
