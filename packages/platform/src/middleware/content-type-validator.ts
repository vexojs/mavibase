import type { Request, Response, NextFunction } from "express"

/**
 * Content-Type Validation Middleware
 * 
 * Validates that requests with a body (POST, PUT, PATCH, DELETE) include
 * the correct Content-Type header to prevent content confusion attacks.
 * 
 * Security Issue Addressed:
 * - HIGH: No Content-Type Validation (Content Confusion Attack)
 * - Without validation, attackers could send malformed content types
 *   that might be parsed incorrectly or bypass security filters.
 * 
 * Environment Variables:
 * - CONTENT_TYPE_VALIDATION: Enable/disable validation (default: true)
 * - ALLOWED_CONTENT_TYPES: Comma-separated list of allowed types (default: application/json)
 */

interface ContentTypeValidatorOptions {
  enabled?: boolean
  allowedTypes?: string[]
  skipPaths?: string[]
}

const getContentTypeOptions = (): ContentTypeValidatorOptions => {
  const defaultAllowedTypes = ["application/json"]
  
  return {
    enabled: process.env.CONTENT_TYPE_VALIDATION !== "false",
    allowedTypes: process.env.ALLOWED_CONTENT_TYPES
      ? process.env.ALLOWED_CONTENT_TYPES.split(",").map(t => t.trim().toLowerCase())
      : defaultAllowedTypes,
    skipPaths: ["/health", "/live", "/ready", "/metrics"],
  }
}

/**
 * Methods that typically have a request body and require Content-Type
 */
const METHODS_REQUIRING_BODY = ["POST", "PUT", "PATCH", "DELETE"]

/**
 * Check if the Content-Type header matches allowed types
 * Handles charset and boundary parameters (e.g., "application/json; charset=utf-8")
 */
const isValidContentType = (contentType: string | undefined, allowedTypes: string[]): boolean => {
  if (!contentType) return false
  
  // Extract the base content type (before any parameters like charset)
  const baseType = contentType.split(";")[0].trim().toLowerCase()
  
  return allowedTypes.some(allowed => baseType === allowed)
}

/**
 * Content-Type Validation Middleware
 * Rejects requests with missing or invalid Content-Type on body-carrying methods
 */
export const contentTypeValidator = (req: Request, res: Response, next: NextFunction) => {
  const options = getContentTypeOptions()
  
  // Skip if validation is disabled
  if (!options.enabled) {
    return next()
  }
  
  // Skip for methods that don't typically have a body
  if (!METHODS_REQUIRING_BODY.includes(req.method)) {
    return next()
  }
  
  // Skip for health check and monitoring endpoints
  if (options.skipPaths?.some(path => req.path.includes(path))) {
    return next()
  }
  
  // Allow empty body requests (Content-Length: 0 or no body)
  const contentLength = req.headers["content-length"]
  if (contentLength === "0" || (!req.headers["content-type"] && !contentLength)) {
    return next()
  }
  
  const contentType = req.get("Content-Type")
  
  // Validate Content-Type header
  if (!isValidContentType(contentType, options.allowedTypes || [])) {
    return res.status(415).json({
      error: {
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: `Content-Type must be one of: ${options.allowedTypes?.join(", ")}`,
        received: contentType || "none",
      },
    })
  }
  
  next()
}

/**
 * Strict JSON Content-Type Validator
 * Only allows application/json (no other content types)
 */
export const strictJsonValidator = (req: Request, res: Response, next: NextFunction) => {
  const options = getContentTypeOptions()
  
  // Skip if validation is disabled
  if (!options.enabled) {
    return next()
  }
  
  // Skip for methods that don't typically have a body
  if (!METHODS_REQUIRING_BODY.includes(req.method)) {
    return next()
  }
  
  // Skip for health check endpoints
  if (options.skipPaths?.some(path => req.path.includes(path))) {
    return next()
  }
  
  // Allow empty body requests
  const contentLength = req.headers["content-length"]
  if (contentLength === "0") {
    return next()
  }
  
  const contentType = req.get("Content-Type")
  
  // Must have Content-Type header for body-carrying requests
  if (!contentType) {
    return res.status(400).json({
      error: {
        code: "MISSING_CONTENT_TYPE",
        message: "Content-Type header is required for this request",
      },
    })
  }
  
  // Must be application/json
  const baseType = contentType.split(";")[0].trim().toLowerCase()
  if (baseType !== "application/json") {
    return res.status(415).json({
      error: {
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Content-Type must be application/json",
        received: contentType,
      },
    })
  }
  
  next()
}

export default contentTypeValidator
