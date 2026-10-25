import type { NextFunction, Request, Response } from 'express';

export async function requireAuth(_req: Request, _res: Response, next: NextFunction): Promise<void> {
  next();
}

export async function optionalAuth(_req: Request, _res: Response, next: NextFunction): Promise<void> {
  next();
}

export function requirePermission(_permission: string) {
  return async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
    next();
  };
}
