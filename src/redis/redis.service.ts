import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

type JsonValue = Record<string, unknown>;

type RedisClientLike = {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode?: 'EX',
    duration?: number,
  ): Promise<unknown>;
  quit(): Promise<unknown>;
  on(event: 'error', listener: (err: Error) => void): unknown;
};

type RedisConstructor = new (options: {
  host: string;
  port: number;
  password?: string;
  db: number;
  maxRetriesPerRequest: number;
  enableReadyCheck: boolean;
}) => RedisClientLike;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientLike | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST');
    if (!host) {
      this.logger.warn('REDIS_HOST not set; Redis cache disabled');
      return;
    }

    const port = Number(this.configService.get<number>('REDIS_PORT', 6379));
    const password = this.configService.get<string>('REDIS_PASSWORD');
    const db = Number(this.configService.get<number>('REDIS_DB', 0));

    const RedisCtor = IORedis as unknown as RedisConstructor;
    const client = new RedisCtor({
      host,
      port,
      password: password || undefined,
      db,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });

    client.on('error', (err) => {
      this.logger.warn(`Redis error: ${err.message}`);
    });

    this.client = client;
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  isReady(): boolean {
    return !!this.client;
  }

  async getJson<T extends JsonValue>(key: string): Promise<T | null> {
    if (!this.client) return null;
    const value = await this.client.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      this.logger.warn('Failed to parse cached JSON');
      return null;
    }
  }

  async setJson(
    key: string,
    value: JsonValue,
    ttlSeconds?: number,
  ): Promise<void> {
    if (!this.client) return;
    const payload = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, payload, 'EX', ttlSeconds);
      return;
    }
    await this.client.set(key, payload);
  }
}
