import {
  Catch,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { ERROR_STATUS, type ErrorCode, type ErrorEnvelope } from '@kitchen/contracts';

/**
 * The only exception type the API throws deliberately. Carries an i18n message
 * key — the server never sends user-facing prose. See spec §8.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly messageKey: string;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, messageKey?: string, details?: Record<string, unknown>) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.messageKey = messageKey ?? `errors.${code}`;
    this.details = details;
  }

  static notFound(messageKey?: string, details?: Record<string, unknown>): AppError {
    return new AppError('NOT_FOUND', messageKey, details);
  }

  static forbidden(messageKey?: string): AppError {
    return new AppError('FORBIDDEN', messageKey);
  }

  static unauthenticated(messageKey?: string): AppError {
    return new AppError('UNAUTHENTICATED', messageKey);
  }

  static conflict(messageKey?: string, details?: Record<string, unknown>): AppError {
    return new AppError('CONFLICT', messageKey, details);
  }

  static validation(details?: Record<string, unknown>): AppError {
    return new AppError('VALIDATION_FAILED', 'errors.VALIDATION_FAILED', details);
  }
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, envelope } = this.toEnvelope(exception);

    if (status >= 500) {
      this.logger.error(
        `${envelope.code}: ${exception instanceof Error ? exception.message : 'unknown'}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(envelope);
  }

  private toEnvelope(exception: unknown): { status: number; envelope: ErrorEnvelope } {
    if (exception instanceof AppError) {
      return {
        status: ERROR_STATUS[exception.code],
        envelope: {
          code: exception.code,
          messageKey: exception.messageKey,
          ...(exception.details ? { details: exception.details } : {}),
        },
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: ERROR_STATUS.VALIDATION_FAILED,
        envelope: {
          code: 'VALIDATION_FAILED',
          messageKey: 'errors.VALIDATION_FAILED',
          details: {
            issues: exception.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code: ErrorCode =
        status === 401
          ? 'UNAUTHENTICATED'
          : status === 403
            ? 'FORBIDDEN'
            : status === 404
              ? 'NOT_FOUND'
              : status === 409
                ? 'CONFLICT'
                : status === 429
                  ? 'RATE_LIMITED'
                  : status < 500
                    ? 'VALIDATION_FAILED'
                    : 'INTERNAL_ERROR';
      return { status, envelope: { code, messageKey: `errors.${code}` } };
    }

    return {
      status: ERROR_STATUS.INTERNAL_ERROR,
      envelope: { code: 'INTERNAL_ERROR', messageKey: 'errors.INTERNAL_ERROR' },
    };
  }
}
