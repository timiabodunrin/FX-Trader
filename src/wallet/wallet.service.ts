import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { FxService } from '../fx/fx.service';
import { Wallet } from './entities/wallet.entity';
import { WalletBalance } from './entities/wallet-balance.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class WalletService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly fxService: FxService,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(WalletBalance)
    private readonly balanceRepo: Repository<WalletBalance>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async getBalances(userId: string) {
    const wallet = await this.ensureWallet(userId);
    const balances = await this.balanceRepo.find({
      where: { wallet: { id: wallet.id } },
      order: { currency: 'ASC' },
    });

    return {
      walletId: wallet.id,
      balances: balances.map((b) => ({
        currency: b.currency,
        balance: Number(b.balance),
      })),
    };
  }

  async convert(
    userId: string,
    fromCurrency: string,
    toCurrency: string,
    amount: number,
    type: TransactionType = TransactionType.CONVERSION,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException('User not found');

    const from = this.normalizeCurrency(fromCurrency);
    const to = this.normalizeCurrency(toCurrency);

    if (from === to) {
      throw new BadRequestException('Currencies must be different');
    }

    const { rate, fetchedAt, source } = await this.fxService.getRate(from, to);

    const result = await this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const balanceRepo = manager.getRepository(WalletBalance);
      const txRepo = manager.getRepository(Transaction);

      let wallet = await walletRepo.findOne({ where: { userId: user.id } });
      if (!wallet) {
        wallet = await walletRepo.save(
          walletRepo.create({ user, userId: user.id }),
        );
      }

      const fromBalance = await balanceRepo.findOne({
        where: { wallet: { id: wallet.id }, currency: from },
        lock: { mode: 'pessimistic_write' },
      });

      if (!fromBalance || Number(fromBalance.balance) < amount) {
        throw new BadRequestException('Insufficient balance');
      }

      let toBalance = await balanceRepo.findOne({
        where: { wallet: { id: wallet.id }, currency: to },
        lock: { mode: 'pessimistic_write' },
      });

      if (!toBalance) {
        toBalance = balanceRepo.create({
          wallet,
          currency: to,
          balance: 0,
        });
      }

      const toAmount = Number((amount * rate).toFixed(4));
      const updatedFrom = Number(
        (Number(fromBalance.balance) - amount).toFixed(4),
      );
      const updatedTo = Number(
        (Number(toBalance.balance) + toAmount).toFixed(4),
      );

      fromBalance.balance = updatedFrom;
      toBalance.balance = updatedTo;

      await balanceRepo.save([fromBalance, toBalance]);

      const reference = this.generateReference();
      const tx = await txRepo.save(
        txRepo.create({
          user,
          wallet,
          walletId: wallet.id,
          type,
          status: TransactionStatus.SUCCESS,
          fromCurrency: from,
          toCurrency: to,
          fromAmount: amount,
          toAmount,
          rateUsed: rate,
          reference,
          note: `FX ${type.toLowerCase()} via ${source}`,
        }),
      );

      return {
        transactionId: tx.id,
        reference,
        from,
        to,
        rate,
        amount,
        received: toAmount,
        fetchedAt,
        source,
        balances: {
          [from]: updatedFrom,
          [to]: updatedTo,
        },
      };
    });

    return result;
  }

  async fund(userId: string, currency: string, amount: number) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException('User not found');
    const cur = this.normalizeCurrency(currency);

    return this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const balanceRepo = manager.getRepository(WalletBalance);
      const txRepo = manager.getRepository(Transaction);

      let wallet = await walletRepo.findOne({ where: { userId: user.id } });
      if (!wallet) {
        wallet = await walletRepo.save(
          walletRepo.create({ user, userId: user.id }),
        );
      }

      let balance = await balanceRepo.findOne({
        where: { wallet: { id: wallet.id }, currency: cur },
        lock: { mode: 'pessimistic_write' },
      });

      if (!balance) {
        balance = balanceRepo.create({
          wallet,
          currency: cur,
          balance: 0,
        });
      }

      const updated = Number((Number(balance.balance) + amount).toFixed(4));
      balance.balance = updated;
      await balanceRepo.save(balance);

      const reference = this.generateReference();
      const tx = await txRepo.save(
        txRepo.create({
          user,
          wallet,
          walletId: wallet.id,
          type: TransactionType.FUNDING,
          status: TransactionStatus.SUCCESS,
          fromCurrency: cur,
          toCurrency: cur,
          fromAmount: amount,
          toAmount: amount,
          rateUsed: 1,
          reference,
          note: 'Wallet funding',
        }),
      );

      return {
        transactionId: tx.id,
        reference,
        currency: cur,
        amount,
        balance: updated,
      };
    });
  }

  async createForUser(user: User, manager?: EntityManager): Promise<Wallet> {
    const walletRepo = manager
      ? manager.getRepository(Wallet)
      : this.walletRepo;

    const existing = await walletRepo.findOne({
      where: { userId: user.id },
    });
    if (existing) return existing;

    return walletRepo.save(walletRepo.create({ user, userId: user.id }));
  }

  private normalizeCurrency(value: string): string {
    const code = (value ?? '').trim().toUpperCase();
    if (!code || code.length < 3) {
      throw new BadRequestException('Invalid currency code');
    }
    return code;
  }

  private async ensureWallet(userId: string): Promise<Wallet> {
    let wallet = await this.walletRepo.findOne({ where: { userId } });
    if (wallet) return wallet;

    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException('User not found');

    wallet = this.walletRepo.create({ user, userId: user.id });
    return this.walletRepo.save(wallet);
  }

  private generateReference(): string {
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `FX-${Date.now()}-${rand}`;
  }
}
