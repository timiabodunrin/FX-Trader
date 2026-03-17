import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { ActivityLog } from './entities/activity-log.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { FxRateSnapshot } from '../fx/entities/fx-rate-snapshot.entity';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActivityLog, Transaction, FxRateSnapshot]),
  ],
  providers: [AnalyticsService, RolesGuard],
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
