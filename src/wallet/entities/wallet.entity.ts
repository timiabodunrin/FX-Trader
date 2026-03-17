import {
  Entity,
  OneToOne,
  JoinColumn,
  OneToMany,
  Column,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { WalletBalance } from './wallet-balance.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';

@Entity('wallets')
@Index(['userId'], { unique: true })
export class Wallet extends BaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @OneToOne(() => User, (user) => user.wallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => WalletBalance, (balance) => balance.wallet, {
    cascade: true,
    eager: true,
  })
  balances: WalletBalance[];

  @OneToMany(() => Transaction, (tx) => tx.wallet)
  transactions: Transaction[];
}
