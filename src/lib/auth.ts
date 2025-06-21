/**
 * DamageScan Authentication Module
 * 
 * Cloudflare Access JWT token validation and user context management.
 * Provides middleware and utilities for securing API endpoints.
 * 
 * @fileoverview Cloudflare Access authentication with comprehensive JWT validation
 * @version 1.0.0
 */

import type {
  AuthContext,
  CloudflareEnv,
  ApiResponse
} from './types';

// ===================================================================
// AUTHENTICATION ERROR HANDLING
// ===================================================================

/**
 * Custom authentication error class for structured error handling.
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 401,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Authentication result wrapper for consistent error handling.
 */
export interface AuthResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    statusCode: number;
  };
}

// ===================================================================
// JWT TOKEN VALIDATION TYPES
// ===================================================================

/**
 * Cloudflare Access JWT payload structure.
 * Contains user information and access claims.
 */
interface CloudflareAccessJWT {
  // Standard JWT claims
  iss: string;           // Issuer (Cloudflare Access)
  sub: string;           // Subject (user identifier)
  aud: string | string[]; // Audience (application identifier)
  exp: number;           // Expiration time
  iat: number;           // Issued at time
  nbf?: number;          // Not before time
  
  // Cloudflare Access specific claims
  email?: string;        // User email address
  identity_nonce?: string; // Identity verification nonce
  custom?: Record<string, any>; // Custom claims
  groups?: string[];     // User groups
  country?: string;      // User country
  
  // Application specific claims
  azp?: string;          // Authorized party
  jti?: string;          // JWT ID
}

/**
 * JWT header structure for validation.
 */
interface JWTHeader {
  alg: string;           // Algorithm (RS256)
  kid?: string;          // Key ID for validation
  typ: string;           // Token type (JWT)
}

/**
 * Cloudflare Access public key for JWT verification.
 */
interface CloudflarePublicKey {
  kty: string;           // Key type
  kid: string;           // Key ID
  use: string;           // Key usage
  n: string;             // RSA modulus
  e: string;             // RSA exponent
  alg: string;           // Algorithm
}

/**
 * JWKS (JSON Web Key Set) response from Cloudflare.
 */
interface JWKSResponse {
  keys: CloudflarePublicKey[];
}

// ===================================================================
// AUTHENTICATION SERVICE CLASS
// ===================================================================

/**
 * Cloudflare Access authentication service.
 * Handles JWT validation, user context extraction, and middleware.
 */
export class AuthService {
  private authDomain: string;
  private audience: string;
  private jwksCache: Map<string, CloudflarePublicKey> = new Map();
  private jwksCacheExpiry: number = 0;
  private readonly JWKS_CACHE_TTL = 3600000; // 1 hour in milliseconds

  /**
   * Initialize authentication service.
   * 
   * @param authDomain - Cloudflare Access domain (e.g., 'your-app.cloudflareaccess.com')
   * @param audience - Application audience identifier
   */
  constructor(authDomain: string, audience: string) {
    if (!authDomain?.trim()) {
      throw new AuthError(
        'Authentication domain is required',
        'INVALID_AUTH_DOMAIN',
        500
      );
    }

    if (!audience?.trim()) {
      throw new AuthError(
        'Audience identifier is required',
        'INVALID_AUDIENCE',
        500
      );
    }

    this.authDomain = authDomain.replace(/\/$/, ''); // Remove trailing slash
    this.audience = audience;
  }

