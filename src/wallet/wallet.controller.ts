import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { ConvertDto } from './dto/convert.dto';
import { FundWalletDto } from './dto/fund-wallet.dto';
import { TransactionType } from '../transactions/entities/transaction.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { VerifiedGuard } from '../common/guards/verified.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallet')
@UseGuards(JwtAuthGuard, VerifiedGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get wallet balances' })
  getBalances(@CurrentUser() user: AuthUser) {
    return this.walletService.getBalances(user.id);
  }

  @Post('convert')
  @ApiOperation({ summary: 'Convert between currencies' })
  convert(@Body() dto: ConvertDto, @CurrentUser() user: AuthUser) {
    return this.walletService.convert(
      user.id,
      dto.fromCurrency,
      dto.toCurrency,
      dto.amount,
      TransactionType.CONVERSION,
    );
  }

  @Post('trade')
  @ApiOperation({ summary: 'Trade between currencies' })
  trade(@Body() dto: ConvertDto, @CurrentUser() user: AuthUser) {
    return this.walletService.convert(
      user.id,
      dto.fromCurrency,
      dto.toCurrency,
      dto.amount,
      TransactionType.TRADE,
    );
  }

  @Post('fund')
  @ApiOperation({ summary: 'Fund wallet' })
  fund(@Body() dto: FundWalletDto, @CurrentUser() user: AuthUser) {
    return this.walletService.fund(user.id, dto.currency, dto.amount);
  }
}
