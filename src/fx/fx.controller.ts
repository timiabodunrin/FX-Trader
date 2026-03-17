import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FxService } from './fx.service';

@ApiTags('FX')
@Controller('fx')
export class FxController {
  constructor(private readonly fxService: FxService) {}

  @Get('rates')
  @ApiOperation({ summary: 'Get FX rates for a base currency' })
  @ApiQuery({ name: 'base', required: false, example: 'USD' })
  getRates(@Query('base') base = 'USD') {
    return this.fxService.getRates(base);
  }

  @Get('rate')
  @ApiOperation({ summary: 'Get a single FX rate from -> to' })
  @ApiQuery({ name: 'from', required: true, example: 'NGN' })
  @ApiQuery({ name: 'to', required: true, example: 'USD' })
  getRate(@Query('from') from: string, @Query('to') to: string) {
    return this.fxService.getRate(from, to);
  }
}
