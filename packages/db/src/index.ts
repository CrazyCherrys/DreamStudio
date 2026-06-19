import { PrismaClient } from '@prisma/client';

declare global {
  var dreamstudioPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.dreamstudioPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.dreamstudioPrisma = prisma;
}

export async function checkPostgres(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown PostgreSQL error',
    };
  }
}
