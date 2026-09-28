import { AppDS } from '../config/data.source';

async function runMigrations(): Promise<void> {
  try {
    console.log('[run-migrations] Initializing data source...');
    await AppDS.initialize();
    console.log('[run-migrations] Running migrations...');
    const result = await AppDS.runMigrations();
    console.log('[run-migrations] Migrations completed:', result);
    await AppDS.destroy();
    process.exit(0);
  } catch (err) {
    console.error('[run-migrations] Migration failed:', err);
    try {
      await AppDS.destroy();
    } catch (_) {
      // ignore
    }
    process.exit(1);
  }
}

runMigrations();