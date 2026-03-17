import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Wallet } from './wallet.entity';

@Entity('wallet_balances')
@Unique(['wallet', 'currency'])
export class WalletBalance extends BaseEntity {
  @ManyToOne(() => Wallet, (wallet) => wallet.balances, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  wallet: Wallet;

  @Column({ length: 10 })
  currency: string;

  @Column('decimal', { precision: 18, scale: 4, default: 0 })
  balance: number;
}
