import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixGeneratedCodeCreatedAt1740000001000 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`ALTER TABLE generated_code ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP`);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`ALTER TABLE generated_code ALTER COLUMN created_at DROP DEFAULT`);
  }
}
