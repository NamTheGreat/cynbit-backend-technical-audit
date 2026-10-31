import Redis from "ioredis";
import { env } from "@/lib/config/env";

declare global {
  // eslint-disable-next-line no-var
  var globalRedis: Redis | undefined;
}

// In-memory fallback for test environments without a running Redis server
class InMemoryCache {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, mode?: string, durationSeconds?: number): Promise<"OK"> {
    let expiresAt: number | undefined;
    if (mode === "EX" && durationSeconds) {
      expiresAt = Date.now() + durationSeconds * 1000;
    }
    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async incr(key: string): Promise<number> {
    const item = this.store.get(key);
    let val = 0;
    if (item && (!item.expiresAt || Date.now() <= item.expiresAt)) {
      val = parseInt(item.value, 10) || 0;
    }
    val += 1;
    this.store.set(key, { value: val.toString(), expiresAt: item?.expiresAt });
    return val;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const item = this.store.get(key);
    if (!item) return 0;
    item.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

let redisClient: Redis | InMemoryCache;

if (process.env.NODE_ENV === "test") {
  redisClient = new InMemoryCache();
} else {
  try {
    redisClient =
      globalThis.globalRedis ??
      new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
        lazyConnect: true,
      });

    if (process.env.NODE_ENV !== "production") {
      globalThis.globalRedis = redisClient as Redis;
    }
  } catch {
    redisClient = new InMemoryCache();
  }
}

export const redis = redisClient;
