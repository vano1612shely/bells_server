import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import Redis from 'ioredis';
import { PaypalService } from './paypal.service';
import { PaypalController } from './paypal.controller';
import { OrderModule } from '../order/order.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../order/entities/order.entity';
import { PAYPAL_REDIS } from './paypal.constants';
import { EmailService } from '../notifications/email.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    OrderModule,
    TypeOrmModule.forFeature([Order]),
  ],
  controllers: [PaypalController],
  providers: [
    PaypalService,
    EmailService,
    {
      provide: PAYPAL_REDIS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisPort = parseInt(
          configService.get<string>('REDIS_PORT', '6379'),
          10,
        );
        return new Redis({
          host: configService.get<string>('REDIS_HOST', '127.0.0.1'),
          port: redisPort,
          password: configService.get<string>('REDIS_PASSWORD'),
          lazyConnect: true,
          enableAutoPipelining: true,
          keyPrefix: 'bells:paypal:',
        });
      },
    },
  ],
  exports: [PaypalService],
})
export class PaypalModule {}
