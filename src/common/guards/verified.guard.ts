import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

interface AuthenticatedUser {
  id: string;
  email: string;
  isVerified: boolean;
}

@Injectable()
export class VerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const request = context.switchToHttp().getRequest();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const user = request.user as AuthenticatedUser;

    if (!user || !user.isVerified) {
      throw new ForbiddenException(
        'Please verify your email before accessing this resource',
      );
    }

    return true;
  }
}
