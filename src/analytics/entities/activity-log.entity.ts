import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity('activity_logs')
@Index(['userId'])
@Index(['action'])
export class ActivityLog extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ length: 50 })
  action: string;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;
}
