import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString, Min } from 'class-validator';

export class ConvertDto {
  @ApiProperty({ example: 'NGN' })
  @IsString()
  fromCurrency: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  toCurrency: string;

  @ApiProperty({ example: 1000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  amount: number;
}
