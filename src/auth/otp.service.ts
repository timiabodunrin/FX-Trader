import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OtpToken } from './entities/otp-token.entity';
import { User } from '../users/entities/user.entity';
import { generateOtp, getOtpExpiry } from '../common/utils/otp.util';

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(OtpToken)
    private otpRepo: Repository<OtpToken>,
  ) {}

  async createForUser(user: User): Promise<{ otp: string; expiresAt: Date }> {
    const otp = generateOtp();
    const expiresAt = getOtpExpiry();

    await this.otpRepo.save(
      this.otpRepo.create({
        user,
        token: otp,
        expiresAt,
      }),
    );

    return { otp, expiresAt };
  }

  async verifyForUser(user: User, token: string): Promise<OtpToken> {
    const otpRecord = await this.otpRepo.findOne({
      where: {
        user: { id: user.id },
        token,
        used: false,
      },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid OTP');
    }

    if (new Date() > otpRecord.expiresAt) {
      throw new BadRequestException(
        'OTP has expired. Please request a new one',
      );
    }

    return otpRecord;
  }

  async markUsed(otp: OtpToken): Promise<void> {
    otp.used = true;
    await this.otpRepo.save(otp);
  }

  async invalidateForUser(user: User): Promise<void> {
    await this.otpRepo.update({ user: { id: user.id } }, { used: true });
  }
}
