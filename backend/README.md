<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>


<p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
<p align="center">

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Production database deployment

**Fresh, empty PostgreSQL databases only.** Existing installations, data, and migration histories are unsupported; there is no upgrade path. Do not use this bootstrap to update an existing database.

Before production deployment, take a backup/snapshot and verify as a preflight that the target database is empty and the deployment is pointed at the intended database. Set `DB_URL` for that database. Ensure the PostgreSQL role can create the `uuid-ossp` extension, or have an administrator enable it before deployment.

Build the backend, then run the compiled migrations:

```bash
npm run build
node dist/scripts/run-migrations.js
```

The Docker entrypoint runs the compiled migration runner automatically. Run only one deployment migration process at a time; do not start concurrent migration runners. `synchronize: false` is intentional: schema changes must be made through migrations. Do not use `db:sync` or database-drop scripts for production deployment.

Verify deployment by checking that all expected application tables and the migration record exist, and that the application can connect. Rollback is destructive: the bootstrap migration's `down` operation drops **all application tables and their data**. Never run it in production when data must be preserved. Restore from the pre-deployment backup/snapshot instead; there is no supported in-place rollback or upgrade path for existing installs.

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## License

Nest is [MIT licensed](LICENSE).
