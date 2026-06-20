import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { Injectable } from '@nestjs/common';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const HASH_PREFIX = 'scrypt';

@Injectable()
export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('base64url');
    const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
    return `${HASH_PREFIX}$${salt}$${derivedKey.toString('base64url')}`;
  }

  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [prefix, salt, hash] = storedHash.split('$');
    if (prefix !== HASH_PREFIX || !salt || !hash) {
      return false;
    }

    const storedKey = Buffer.from(hash, 'base64url');
    const derivedKey = (await scrypt(password, salt, storedKey.length)) as Buffer;
    return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
  }
}
