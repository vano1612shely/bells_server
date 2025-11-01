import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { CharacteristicsModule } from './characteristic/characteristic.module';
import { FilesModule } from './files/files.module';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { DiscountModule } from './discount/discount.module';
import { PriceModule } from './price/price.module';
import { OrderModule } from './order/order.module';
import { ConfigModule } from '@nestjs/config';
import { BackTemplateModule } from './backTemplate/back-template.module';
import { MondialRelayModule } from './mondial-relay/mondial-relay.module';

@Module({
  imports: [
    // ✅ 1. Імпорт ConfigModule
    ConfigModule.forRoot({
      isGlobal: true, // робить доступним у всіх модулях без повторного імпорту
    }),

    // ✅ 2. TypeORM з використанням process.env
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true, // у продакшені краще false
    }),

    // ✅ 3. ServeStatic для завантажень
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', process.env.UPLOADS_PATH || 'uploads'),
      serveRoot: '/api/uploads',
    }),

    // Решта модулів
    AuthModule,
    CharacteristicsModule,
    FilesModule,
    DiscountModule,
    PriceModule,
    OrderModule,
    BackTemplateModule,
    MondialRelayModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
