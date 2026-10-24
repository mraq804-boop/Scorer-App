export function formatOvers(legalBalls: number, ballsPerOver: number): string {
  const overs = Math.floor(legalBalls / ballsPerOver);
  const balls = legalBalls % ballsPerOver;
  return balls === 0 ? String(overs) : `${overs}.${balls}`;
}
