import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('fx_rate_snapshots')
@Index(['baseCurrency', 'targetCurrency'])
export class FxRateSnapshot extends BaseEntity {
  @Column({ length: 10 })
  baseCurrency: string;

  @Column({ length: 10 })
  targetCurrency: string;

  @Column('decimal', { precision: 18, scale: 8 })
  rate: number;

  @Column({ type: 'timestamp' })
  fetchedAt: Date;
}