  /**
   * Validate JWT token and extract user context.
   * 
   * @param token - JWT token from Authorization header
   * @returns Promise resolving to authentication result
   */
  async validateToken(token: string): Promise<AuthResult<AuthContext>> {
    if (!token?.trim()) {
      return {
        success: false,
        error: {
          code: 'TOKEN_MISSING',
          message: 'Authentication token is required',
          statusCode: 401
        }
      };
    }

    try {
      // Parse and validate JWT structure
      const { header, payload } = await this.parseJWT(token);
      
      // Validate JWT header
      const headerValidation = this.validateJWTHeader(header);
      if (!headerValidation.success) {
        return headerValidation;
      }

      // Validate JWT payload
      const payloadValidation = this.validateJWTPayload(payload);
      if (!payloadValidation.success) {
        return payloadValidation;
      }

      // Verify JWT signature
      const signatureValidation = await this.verifyJWTSignature(token, header, payload);
      if (!signatureValidation.success) {
        return signatureValidation;
      }

      // Extract user context
      const userContext = this.extractUserContext(payload);
      
      return {
        success: true,
        data: userContext
      };
    } catch (error) {
      console.error('JWT validation failed:', error);
      return {
        success: false,
        error: {
          code: 'TOKEN_VALIDATION_FAILED',
          message: `Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          statusCode: 401
        }
      };
    }
  }

  /**
   * Create Hono middleware for route protection.
   * 
   * @returns Hono middleware function
   */
  createMiddleware() {
    return async (c: any, next: any) => {
      try {
        // Extract token from Authorization header
        const authHeader = c.req.header('Authorization');
        if (!authHeader) {
          return c.json({
            success: false,
            error: 'Authorization header is required',
            timestamp: new Date().toISOString()
          } as ApiResponse, 401);
        }

        // Parse Bearer token
        const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
        if (!tokenMatch) {
          return c.json({
            success: false,
            error: 'Invalid Authorization header format. Expected: Bearer <token>',
            timestamp: new Date().toISOString()
          } as ApiResponse, 401);
        }

        const token = tokenMatch[1];

        // Validate token
        const authResult = await this.validateToken(token);
        if (!authResult.success) {
          return c.json({
            success: false,
            error: authResult.error?.message || 'Authentication failed',
            timestamp: new Date().toISOString()
          } as ApiResponse, authResult.error?.statusCode || 401);
        }

        // Add user context to request
        c.set('user', authResult.data);
        c.set('userId', authResult.data!.user_id);

        // Continue to next middleware/handler
        await next();
      } catch (error) {
        console.error('Authentication middleware error:', error);
        return c.json({
          success: false,
          error: 'Authentication system error',
          timestamp: new Date().toISOString()
        } as ApiResponse, 500);
      }
    };
  }

  /**
   * Extract user context from request (for use in protected routes).
   * 
   * @param c - Hono context object
   * @returns User context or null if not authenticated
   */
  getUserContext(c: any): AuthContext | null {
    return c.get('user') || null;
  }

  /**
   * Extract user ID from request (convenience method).
   * 
   * @param c - Hono context object
   * @returns User ID or null if not authenticated
   */
  getUserId(c: any): string | null {
    return c.get('userId') || null;
  }

  // ===================================================================
  // PRIVATE JWT VALIDATION METHODS
  // ===================================================================

  /**
   * Parse JWT token into header and payload.
   * 
   * @param token - Raw JWT token
   * @returns Parsed header and payload
   */
  private async parseJWT(token: string): Promise<{ header: JWTHeader; payload: CloudflareAccessJWT }> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AuthError('Invalid JWT format', 'INVALID_JWT_FORMAT', 401);
    }

    try {
      // Decode header
      const headerDecoded = atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'));
      const header = JSON.parse(headerDecoded) as JWTHeader;

      // Decode payload
      const payloadDecoded = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadDecoded) as CloudflareAccessJWT;

      return { header, payload };
    } catch (error) {
      throw new AuthError('Failed to parse JWT token', 'JWT_PARSE_ERROR', 401);
    }
  }

  /**
   * Validate JWT header structure and algorithm.
   * 
   * @param header - JWT header
   * @returns Validation result
   */
  private validateJWTHeader(header: JWTHeader): AuthResult<boolean> {
    // Validate token type
    if (header.typ !== 'JWT') {
      return {
        success: false,
        error: {
          code: 'INVALID_TOKEN_TYPE',
          message: `Invalid token type: ${header.typ}. Expected: JWT`,
          statusCode: 401
        }
      };
    }

    // Validate algorithm
    if (header.alg !== 'RS256') {
      return {
        success: false,
        error: {
          code: 'INVALID_ALGORITHM',
          message: `Unsupported algorithm: ${header.alg}. Expected: RS256`,
          statusCode: 401
        }
      };
    }

    return {
      success: true,
      data: true
    };
  }

  /**
   * Validate JWT payload claims.
   * 
   * @param payload - JWT payload
   * @returns Validation result
   */
  private validateJWTPayload(payload: CloudflareAccessJWT): AuthResult<boolean> {
    const now = Math.floor(Date.now() / 1000);

    // Validate issuer
    const expectedIssuer = `https://${this.authDomain}`;
    if (payload.iss !== expectedIssuer) {
      return {
        success: false,
        error: {
          code: 'INVALID_ISSUER',
          message: `Invalid issuer: ${payload.iss}. Expected: ${expectedIssuer}`,
          statusCode: 401
        }
      };
    }

    // Validate audience
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(this.audience)) {
      return {
        success: false,
        error: {
          code: 'INVALID_AUDIENCE',
          message: `Invalid audience. Token not issued for this application`,
          statusCode: 401
        }
      };
    }

    // Validate expiration
    if (payload.exp <= now) {
      return {
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired',
          statusCode: 401
        }
      };
    }

    // Validate not before (if present)
    if (payload.nbf && payload.nbf > now) {
      return {
        success: false,
        error: {
          code: 'TOKEN_NOT_ACTIVE',
          message: 'Token is not yet active',
          statusCode: 401
        }
      };
    }

    // Validate issued at time (reasonable bounds)
    const maxAge = 24 * 60 * 60; // 24 hours
    if (payload.iat && (now - payload.iat) > maxAge) {
      return {
        success: false,
        error: {
          code: 'TOKEN_TOO_OLD',
          message: 'Token is too old',
          statusCode: 401
        }
      };
    }

    // Validate subject (user identifier)
    if (!payload.sub?.trim()) {
      return {
        success: false,
        error: {
          code: 'MISSING_SUBJECT',
          message: 'Token missing user identifier',
          statusCode: 401
        }
      };
    }

    return {
      success: true,
      data: true
    };
  }

  /**
   * Verify JWT signature using Cloudflare public keys.
   * 
   * @param token - Raw JWT token
   * @param header - JWT header
   * @param payload - JWT payload
   * @returns Verification result
   */
  private async verifyJWTSignature(
    token: string, 
    header: JWTHeader, 
    payload: CloudflareAccessJWT
  ): Promise<AuthResult<boolean>> {
    try {
      // Get public key for verification
      const publicKey = await this.getPublicKey(header.kid);
      if (!publicKey) {
        return {
          success: false,
          error: {
            code: 'PUBLIC_KEY_NOT_FOUND',
            message: 'Unable to find public key for token verification',
            statusCode: 401
          }
        };
      }

      // Import public key for verification
      const cryptoKey = await this.importPublicKey(publicKey);

      // Verify signature
      const parts = token.split('.');
      const signatureData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
      const signature = this.base64urlDecode(parts[2]);

      const isValid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        signature,
        signatureData
      );

      if (!isValid) {
        return {
          success: false,
          error: {
            code: 'INVALID_SIGNATURE',
            message: 'Token signature verification failed',
            statusCode: 401
          }
        };
      }

      return {
        success: true,
        data: true
      };
    } catch (error) {
      console.error('Signature verification failed:', error);
      return {
        success: false,
        error: {
          code: 'SIGNATURE_VERIFICATION_ERROR',
          message: `Signature verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          statusCode: 401
        }
      };
    }
  }

  /**
   * Get public key for JWT verification.
   * Uses caching to improve performance.
   * 
   * @param keyId - Key ID from JWT header
   * @returns Public key or null if not found
   */
  private async getPublicKey(keyId?: string): Promise<CloudflarePublicKey | null> {
    // Check cache first
    if (keyId && this.jwksCache.has(keyId) && Date.now() < this.jwksCacheExpiry) {
      return this.jwksCache.get(keyId)!;
    }

    try {
      // Fetch JWKS from Cloudflare
      const jwksUrl = `https://${this.authDomain}/cdn-cgi/access/certs`;
      const response = await fetch(jwksUrl);

      if (!response.ok) {
        console.error(`Failed to fetch JWKS: ${response.status} ${response.statusText}`);
        return null;
      }

      const jwks = await response.json() as JWKSResponse;

      // Update cache
      this.jwksCache.clear();
      this.jwksCacheExpiry = Date.now() + this.JWKS_CACHE_TTL;

      for (const key of jwks.keys) {
        this.jwksCache.set(key.kid, key);
      }

      // Return requested key
      return keyId ? this.jwksCache.get(keyId) || null : jwks.keys[0] || null;
    } catch (error) {
      console.error('Failed to fetch JWKS:', error);
      return null;
    }
  }

  /**
   * Import RSA public key for Web Crypto API.
   * 
   * @param publicKey - Cloudflare public key
   * @returns Imported crypto key
   */
  private async importPublicKey(publicKey: CloudflarePublicKey): Promise<CryptoKey> {
    // Convert base64url to ArrayBuffer
    const nBuffer = this.base64urlDecode(publicKey.n);
    const eBuffer = this.base64urlDecode(publicKey.e);

    // Import key using Web Crypto API
    return await crypto.subtle.importKey(
      'jwk',
      {
        kty: publicKey.kty,
        n: publicKey.n,
        e: publicKey.e,
        alg: publicKey.alg,
        use: 'sig'
      },
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256'
      },
      false,
      ['verify']
    );
  }

  /**
   * Decode base64url string to ArrayBuffer.
   * 
   * @param str - Base64url encoded string
   * @returns Decoded ArrayBuffer
   */
  private base64urlDecode(str: string): ArrayBuffer {
    // Add padding if needed
    const padding = 4 - (str.length % 4);
    const padded = str + '='.repeat(padding % 4);
    
    // Convert base64url to base64
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    
    // Decode to binary string then to ArrayBuffer
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes.buffer;
  }

  /**
   * Extract user context from validated JWT payload.
   * 
   * @param payload - Validated JWT payload
   * @returns User context for application use
   */
  private extractUserContext(payload: CloudflareAccessJWT): AuthContext {
    return {
      user_id: payload.sub,
      email: payload.email,
      groups: payload.groups || []
    };
  }
}

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

/**
 * Create authentication service from Cloudflare environment.
 * 
 * @param env - Cloudflare Workers environment
 * @returns Configured authentication service
 */
export function createAuthService(env: CloudflareEnv): AuthService {
  if (!env.AUTH_DOMAIN) {
    throw new AuthError(
      'AUTH_DOMAIN environment variable is required',
      'MISSING_AUTH_DOMAIN',
      500
    );
  }

  if (!env.AUTH_AUDIENCE) {
    throw new AuthError(
      'AUTH_AUDIENCE environment variable is required',
      'MISSING_AUTH_AUDIENCE',
      500
    );
  }

  return new AuthService(env.AUTH_DOMAIN, env.AUTH_AUDIENCE);
}

/**
 * Extract bearer token from Authorization header.
 * 
 * @param authHeader - Authorization header value
 * @returns Bearer token or null if invalid format
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Create authentication error response.
 * 
 * @param code - Error code
 * @param message - Error message
 * @param statusCode - HTTP status code
 * @returns Formatted error response
 */
export function createAuthErrorResponse(
  code: string, 
  message: string, 
  statusCode: number = 401
): ApiResponse {
  return {
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
    data: {
      code,
      statusCode
    }
  };
}

/**
 * Validate user ID format.
 * 
 * @param userId - User identifier to validate
 * @returns True if valid format
 */
export function isValidUserId(userId: string | undefined): boolean {
  if (!userId || typeof userId !== 'string') return false;
  
  // Basic validation: non-empty string with reasonable length
  return userId.trim().length > 0 && userId.length <= 255;
}

// ===================================================================
// TESTING AND DEVELOPMENT UTILITIES
// ===================================================================

/**
 * Create mock authentication context for testing.
 * Only use in development/testing environments.
 * 
 * @param userId - Mock user ID
 * @param email - Mock email (optional)
 * @returns Mock authentication context
 */
export function createMockAuthContext(
  userId: string = 'test-user-123',
  email?: string
): AuthContext {
  return {
    user_id: userId,
    email: email || `${userId}@example.com`,
    groups: ['users']
  };
}

/**
 * Create mock authentication middleware for testing.
 * Only use in development environments.
 * 
 * @param mockContext - Mock authentication context
 * @returns Mock middleware function
 */
export function createMockAuthMiddleware(mockContext?: AuthContext) {
  const context = mockContext || createMockAuthContext();
  
  return async (c: any, next: any) => {
    // Add mock context to request
    c.set('user', context);
    c.set('userId', context.user_id);
    
    await next();
  };
}

/**
 * Export types and classes for use in other modules.
 */
export type { AuthResult, AuthError };
export { AuthService };
