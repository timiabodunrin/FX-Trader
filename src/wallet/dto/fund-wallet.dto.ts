import {
  IsString,
  IsNumber,
  IsPositive,
  IsUppercase,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class FundWalletDto {
  @ApiProperty({ example: 'NGN' })
  @IsString()
  @IsUppercase()
  @Length(3, 3)
  currency: string;

  @ApiProperty({ example: 5000 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;
}
