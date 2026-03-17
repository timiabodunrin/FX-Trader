import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter;
  private fromAddress: string;

  constructor(private configService: ConfigService) {
    this.fromAddress =
      this.configService.get<string>('MAIL_FROM') ??
      'FX Trading <no-reply@fxapp.com>';

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port: this.configService.get<number>('MAIL_PORT'),
      secure: false,
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
    });
  }

  private isConfigured(): boolean {
    return (
      !!this.configService.get('MAIL_USER') &&
      !!this.configService.get('MAIL_PASS')
    );
  }

  private async sendEmail(params: SendEmailParams): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn('Mail is not configured - skipping email send');
      throw new Error('Mail service is not configured');
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });

      this.logger.log(`Email sent to ${params.to} — "${params.subject}"`);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to send email to ${params.to}: ${error.message}`,
        );
        throw error;
      }
      throw new Error('Unknown error sending email');
    }
  }

  async sendOtp(email: string, otp: string, fullName: string): Promise<void> {
    return this.sendEmail({
      to: email,
      subject: 'Verify Your FX Trading Account',
      html: this.buildOtpEmailHtml(otp, fullName),
    });
  }

  private buildOtpEmailHtml(otp: string, fullName: string): string {
    return `
      <div style="
        font-family: Arial, sans-serif;
        max-width: 500px;
        margin: auto;
        padding: 32px;
        border: 1px solid #e4e4e4;
        border-radius: 12px;
      ">
        <h2 style="color: #1a1a1a; margin-bottom: 8px;">
          Hi ${fullName} 👋
        </h2>

        <p style="color: #555; line-height: 1.6;">
          Thanks for signing up for FX Trading.
          Use the code below to verify your account.
          This code expires in <strong>10 minutes</strong>.
        </p>

        <div style="
          font-size: 38px;
          font-weight: bold;
          letter-spacing: 12px;
          padding: 24px;
          background: #f9f9f9;
          text-align: center;
          border-radius: 8px;
          color: #1a1a1a;
          margin: 28px 0;
          border: 1px dashed #ddd;
        ">
          ${otp}
        </div>

        <p style="color: #555; line-height: 1.6;">
          If you didn't create an account,
          you can safely ignore this email.
        </p>

        <hr style="border: none; border-top: 1px solid #e4e4e4; margin: 24px 0;" />

        <p style="color: #999; font-size: 12px; text-align: center;">
          FX Trading App &mdash; Do not reply to this email
        </p>
      </div>
    `;
  }
}
