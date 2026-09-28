import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fresh-database bootstrap for the application's PostgreSQL schema.
 * Existing schemas and migration histories are intentionally unsupported.
 */
export class BootstrapProductionSchema1740000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE TYPE "users_role_enum" AS ENUM ('user', 'admin')`);
    await queryRunner.query(`CREATE TYPE "project_members_role_enum" AS ENUM ('viewer', 'editor', 'admin')`);
    await queryRunner.query(`CREATE TYPE "project_members_status_enum" AS ENUM ('pending', 'active', 'inactive')`);
    await queryRunner.query(`CREATE TYPE "ai_interactions_interaction_type_enum" AS ENUM ('ask', 'agent')`);

    await queryRunner.query(`CREATE TABLE "users" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "username" character varying(50) NOT NULL,
      "email" character varying(100) NOT NULL,
      "password_hash" character varying(255) NOT NULL,
      "first_name" character varying(100) NOT NULL,
      "last_name" character varying(100) NOT NULL,
      "role" "users_role_enum" NOT NULL DEFAULT 'user',
      "avatar_url" character varying(255),
      "is_active" boolean NOT NULL DEFAULT true,
      "email_verified" boolean NOT NULL DEFAULT false,
      "last_login" TIMESTAMP WITH TIME ZONE,
      "last_login_at" TIMESTAMP WITH TIME ZONE,
      "company" character varying(255),
      CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(`CREATE TABLE "projects" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "name" character varying(100) NOT NULL,
      "description" text,
      "owner_id" uuid NOT NULL,
      "is_public" boolean NOT NULL DEFAULT false,
      "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
      CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(`CREATE TABLE "project_members" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "project_id" uuid NOT NULL,
      "user_id" uuid NOT NULL,
      "role" "project_members_role_enum" NOT NULL DEFAULT 'viewer',
      "permissions" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "invited_by" uuid,
      "invited_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "joined_at" TIMESTAMP WITH TIME ZONE,
      "status" "project_members_status_enum" NOT NULL DEFAULT 'pending',
      CONSTRAINT "PK_0b2f46f804be4aea9234c78bcc9" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_b3f491d3a3f986106d281d8eb4b" UNIQUE ("project_id", "user_id")
    )`);
    await queryRunner.query(`CREATE TABLE "diagrams" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "project_id" uuid NOT NULL,
      "name" character varying(100) NOT NULL,
      "description" text,
      "content" jsonb NOT NULL DEFAULT '{"elements":[],"connections":[],"metadata":{}}'::jsonb,
      "is_active" boolean NOT NULL DEFAULT true,
      CONSTRAINT "PK_81f832a385d660caf0bf53cb6c9" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(`CREATE TABLE "diagram_versions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "diagram_id" uuid NOT NULL,
      "version_number" integer NOT NULL,
      "content" jsonb NOT NULL,
      "changes_summary" text,
      "created_by" uuid NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_f22cd901352bdd3644ddeee9c00" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(`CREATE TABLE "generated_code" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "diagram_id" uuid NOT NULL,
      "owner_id" uuid,
      "version" character varying(20) NOT NULL DEFAULT '1.0.0',
      "language" character varying(50) NOT NULL,
      "status" character varying(30) NOT NULL DEFAULT 'QUEUED',
      "backend_name" character varying(100) NOT NULL,
      "authentication" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "steps" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "message" text,
      "code_structure" jsonb NOT NULL,
      "files" jsonb NOT NULL,
      "zip_data" bytea,
      "is_valid" boolean NOT NULL DEFAULT true,
      "compilation_errors" text,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_18ad9b792127e20a6560ce3c44f" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(`CREATE TABLE "ai_interactions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "user_id" uuid NOT NULL,
      "diagram_id" uuid,
      "interaction_type" "ai_interactions_interaction_type_enum" NOT NULL DEFAULT 'ask',
      "prompt" text NOT NULL,
      "response" text NOT NULL,
      "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "confidence_score" double precision,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_3d775287d9543a6d92d5151a31c" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fe0bb3f6520ee0469504521e71" ON "users" ("username")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_2187088ab5ef2a918473cb9900" ON "projects" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_af992ee2cb5cafa4eec2977593" ON "diagrams" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_f957fe8430031062673a1b2295" ON "diagram_versions" ("diagram_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_7f3c475213dd318498b02454f1" ON "generated_code" ("diagram_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_1881a16244c8426eb8739ea95f" ON "generated_code" ("language")`);
    await queryRunner.query(`CREATE INDEX "IDX_e89aea982f684977faf6919353" ON "generated_code" ("created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_24a89d830b85e35f723cf5a99f" ON "generated_code" ("owner_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_745b66db11c0c988b44334626d" ON "ai_interactions" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_255c1eb2c3bb36a4b6ae1b00fb" ON "ai_interactions" ("diagram_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_cecb71c5bf35b36d63a55e3b47" ON "ai_interactions" ("interaction_type")`);
    await queryRunner.query(`CREATE INDEX "IDX_b368c2adecd1606a020774e44a" ON "ai_interactions" ("created_at")`);

    await queryRunner.query(`ALTER TABLE "projects" ADD CONSTRAINT "FK_b1bd2fbf5d0ef67319c91acb5cf" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "project_members" ADD CONSTRAINT "FK_b5729113570c20c7e214cf3f58d" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "project_members" ADD CONSTRAINT "FK_e89aae80e010c2faa72e6a49ce8" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "project_members" ADD CONSTRAINT "FK_7fb7f06d86f261a4961f145655e" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "diagrams" ADD CONSTRAINT "FK_af992ee2cb5cafa4eec2977593c" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "diagram_versions" ADD CONSTRAINT "FK_f957fe8430031062673a1b2295c" FOREIGN KEY ("diagram_id") REFERENCES "diagrams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "diagram_versions" ADD CONSTRAINT "FK_9ee75c04959f06bf4ca90f27f4a" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "generated_code" ADD CONSTRAINT "FK_7f3c475213dd318498b02454f14" FOREIGN KEY ("diagram_id") REFERENCES "diagrams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" ADD CONSTRAINT "FK_745b66db11c0c988b44334626d5" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" ADD CONSTRAINT "FK_255c1eb2c3bb36a4b6ae1b00fb2" FOREIGN KEY ("diagram_id") REFERENCES "diagrams"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ai_interactions" DROP CONSTRAINT "FK_255c1eb2c3bb36a4b6ae1b00fb2"`);
    await queryRunner.query(`ALTER TABLE "ai_interactions" DROP CONSTRAINT "FK_745b66db11c0c988b44334626d5"`);
    await queryRunner.query(`ALTER TABLE "generated_code" DROP CONSTRAINT "FK_7f3c475213dd318498b02454f14"`);
    await queryRunner.query(`ALTER TABLE "diagram_versions" DROP CONSTRAINT "FK_9ee75c04959f06bf4ca90f27f4a"`);
    await queryRunner.query(`ALTER TABLE "diagram_versions" DROP CONSTRAINT "FK_f957fe8430031062673a1b2295c"`);
    await queryRunner.query(`ALTER TABLE "diagrams" DROP CONSTRAINT "FK_af992ee2cb5cafa4eec2977593c"`);
    await queryRunner.query(`ALTER TABLE "project_members" DROP CONSTRAINT "FK_7fb7f06d86f261a4961f145655e"`);
    await queryRunner.query(`ALTER TABLE "project_members" DROP CONSTRAINT "FK_e89aae80e010c2faa72e6a49ce8"`);
    await queryRunner.query(`ALTER TABLE "project_members" DROP CONSTRAINT "FK_b5729113570c20c7e214cf3f58d"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT "FK_b1bd2fbf5d0ef67319c91acb5cf"`);
    await queryRunner.query(`DROP TABLE "ai_interactions"`);
    await queryRunner.query(`DROP TABLE "generated_code"`);
    await queryRunner.query(`DROP TABLE "diagram_versions"`);
    await queryRunner.query(`DROP TABLE "diagrams"`);
    await queryRunner.query(`DROP TABLE "project_members"`);
    await queryRunner.query(`DROP TABLE "projects"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "ai_interactions_interaction_type_enum"`);
    await queryRunner.query(`DROP TYPE "project_members_status_enum"`);
    await queryRunner.query(`DROP TYPE "project_members_role_enum"`);
    await queryRunner.query(`DROP TYPE "users_role_enum"`);
  }
}
