import { randomUUID } from "node:crypto"

import bcrypt from "bcryptjs"

const ROUNDS = 10

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

let decoy: Promise<string> | undefined

/**
 * A hash for an account that does not exist, so signing in with an unknown
 * email costs the same as signing in with the wrong password. Derived from the
 * same ROUNDS as a real hash - a hardcoded constant would quietly stop matching
 * the moment the cost factor changed.
 */
export function decoyHash(): Promise<string> {
  decoy ??= hashPassword(randomUUID())
  return decoy
}
