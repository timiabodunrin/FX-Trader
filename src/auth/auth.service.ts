import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { OtpService } from './otp.service';
import { WalletService } from '../wallet/wallet.service';
import { User } from '../users/entities/user.entity';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    private otpService: OtpService,
    private dataSource: DataSource,
    private walletService: WalletService,
    private analyticsService: AnalyticsService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new BadRequestException('Email already registered');

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);

      const createdUser = await userRepo.save(
        userRepo.create({
          email: dto.email,
          fullName: dto.fullName,
          passwordHash: hashed,
        }),
      );

      await this.walletService.createForUser(createdUser, manager);

      return createdUser;
    });

    const { otp } = await this.otpService.createForUser(user);
    await this.mailService.sendOtp(user.email, otp, dto.fullName);

    void this.analyticsService.log(user.id, 'register', {
      email: user.email,
    });

    return { message: 'Registration successful. Check your email for OTP.' };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new BadRequestException('User not found');

    if (user.isVerified)
      throw new BadRequestException('Account already verified');

    const otpRecord = await this.otpService.verifyForUser(user, dto.otp);
    await this.otpService.markUsed(otpRecord);
    await this.usersService.markVerified(user.id);

    const token = this.jwtService.sign({ sub: user.id, email: user.email });

    void this.analyticsService.log(user.id, 'verify_email');

    return {
      message: 'Email verified successfully',
      access_token: token,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.validateUserCredentials(dto.email, dto.password);

    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your email first');
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email });

    void this.analyticsService.log(user.id, 'login');

    return { access_token: token };
  }

  async resendOtp(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new BadRequestException('User not found');
    if (user.isVerified)
      throw new BadRequestException('Account already verified');

    await this.otpService.invalidateForUser(user);

    const { otp } = await this.otpService.createForUser(user);
    await this.mailService.sendOtp(user.email, otp, user.fullName);

    return { message: 'OTP resent successfully' };
  }

  private async validateUserCredentials(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    const invalid =
      !user || !(await bcrypt.compare(password, user.passwordHash));

    if (invalid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }
}
