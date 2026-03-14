import rateLimit from "express-rate-limit"
import RedisStore from "rate-limit-redis"
import type { Request, Response } from "express"
import { logger } from "../utils/logger"
import { getRedisClient } from "@mavibase/database/config/redis"

const windowMs = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000") // 15 minutes default
const isProduction = process.env.NODE_ENV === "production"
// In development, use very high limit so headers are sent but you won't hit the limit
const maxRequests = isProduction 
  ? Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "1000")
  : 1000000

// Initialize Redis client for distributed rate limiting
let redisClient: ReturnType<typeof getRedisClient> | null = null
let redisStore: RedisStore | null = null
let authRedisStore: RedisStore | null = null

try {
  redisClient = getRedisClient()
  
  // Create Redis store for general rate limiting
  redisStore = new RedisStore({
    // @ts-expect-error - ioredis is compatible with rate-limit-redis
    sendCommand: (...args: string[]) => redisClient!.call(...args),
    prefix: "rl:platform:",
  })
  
  // Create separate Redis store for auth rate limiting
  authRedisStore = new RedisStore({
    // @ts-expect-error - ioredis is compatible with rate-limit-redis
    sendCommand: (...args: string[]) => redisClient!.call(...args),
    prefix: "rl:auth:",
  })
  
  logger.info("Redis store initialized for distributed rate limiting (platform)")
} catch (error: any) {
  logger.warn("Redis not available for rate limiting - using in-memory store", { error: error.message })
  
  // SECURITY WARNING: In production, Redis SHOULD be used for distributed rate limiting
  // Without it, attackers can bypass rate limits by distributing requests across instances
  // However, we allow the server to start with a warning rather than crashing
  if (isProduction) {
    logger.error(
      "SECURITY WARNING: Redis is not available for rate limiting in production. " +
      "Using in-memory store which can be bypassed in multi-instance deployments. " +
      "Set REDIS_URL environment variable for proper distributed rate limiting."
    )
  }
}

/**
 * General rate limiter with distributed Redis store
 * 
 * SECURITY FEATURES:
 * - Uses Redis store for distributed rate limiting across multiple instances
 * - REQUIRES Redis in production to prevent bypass attacks
 */
export const rateLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  message: {
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests from this IP, please try again later",
    },
  },
  standardHeaders: true,  // Sends RateLimit-* headers (modern standard)
  legacyHeaders: true,   // Also sends X-RateLimit-* headers (for compatibility)
  // Use Redis store for distributed rate limiting (required in production)
  store: redisStore ?? undefined,
  // Don't skip - we need headers in all environments. Dev uses 1M limit instead.
  handler: (req: Request, res: Response) => {
    logger.warn("Rate limit exceeded", { 
      ip: req.ip, 
      path: req.path,
      store: redisStore ? "redis" : "memory"
    })
    res.status(429).json({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests, please try again later",
        details: {
          retryAfter: `${Math.ceil(windowMs / 60000)} minutes`,
        },
      },
    })
  },
})

// Stricter rate limit for sensitive endpoints (auth)
const maxLoginAttempts = Number.parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5")
const lockoutDuration = Number.parseInt(process.env.ACCOUNT_LOCKOUT_DURATION_MINUTES || "15")

/**
 * Authentication rate limiter with distributed Redis store
 * 
 * SECURITY FEATURES:
 * - Stricter limits for auth endpoints (default: 5 attempts per 15 min)
 * - Only counts failed attempts (skipSuccessfulRequests)
 * - Uses Redis store for distributed limiting across instances
 * - REQUIRES Redis in production to prevent credential stuffing attacks
 */
export const authRateLimiter = rateLimit({
  windowMs: lockoutDuration * 60 * 1000,
  max: maxLoginAttempts,
  skipSuccessfulRequests: true,
  // Don't skip - we need headers in all environments. Dev uses 1M limit instead.
  // Use Redis store for distributed rate limiting (required in production)
  store: authRedisStore ?? undefined,
  message: {
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message: "Too many authentication attempts, please try again later",
    },
  },
  handler: (req: Request, res: Response) => {
    logger.warn("Auth rate limit exceeded", { 
      ip: req.ip, 
      path: req.path,
      store: authRedisStore ? "redis" : "memory"
    })
    res.status(429).json({
      error: {
        code: "AUTH_RATE_LIMIT_EXCEEDED",
        message: "Too many authentication attempts, please try again later",
        details: {
          retryAfter: `${lockoutDuration} minutes`,
        },
      },
    })
  },
})

/**
 * Check if rate limiting is using distributed Redis store
 * Useful for health checks and monitoring
 */
export const isDistributedRateLimiting = (): boolean => {
  return redisStore !== null && authRedisStore !== null
}
