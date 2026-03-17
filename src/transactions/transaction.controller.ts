import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { VerifiedGuard } from '../common/guards/verified.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { TransactionsService } from './transaction.service';
import { TransactionQueryDto } from './dto/transaction.dto';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, VerifiedGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly txService: TransactionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get transaction history' })
  getHistory(@CurrentUser() user: User, @Query() query: TransactionQueryDto) {
    return this.txService.getUserTransactions(user.id, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get transaction stats' })
  getStats(@CurrentUser() user: User) {
    return this.txService.getTransactionStats(user.id);
  }

  @Get(':reference')
  @ApiOperation({ summary: 'Get transaction by reference' })
  getByReference(
    @CurrentUser() user: User,
    @Param('reference') reference: string,
  ) {
    return this.txService.getTransactionByReference(user.id, reference);
  }
}
