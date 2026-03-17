import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FxRateSnapshot } from './entities/fx-rate-snapshot.entity';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([FxRateSnapshot]), RedisModule],
  controllers: [FxController],
  providers: [FxService],
  exports: [FxService],
})
export class FxModule {}
