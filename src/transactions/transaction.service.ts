import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionQueryDto } from './dto/transaction.dto';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from './entities/transaction.entity';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async getUserTransactions(
    userId: string,
    query: TransactionQueryDto,
  ): Promise<{
    data: Transaction[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const qb = this.txRepo
      .createQueryBuilder('tx')
      .where('tx.userId = :userId', { userId })
      .orderBy('tx.createdAt', 'DESC');

    if (query.type) {
      qb.andWhere('tx.type = :type', { type: query.type });
    }

    if (query.status) {
      qb.andWhere('tx.status = :status', { status: query.status });
    }

    if (query.currency) {
      qb.andWhere(
        '(tx.fromCurrency = :currency OR tx.toCurrency = :currency)',
        { currency: query.currency.toUpperCase() },
      );
    }

    return this.paginate(qb, query.page, query.limit);
  }

  async getTransactionByReference(
    userId: string,
    reference: string,
  ): Promise<Transaction | null> {
    return this.txRepo.findOne({
      where: { reference, user: { id: userId } },
    });
  }

  async getTransactionStats(userId: string) {
    const stats = await this.txRepo
      .createQueryBuilder('tx')
      .select('tx.type', 'type')
      .addSelect('tx.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(tx.fromAmount)', 'totalAmount')
      .where('tx.userId = :userId', { userId })
      .groupBy('tx.type')
      .addGroupBy('tx.status')
      .getRawMany<{
        type: TransactionType;
        status: TransactionStatus;
        count: string;
        totalAmount: string;
      }>();

    return stats.map((s) => ({
      type: s.type,
      status: s.status,
      count: Number(s.count),
      totalAmount: Number(s.totalAmount),
    }));
  }

  private async paginate(
    qb: ReturnType<Repository<Transaction>['createQueryBuilder']>,
    page?: number,
    limit?: number,
  ): Promise<{
    data: Transaction[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const safeLimit = Math.min(Math.max(limit ?? 20, 1), 100);
    const safePage = Math.max(page ?? 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [data, total] = await qb.take(safeLimit).skip(skip).getManyAndCount();
    const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages,
        hasNext: safePage < totalPages,
        hasPrev: safePage > 1 && total > 0,
      },
    };
  }
}
