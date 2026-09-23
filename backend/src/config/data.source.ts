import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

ConfigModule.forRoot({ envFilePath: '.env' });
const configService = new ConfigService();

const isProd = configService.get('APP_PROD') === 'true';
const shouldSynchronize = configService.get('TYPEORM_SYNC') === 'true';
const dbUrl = configService.get('DB_URL') as string | undefined;
const dbHost = String(configService.get('DB_HOST') || 'localhost');
const dbPort = Number(configService.get('DB_PORT') || 5432);
const dbUsername = String(configService.get('DB_USERNAME') || 'postgres');
const dbPassword = String(configService.get('DB_PASSWORD') || '');
const dbDatabase = String(configService.get('DB_DATABASE') || 'postgres');

export const DataSourceConfig: DataSourceOptions = {
  type: 'postgres',
  ...(dbUrl
    ? { url: dbUrl }
    : {
        host: dbHost,
        port: dbPort,
        username: dbUsername,
        password: dbPassword,
        database: dbDatabase,
      }),
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  migrationsRun: true,
  synchronize: shouldSynchronize,
  namingStrategy: new SnakeNamingStrategy(),
  logging: false,
  extra: {
    ssl: isProd ? { rejectUnauthorized: false } : false,
  },
};

export const AppDS = new DataSource(DataSourceConfig);
