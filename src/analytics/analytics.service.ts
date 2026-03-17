import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityLog } from './entities/activity-log.entity';
import {
  Transaction,
  TransactionType,
} from '../transactions/entities/transaction.entity';
import { FxRateSnapshot } from '../fx/entities/fx-rate-snapshot.entity';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly activityRepo: Repository<ActivityLog>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(FxRateSnapshot)
    private readonly fxRepo: Repository<FxRateSnapshot>,
  ) {}

  async log(
    userId: string | null,
    action: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.activityRepo.save(
        this.activityRepo.create({
          userId,
          action,
          meta: meta ?? null,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Failed to record activity log: ${message}`);
    }
  }

  async getSummary() {
    const activityRows = await this.activityRepo
      .createQueryBuilder('a')
      .select('a.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .groupBy('a.action')
      .getRawMany<{ action: string; count: string }>();

    const activityTotal = activityRows.reduce(
      (sum, row) => sum + Number(row.count),
      0,
    );

    const tradeTotals = await this.txRepo
      .createQueryBuilder('tx')
      .select('COUNT(*)', 'count')
      .addSelect('SUM(tx.fromAmount)', 'totalAmount')
      .where('tx.type = :type', { type: TransactionType.TRADE })
      .getRawOne<{ count: string; totalAmount: string }>();

    const topPairs = await this.txRepo
      .createQueryBuilder('tx')
      .select('tx.fromCurrency', 'from')
      .addSelect('tx.toCurrency', 'to')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(tx.fromAmount)', 'volume')
      .where('tx.type = :type', { type: TransactionType.TRADE })
      .groupBy('tx.fromCurrency')
      .addGroupBy('tx.toCurrency')
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany<{
        from: string;
        to: string;
        count: string;
        volume: string;
      }>();

    const recentSnapshots = await this.fxRepo.find({
      order: { fetchedAt: 'DESC' },
      take: 10,
    });

    return {
      activity: {
        total: activityTotal,
        byAction: activityRows.map((row) => ({
          action: row.action,
          count: Number(row.count),
        })),
      },
      trades: {
        totalCount: Number(tradeTotals?.count ?? 0),
        totalVolume: Number(tradeTotals?.totalAmount ?? 0),
        topPairs: topPairs.map((row) => ({
          from: row.from,
          to: row.to,
          count: Number(row.count),
          volume: Number(row.volume),
        })),
      },
      fx: {
        recentSnapshots: recentSnapshots.map((snap) => ({
          id: snap.id,
          baseCurrency: snap.baseCurrency,
          targetCurrency: snap.targetCurrency,
          rate: Number(snap.rate),
          fetchedAt: snap.fetchedAt,
        })),
      },
    };
  }
}
