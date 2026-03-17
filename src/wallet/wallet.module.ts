import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletBalance } from './entities/wallet-balance.entity';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { Transaction } from '../transactions/entities/transaction.entity';
import { UsersModule } from '../users/users.module';
import { FxModule } from '../fx/fx.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletBalance, Transaction]),
    UsersModule,
    FxModule,
    AnalyticsModule,
  ],
  providers: [WalletService],
  controllers: [WalletController],
  exports: [WalletService],
})
export class WalletModule {}
