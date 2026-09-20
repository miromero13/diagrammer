import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCodeGenerationPhaseOne1740000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`ALTER TABLE generated_code
      ADD COLUMN IF NOT EXISTS owner_id uuid,
      ADD COLUMN IF NOT EXISTS status varchar(30) NOT NULL DEFAULT 'QUEUED',
      ADD COLUMN IF NOT EXISTS backend_name varchar(100) NOT NULL DEFAULT 'generated-project',
      ADD COLUMN IF NOT EXISTS authentication jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS steps jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS message text,
      ADD COLUMN IF NOT EXISTS zip_data bytea`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_generated_code_owner_id" ON generated_code(owner_id)`);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_generated_code_owner_id"`);
    await queryRunner.query(`ALTER TABLE generated_code DROP COLUMN IF EXISTS owner_id, DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS backend_name, DROP COLUMN IF EXISTS authentication, DROP COLUMN IF EXISTS steps, DROP COLUMN IF EXISTS message, DROP COLUMN IF EXISTS zip_data`);
  }
}
