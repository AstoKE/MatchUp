/**
 * Single definition of the XP → level curve (RATING_SYSTEM §5.3).
 * xpRequired(L) = 50·L·(L−1): L1=0, L2=100, L3=300, L4=600, L5=1000, L10=4500.
 * Level is derived at read time from xp_total; it is never stored as truth.
 */
export function xpRequiredForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError('level must be an integer ≥ 1');
  return 50 * level * (level - 1);
}

export function levelFromXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) throw new RangeError('xp must be a finite number ≥ 0');
  // Closed form, then correct for floating-point error at exact thresholds.
  let level = Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2);
  while (xpRequiredForLevel(level + 1) <= xp) level += 1;
  while (level > 1 && xpRequiredForLevel(level) > xp) level -= 1;
  return level;
}
