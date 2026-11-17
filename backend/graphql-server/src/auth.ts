import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Constant-time comparison so the token can't be guessed byte-by-byte via response timing. */
export function tokensMatch(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}

/**
 * Defence in depth: the server is already unreachable from the internet (internal ALB,
 * private subnets, security group only admits the Lambda SG). On top of that every request
 * must carry the shared token that Lambda reads from Secrets Manager.
 */
export function requireInternalToken(expected: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!tokensMatch(req.header('x-internal-token'), expected)) {
      res.status(401).json({ errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHENTICATED' } }] });
      return;
    }
    next();
  };
}
