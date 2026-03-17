import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FxRateSnapshot } from './entities/fx-rate-snapshot.entity';
import { RedisService } from '../redis/redis.service';

interface FxApiResponse {
  base_code?: string;
  conversion_rates?: Record<string, number>;
  result?: string;
  error_type?: string;
}

@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private readonly localCache = new Map<
    string,
    { rates: Record<string, number>; expiresAt: number; fetchedAt: Date }
  >();
  private readonly ttlMs: number;
  private readonly ttlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @InjectRepository(FxRateSnapshot)
    private readonly fxRepo: Repository<FxRateSnapshot>,
  ) {
    this.ttlSeconds = this.configService.get<number>(
      'FX_CACHE_TTL_SECONDS',
      60,
    );
    this.ttlMs = Math.max(5, this.ttlSeconds) * 1000;
  }

  async getRates(baseCurrency: string) {
    const base = this.normalizeCurrency(baseCurrency);
    const now = Date.now();
    const cacheKey = `fx:rates:${base}`;
    const cachedRedis = await this.redisService.getJson<{
      rates: Record<string, number>;
      fetchedAt: string;
    }>(cacheKey);

    if (cachedRedis) {
      return {
        base,
        rates: cachedRedis.rates,
        fetchedAt: new Date(cachedRedis.fetchedAt),
        source: 'redis',
      };
    }

    const cachedLocal = this.localCache.get(base);
    if (cachedLocal && cachedLocal.expiresAt > now) {
      return {
        base,
        rates: cachedLocal.rates,
        fetchedAt: cachedLocal.fetchedAt,
        source: 'cache-local',
      };
    }

    try {
      const { rates, fetchedAt } = await this.fetchRates(base);
      this.localCache.set(base, {
        rates,
        fetchedAt,
        expiresAt: now + this.ttlMs,
      });
      await this.redisService.setJson(
        cacheKey,
        { rates, fetchedAt: fetchedAt.toISOString() },
        this.ttlSeconds,
      );
      return { base, rates, fetchedAt, source: 'api' };
    } catch (error) {
      if (cachedLocal) {
        this.logger.warn(
          `FX API failed for ${base}; serving stale cache instead`,
        );
        return {
          base,
          rates: cachedLocal.rates,
          fetchedAt: cachedLocal.fetchedAt,
          source: 'cache-local-stale',
        };
      }

      throw error;
    }
  }

  async getRate(fromCurrency: string, toCurrency: string) {
    const from = this.normalizeCurrency(fromCurrency);
    const to = this.normalizeCurrency(toCurrency);

    if (from === to) {
      return {
        from,
        to,
        rate: 1,
        fetchedAt: new Date(),
        source: 'static',
      };
    }

    try {
      const { rates, fetchedAt, source } = await this.getRates(from);
      const rate = rates[to];

      if (!rate) {
        throw new BadRequestException(
          `Rate not available for ${from} -> ${to}`,
        );
      }

      await this.saveSnapshot(from, to, rate, fetchedAt);

      return { from, to, rate, fetchedAt, source };
    } catch (error) {
      const fallback = await this.getLatestSnapshot(from, to);
      if (fallback) {
        return {
          from,
          to,
          rate: Number(fallback.rate),
          fetchedAt: fallback.fetchedAt,
          source: 'db-fallback',
        };
      }
      throw error;
    }
  }

  private normalizeCurrency(value: string): string {
    const code = (value ?? '').trim().toUpperCase();
    if (!code || code.length < 3) {
      throw new BadRequestException('Invalid currency code');
    }
    return code;
  }

  private async fetchRates(base: string) {
    const apiKey = this.configService.get<string>('FX_API_KEY');
    const apiUrl = this.configService.get<string>('FX_API_URL');

    if (!apiKey || !apiUrl) {
      throw new ServiceUnavailableException('FX API is not configured');
    }

    const url = `${apiUrl}/${apiKey}/latest/${base}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new ServiceUnavailableException('Failed to fetch FX rates');
    }

    const data = (await response.json()) as FxApiResponse;
    if (data.result && data.result !== 'success') {
      throw new ServiceUnavailableException(data.error_type ?? 'FX API error');
    }

    if (!data.conversion_rates) {
      throw new ServiceUnavailableException('Invalid FX API response');
    }

    return { rates: data.conversion_rates, fetchedAt: new Date() };
  }

  private async saveSnapshot(
    base: string,
    target: string,
    rate: number,
    fetchedAt: Date,
  ) {
    try {
      await this.fxRepo.save(
        this.fxRepo.create({
          baseCurrency: base,
          targetCurrency: target,
          rate,
          fetchedAt,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Failed to persist FX snapshot: ${message}`);
    }
  }

  private async getLatestSnapshot(base: string, target: string) {
    return this.fxRepo.findOne({
      where: { baseCurrency: base, targetCurrency: target },
      order: { fetchedAt: 'DESC' },
    });
  }
}
