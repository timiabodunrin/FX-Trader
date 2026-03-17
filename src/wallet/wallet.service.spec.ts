import {
  DataSource,
  EntityManager,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { WalletService } from './wallet.service';
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
import { BadRequestException } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';

type FindOneFn<T> = (options?: FindOneOptions<T>) => Promise<T | null>;
type FindFn<T> = (options?: FindManyOptions<T>) => Promise<T[]>;
type CreateFn<T> = (data: Partial<T>) => T;
type SaveFn<T> = (entity: T | T[]) => Promise<T | T[]>;

type RepoMock<T> = {
  findOne: jest.MockedFunction<FindOneFn<T>>;
  find: jest.MockedFunction<FindFn<T>>;
  create: jest.MockedFunction<CreateFn<T>>;
  save: jest.MockedFunction<SaveFn<T>>;
};

const createRepoMock = <T>(): RepoMock<T> => ({
  findOne: jest.fn<ReturnType<FindOneFn<T>>, Parameters<FindOneFn<T>>>(),
  find: jest.fn<ReturnType<FindFn<T>>, Parameters<FindFn<T>>>(),
  create: jest.fn<ReturnType<CreateFn<T>>, Parameters<CreateFn<T>>>(
    (data) => data as T,
  ),
  save: jest.fn<ReturnType<SaveFn<T>>, Parameters<SaveFn<T>>>((entity) =>
    Promise.resolve(entity),
  ),
});

const getWhereCurrency = (
  where:
    | FindOptionsWhere<WalletBalance>
    | FindOptionsWhere<WalletBalance>[]
    | undefined,
): string | undefined => {
  if (!where) return undefined;
  const first = Array.isArray(where) ? where[0] : where;
  const currency = first?.currency;
  return typeof currency === 'string' ? currency : undefined;
};

const withId = <T extends { id?: string }>(data: Partial<T>, id: string): T =>
  Object.assign({} as T, data, { id });

type FxRateResult = {
  from: string;
  to: string;
  rate: number;
  fetchedAt: Date;
  source: string;
};
type FindByIdFn = (id: string) => Promise<User | null>;
type GetRateFn = (from: string, to: string) => Promise<FxRateResult>;
type TransactionRunner = {
  transaction: <T>(
    runInTransaction: (entityManager: EntityManager) => Promise<T>,
  ) => Promise<T>;
};
type AnalyticsLogFn = (
  userId: string | null,
  action: string,
  meta?: Record<string, unknown>,
) => Promise<void>;

describe('WalletService', () => {
  let service: WalletService;
  let walletRepo: RepoMock<Wallet>;
  let balanceRepo: RepoMock<WalletBalance>;
  let txRepo: RepoMock<Transaction>;
  let usersService: Pick<UsersService, 'findById'>;
  let fxService: Pick<FxService, 'getRate'>;
  let dataSource: TransactionRunner;
  let findByIdMock: jest.MockedFunction<FindByIdFn>;
  let getRateMock: jest.MockedFunction<GetRateFn>;
  let analyticsLogMock: jest.MockedFunction<AnalyticsLogFn>;
  let analyticsService: Pick<AnalyticsService, 'log'>;
  let manager: EntityManager;

  beforeEach(() => {
    walletRepo = createRepoMock<Wallet>();
    balanceRepo = createRepoMock<WalletBalance>();
    txRepo = createRepoMock<Transaction>();

    findByIdMock = jest.fn<ReturnType<FindByIdFn>, Parameters<FindByIdFn>>();
    usersService = { findById: findByIdMock };

    getRateMock = jest.fn<ReturnType<GetRateFn>, Parameters<GetRateFn>>();
    fxService = { getRate: getRateMock };

    analyticsLogMock = jest.fn<
      ReturnType<AnalyticsLogFn>,
      Parameters<AnalyticsLogFn>
    >();
    analyticsService = { log: analyticsLogMock };

    const getRepository = (
      entity: typeof Wallet | typeof WalletBalance | typeof Transaction,
    ) => {
      if (entity === Wallet) return walletRepo;
      if (entity === WalletBalance) return balanceRepo;
      if (entity === Transaction) return txRepo;
      throw new Error('Unknown entity');
    };

    manager = { getRepository } as unknown as EntityManager;

    dataSource = {
      transaction: <T>(fn: (mgr: EntityManager) => Promise<T>): Promise<T> =>
        fn(manager),
    };

    service = new WalletService(
      dataSource as unknown as DataSource,
      usersService as unknown as UsersService,
      fxService as unknown as FxService,
      walletRepo as unknown as Repository<Wallet>,
      balanceRepo as unknown as Repository<WalletBalance>,
      txRepo as unknown as Repository<Transaction>,
      analyticsService as unknown as AnalyticsService,
    );
  });

  it('returns balances for a newly created wallet', async () => {
    const user = { id: 'u1' } as User;
    findByIdMock.mockResolvedValue(user);

    const wallet = { id: 'w1', userId: 'u1', user } as Wallet;
    walletRepo.findOne.mockResolvedValue(null);
    walletRepo.create.mockImplementation((data) => withId<Wallet>(data, 'w1'));
    walletRepo.save.mockResolvedValue(wallet);
    balanceRepo.find.mockResolvedValue([]);

    const result = await service.getBalances('u1');

    expect(result).toEqual({ walletId: 'w1', balances: [] });
    expect(walletRepo.save).toHaveBeenCalled();
  });

  it('funds a wallet and records a transaction', async () => {
    const user = { id: 'u1' } as User;
    findByIdMock.mockResolvedValue(user);

    const wallet = { id: 'w1', userId: 'u1', user } as Wallet;
    walletRepo.findOne.mockResolvedValue(null);
    walletRepo.create.mockImplementation((data) => withId<Wallet>(data, 'w1'));
    walletRepo.save.mockResolvedValue(wallet);

    const balance = {
      id: 'b1',
      wallet,
      currency: 'USD',
      balance: 0,
    } as WalletBalance;
    balanceRepo.findOne.mockResolvedValue(null);
    balanceRepo.create.mockImplementation(
      (data) =>
        ({
          ...balance,
          ...data,
        }) as WalletBalance,
    );

    txRepo.create.mockImplementation((data) => data as Transaction);
    txRepo.save.mockImplementation((entity) => {
      if (Array.isArray(entity)) {
        return Promise.resolve(entity);
      }
      return Promise.resolve(withId<Transaction>(entity, 'tx1'));
    });

    const result = await service.fund('u1', 'usd', 100);

    const { reference, ...rest } = result;
    expect(typeof reference).toBe('string');
    expect(rest).toEqual({
      transactionId: 'tx1',
      currency: 'USD',
      amount: 100,
      balance: 100,
    });

    expect(balanceRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'USD', balance: 100 }),
    );

    expect(txRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: TransactionType.FUNDING,
        status: TransactionStatus.SUCCESS,
        fromCurrency: 'USD',
        toCurrency: 'USD',
        fromAmount: 100,
        toAmount: 100,
        rateUsed: 1,
        walletId: 'w1',
        note: 'Wallet funding',
      }),
    );
  });

  it('converts currency, updates balances, and records a transaction', async () => {
    const user = { id: 'u1' } as User;
    findByIdMock.mockResolvedValue(user);

    const wallet = { id: 'w1', userId: 'u1', user } as Wallet;
    walletRepo.findOne.mockResolvedValue(wallet);

    const fromBalance = {
      id: 'b1',
      wallet,
      currency: 'USD',
      balance: 100,
    } as WalletBalance;

    balanceRepo.findOne.mockImplementation((options) => {
      const currency = getWhereCurrency(options?.where);
      if (currency === 'USD') return Promise.resolve(fromBalance);
      if (currency === 'EUR') return Promise.resolve(null);
      return Promise.resolve(null);
    });

    txRepo.create.mockImplementation((data) => data as Transaction);
    txRepo.save.mockImplementation((entity) => {
      if (Array.isArray(entity)) {
        return Promise.resolve(entity);
      }
      return Promise.resolve(withId<Transaction>(entity, 'tx2'));
    });

    const fetchedAt = new Date('2024-01-01T00:00:00.000Z');
    getRateMock.mockResolvedValue({
      from: 'USD',
      to: 'EUR',
      rate: 2,
      fetchedAt,
      source: 'MockFX',
    });

    const result = await service.convert('u1', 'usd', 'eur', 25);

    const { reference, ...rest } = result;
    expect(typeof reference).toBe('string');
    expect(rest).toEqual({
      transactionId: 'tx2',
      from: 'USD',
      to: 'EUR',
      rate: 2,
      amount: 25,
      received: 50,
      fetchedAt,
      source: 'MockFX',
      balances: {
        USD: 75,
        EUR: 50,
      },
    });

    expect(txRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: TransactionType.CONVERSION,
        status: TransactionStatus.SUCCESS,
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        fromAmount: 25,
        toAmount: 50,
        rateUsed: 2,
        note: 'FX conversion via MockFX',
      }),
    );
  });

  it('throws when conversion balance is insufficient', async () => {
    const user = { id: 'u1' } as User;
    findByIdMock.mockResolvedValue(user);

    const wallet = { id: 'w1', userId: 'u1', user } as Wallet;
    walletRepo.findOne.mockResolvedValue(wallet);

    const fromBalance = {
      id: 'b1',
      wallet,
      currency: 'USD',
      balance: 10,
    } as WalletBalance;

    balanceRepo.findOne.mockImplementation((options) => {
      const currency = getWhereCurrency(options?.where);
      if (currency === 'USD') return Promise.resolve(fromBalance);
      return Promise.resolve(null);
    });

    getRateMock.mockResolvedValue({
      from: 'USD',
      to: 'EUR',
      rate: 2,
      fetchedAt: new Date(),
      source: 'MockFX',
    });

    await expect(service.convert('u1', 'usd', 'eur', 50)).rejects.toThrow(
      'Insufficient balance',
    );
  });

  it('throws if amount is zero or negative', async () => {
    await expect(service.fund('u1', 'NGN', 0)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.fund('u1', 'NGN', -100)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws if same currency on convert', async () => {
    await expect(service.convert('u1', 'NGN', 'NGN', 1000)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws if user not found', async () => {
    findByIdMock.mockResolvedValue(null);
    await expect(service.fund('u1', 'NGN', 100)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws if user not found when fetching balances', async () => {
    walletRepo.findOne.mockResolvedValue(null);
    findByIdMock.mockResolvedValue(null);

    await expect(service.getBalances('u1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns existing wallet without creating a new one', async () => {
    const user = { id: 'u1' } as User;
    const existing = { id: 'w1', userId: 'u1', user } as Wallet;
    walletRepo.findOne.mockResolvedValue(existing);

    const result = await service.createForUser(user);

    expect(result).toBe(existing);
    expect(walletRepo.create).not.toHaveBeenCalled();
    expect(walletRepo.save).not.toHaveBeenCalled();
  });

  it('updates existing target balance on conversion', async () => {
    const user = { id: 'u1' } as User;
    findByIdMock.mockResolvedValue(user);

    const wallet = { id: 'w1', userId: 'u1', user } as Wallet;
    walletRepo.findOne.mockResolvedValue(wallet);

    const fromBalance = {
      id: 'b1',
      wallet,
      currency: 'USD',
      balance: 100,
    } as WalletBalance;
    const toBalance = {
      id: 'b2',
      wallet,
      currency: 'EUR',
      balance: 30,
    } as WalletBalance;

    balanceRepo.findOne.mockImplementation((options) => {
      const currency = getWhereCurrency(options?.where);
      if (currency === 'USD') return Promise.resolve(fromBalance);
      if (currency === 'EUR') return Promise.resolve(toBalance);
      return Promise.resolve(null);
    });
    balanceRepo.save.mockImplementation((entity) => {
      if (Array.isArray(entity)) return Promise.resolve(entity);
      return Promise.resolve(entity);
    });

    txRepo.create.mockImplementation((data) => data as Transaction);
    txRepo.save.mockImplementation((entity) => {
      if (Array.isArray(entity)) return Promise.resolve(entity);
      return Promise.resolve(withId<Transaction>(entity, 'tx9'));
    });

    getRateMock.mockResolvedValue({
      from: 'USD',
      to: 'EUR',
      rate: 2,
      fetchedAt: new Date(),
      source: 'api',
    });

    const result = await service.convert('u1', 'USD', 'EUR', 10);

    expect(result.balances).toEqual({ USD: 90, EUR: 50 });

    const [savedBalances] = balanceRepo.save.mock.calls[0] as [WalletBalance[]];
    const savedFrom = savedBalances.find((b) => b.currency === 'USD');
    const savedTo = savedBalances.find((b) => b.currency === 'EUR');
    expect(savedFrom?.balance).toBe(90);
    expect(savedTo?.balance).toBe(50);
  });

  it('records TRADE type when called via trade()', async () => {
    const user = { id: 'u1' } as User;
    findByIdMock.mockResolvedValue(user);

    const wallet = { id: 'w1', user } as Wallet;
    walletRepo.findOne.mockResolvedValue(wallet);

    const fromBalance = {
      id: 'b1',
      wallet,
      currency: 'NGN',
      balance: 10000,
    } as WalletBalance;
    balanceRepo.findOne.mockImplementation((options) => {
      const currency = getWhereCurrency(options?.where);
      if (currency === 'NGN') return Promise.resolve(fromBalance);
      return Promise.resolve(null);
    });

    balanceRepo.create.mockImplementation((data) =>
      withId<WalletBalance>(data, 'b2'),
    );
    txRepo.create.mockImplementation((data) => data as Transaction);
    const saveSpy = txRepo.save.mockImplementation((entity) => {
      if (Array.isArray(entity)) return Promise.resolve(entity);
      return Promise.resolve(withId<Transaction>(entity, 'tx3'));
    });

    getRateMock.mockResolvedValue({
      from: 'NGN',
      to: 'USD',
      rate: 0.00065,
      fetchedAt: new Date(),
      source: 'api',
    });

    await service.convert('u1', 'NGN', 'USD', 1000, TransactionType.TRADE);

    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: TransactionType.TRADE }),
    );
  });
});
