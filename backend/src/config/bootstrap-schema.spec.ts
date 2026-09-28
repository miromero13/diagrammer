import 'reflect-metadata';

import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { AIInteractionEntity } from '../ai/entities/ai-interaction.entity';
import { GeneratedCodeEntity } from '../code-generation/entities/generated-code.entity';
import { BaseEntity } from '../common/entities/base.entity';
import { DiagramVersionEntity } from '../diagrams/entities/diagram-version.entity';
import { DiagramEntity } from '../diagrams/entities/diagram.entity';
import { ProjectMemberEntity } from '../projects/entities/project-member.entity';
import { ProjectEntity } from '../projects/entities/project.entity';
import { UserEntity } from '../users/entities/user.entity';
import { BootstrapProductionSchema1740000000000 } from '../migrations/1740000000000-bootstrap-production-schema';

const entities = [
  AIInteractionEntity,
  GeneratedCodeEntity,
  DiagramVersionEntity,
  DiagramEntity,
  ProjectMemberEntity,
  ProjectEntity,
  UserEntity,
];

const normalize = (value: string) => value.replace(/"/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

describe('fresh production schema migration', () => {
  it('covers every entity metadata table, column, index, unique, foreign key, enum, and default without connecting', async () => {
    const dataSource = new DataSource({
      type: 'postgres',
      entities: [...entities, BaseEntity],
      namingStrategy: new SnakeNamingStrategy(),
    });
    // Building metadata is local-only; DataSource.initialize() is deliberately never called.
    await (dataSource as any).buildMetadatas();
    const statements: string[] = [];
    const queryRunner = {
      query: async (sql: string) => { statements.push(sql); return []; },
    } as unknown as QueryRunner;
    await new BootstrapProductionSchema1740000000000().up(queryRunner);
    const sql = statements.join('\n');

    expect(dataSource.entityMetadatas).toHaveLength(7);
    const jsonbDefaults = new Map(
      dataSource.entityMetadatas.flatMap((metadata) =>
        metadata.columns
          .filter((column) => column.type === 'jsonb' && column.default !== undefined)
          .map((column) => [`${metadata.tableName}.${column.databaseName}`, column.default]),
      ),
    );
    expect(jsonbDefaults).toEqual(new Map([
      ['diagrams.content', { elements: [], connections: [], metadata: {} }],
      ['project_members.permissions', {}],
      ['projects.settings', {}],
      ['ai_interactions.context', {}],
      ['generated_code.authentication', {}],
      ['generated_code.steps', []],
    ]));
    for (const value of jsonbDefaults.values()) {
      expect(typeof value === 'object' && value !== null).toBe(true);
    }
    expect(statements.filter((statement) => /^CREATE (UNIQUE )?INDEX /.test(statement))).toHaveLength(
      dataSource.entityMetadatas.reduce((count, metadata) => count + metadata.indices.length, 0),
    );
    expect(sql).toContain('DEFAULT uuid_generate_v4()');
    expect(sql).toContain("DEFAULT '{}'::jsonb");
    expect(sql).toContain("DEFAULT '[]'::jsonb");
    expect(sql).toContain("DEFAULT '{\"elements\":[],\"connections\":[],\"metadata\":{}}'::jsonb");
    expect(sql).toContain('DEFAULT now()');
    for (const metadata of dataSource.entityMetadatas) {
      const tablePattern = new RegExp(`CREATE TABLE "${metadata.tableName}" \\(([\\s\\S]*?)\\n    \\)`);
      const table = sql.match(tablePattern)?.[1];
      expect(table).toBeDefined();
      for (const column of metadata.columns) {
        const columnPattern = new RegExp(`"${column.databaseName}"\\s+([^\\n]+)`);
        const definition = table?.match(columnPattern)?.[1];
        expect(definition).toBeDefined();
        const expectedType = column.type === 'varchar' || column.type === 'character varying'
          ? `character varying${column.length ? `(${column.length})` : ''}`
          : column.type === 'float' ? 'double precision' : String(column.type).toLowerCase();
        expect(normalize(definition as string)).toContain(normalize(expectedType));
        expect(normalize(definition as string).includes('not null')).toBe(!column.isNullable);
        if (column.isCreateDate || column.isUpdateDate) {
          expect(normalize(definition as string)).toContain('default now()');
        } else if (
          column.type !== 'jsonb' &&
          column.default !== undefined &&
          column.default !== null &&
          typeof column.default !== 'function'
        ) {
          const renderedDefault = typeof column.default === 'string'
            ? column.default
            : String(column.default);
          expect(normalize(definition as string)).toContain(normalize(renderedDefault));
        }
        if (column.enum?.length) {
          const enumName = table?.match(new RegExp(`"${column.databaseName}"\\s+"([^"]+)"`))?.[1];
          expect(enumName).toBeDefined();
          expect(sql).toContain(`CREATE TYPE "${enumName}" AS ENUM`);
          for (const enumValue of column.enum) expect(sql).toContain(`'${enumValue}'`);
        }
      }
      for (const index of metadata.indices) {
        const names = index.columns.map((column) => `"${column.databaseName}"`).join(', ');
        const indexStatement = statements.find((statement) => statement.includes(`ON "${metadata.tableName}" (${names})`));
        expect(indexStatement).toBeDefined();
        if (index.isUnique) expect(indexStatement).toContain('CREATE UNIQUE INDEX');
      }
      for (const unique of metadata.uniques) {
        const names = unique.columns.map((column) => `"${column.databaseName}"`).join(', ');
        expect(sql).toContain(`UNIQUE (${names})`);
      }
      for (const foreignKey of metadata.foreignKeys) {
        const local = foreignKey.columnNames.map((name) => `"${name}"`).join(', ');
        const referenced = foreignKey.referencedColumnNames.map((name) => `"${name}"`).join(', ');
        expect(sql).toContain(`FOREIGN KEY (${local}) REFERENCES "${foreignKey.referencedTablePath}"(${referenced})`);
        expect(sql).toContain(`ON DELETE ${foreignKey.onDelete}`);
      }
    }
  });

  it('drops dependent tables before their enum types on rollback', async () => {
    const statements: string[] = [];
    const queryRunner = { query: async (sql: string) => { statements.push(sql); return []; } } as unknown as QueryRunner;
    await new BootstrapProductionSchema1740000000000().down(queryRunner);
    const tableDrops = statements.filter((sql) => sql.startsWith('DROP TABLE'));
    const typeDrops = statements.filter((sql) => sql.startsWith('DROP TYPE'));
    expect(tableDrops).toHaveLength(7);
    expect(typeDrops).toHaveLength(4);
    expect(Math.max(...tableDrops.map((sql) => statements.indexOf(sql))))
      .toBeLessThan(Math.min(...typeDrops.map((sql) => statements.indexOf(sql))));
  });
});
