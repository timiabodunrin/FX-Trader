import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getDatabaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { FxModule } from './fx/fx.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { MailModule } from './mail/mail.module';
import { WalletModule } from './wallet/wallet.module';
import { TransactionsModule } from './transactions/transaction.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => getDatabaseConfig(config),
    }),
    RedisModule,
    AuthModule,
    FxModule,
    WalletModule,
    UsersModule,
    MailModule,
    TransactionsModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
