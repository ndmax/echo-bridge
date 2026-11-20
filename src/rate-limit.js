// Token bucket for inbound actions plus a cooldown that starts when Amazon throttles us.
// One bucket for the whole bridge: every action costs one Amazon request regardless of caller.
export class RateLimiter {
  constructor({ perMinute, burst, now = Date.now }) {
    this.ratePerMs = perMinute / 60000;
    this.burst = burst;
    this.tokens = burst;
    this.now = now;
    this.updatedAt = now();
    this.cooldownUntil = 0;
  }

  // Returns 0 if the action may proceed, otherwise seconds to wait.
  take() {
    const now = this.now();
    if (now < this.cooldownUntil) return Math.ceil((this.cooldownUntil - now) / 1000);

    this.tokens = Math.min(this.burst, this.tokens + (now - this.updatedAt) * this.ratePerMs);
    this.updatedAt = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    return Math.ceil((1 - this.tokens) / this.ratePerMs / 1000);
  }

  startCooldown(seconds) {
    this.cooldownUntil = Math.max(this.cooldownUntil, this.now() + seconds * 1000);
  }
}
