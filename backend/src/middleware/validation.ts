// backend/src/middleware/validation.ts
// Request validation middleware using Zod schemas

import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

/**
 * DNS Record Type enum
 */
const RecordTypeSchema = z.enum([
  'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS', 'PTR', 'CAA', 'SSHFP', 'SOA'
]);

/**
 * DNS Record validation schema
 */
export const DNSRecordSchema = z.object({
  name: z.string().min(1, 'Record name is required').max(255, 'Record name too long'),
  type: RecordTypeSchema,
  value: z.union([
    z.string().min(1, 'Record value is required'),
    z.array(z.string()),
    z.object({
      // SOA record structure
      mname: z.string().optional(),
      rname: z.string().optional(),
      serial: z.number().optional(),
      refresh: z.number().optional(),
      retry: z.number().optional(),
      expire: z.number().optional(),
      minimum: z.number().optional()
    }).optional(),
    z.object({
      // MX record structure
      priority: z.number(),
      target: z.string()
    }).optional(),
    z.object({
      // SRV record structure
      priority: z.number(),
      weight: z.number(),
      port: z.number(),
      target: z.string()
    }).optional()
  ]),
  ttl: z.number().int().min(0).max(2147483647, 'TTL must be a valid 32-bit integer'),
  class: z.string().optional().default('IN')
});

/**
 * Zone operation request schemas
 */
export const AddRecordRequestSchema = z.object({
  record: DNSRecordSchema
});

export const DeleteRecordRequestSchema = z.object({
  record: DNSRecordSchema
});

export const UpdateRecordRequestSchema = z.object({
  oldRecord: DNSRecordSchema,
  newRecord: DNSRecordSchema
});

/**
 * TSIG Key schemas
 */
export const TSIGKeyCreateSchema = z.object({
  name: z.string().min(1, 'Key name is required').max(100),
  server: z.string().min(1, 'Server is required'),
  keyName: z.string().min(1, 'Key name is required'),
  keyValue: z.string().min(1, 'Key value is required'),
  algorithm: z.enum(['hmac-md5', 'hmac-sha1', 'hmac-sha256', 'hmac-sha512']),
  zones: z.array(z.string()).optional().default([])
});

export const TSIGKeyUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  server: z.string().min(1).optional(),
  keyName: z.string().min(1).optional(),
  keyValue: z.string().min(1).optional(),
  algorithm: z.enum(['hmac-md5', 'hmac-sha1', 'hmac-sha256', 'hmac-sha512']).optional(),
  zones: z.array(z.string()).optional()
});

/**
 * Authentication schemas
 */
export const LoginRequestSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50),
  password: z.string().min(1, 'Password is required')
});

export const UserCreateSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  email: z.string().email('Invalid email format').optional(),
  role: z.enum(['admin', 'editor', 'viewer']),
  allowedKeyIds: z.array(z.string()).optional().default([])
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
});

/**
 * Webhook schemas
 */
export const WebhookConfigSchema = z.object({
  provider: z.enum(['slack', 'discord', 'teams', 'mattermost', 'generic']),
  url: z.string().url('Invalid webhook URL'),
  enabled: z.boolean().optional().default(true)
});

export const WebhookPayloadSchema = z.object({
  zone: z.string(),
  action: z.enum(['add', 'delete', 'update']),
  record: z.any(), // Can be complex, validated elsewhere
  username: z.string().optional(),
  timestamp: z.string().optional()
});

/**
 * Generic validation middleware factory
 * Creates a middleware that validates request body against a Zod schema
 */
export function validateRequest<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const validated = schema.parse(req.body);

      // Replace request body with validated & sanitized data
      req.body = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod errors into a user-friendly structure
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: { errors }
        });
      }

      // Unknown error
      console.error('Validation error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal validation error',
        code: 'SERVER_ERROR'
      });
    }
  };
}

/**
 * Validate request params (e.g., zone names, IDs)
 */
export function validateParams<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          success: false,
          error: 'Invalid request parameters',
          code: 'VALIDATION_ERROR',
          details: { errors }
        });
      }

      console.error('Parameter validation error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal validation error',
        code: 'SERVER_ERROR'
      });
    }
  };
}

/**
 * Validate query parameters
 */
export function validateQuery<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
          details: { errors }
        });
      }

      console.error('Query validation error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal validation error',
        code: 'SERVER_ERROR'
      });
    }
  };
}

// Export commonly used validators
export const validateDNSRecord = validateRequest(DNSRecordSchema);
export const validateAddRecord = validateRequest(AddRecordRequestSchema);
export const validateDeleteRecord = validateRequest(DeleteRecordRequestSchema);
export const validateUpdateRecord = validateRequest(UpdateRecordRequestSchema);
export const validateTSIGKeyCreate = validateRequest(TSIGKeyCreateSchema);
export const validateTSIGKeyUpdate = validateRequest(TSIGKeyUpdateSchema);
export const validateLogin = validateRequest(LoginRequestSchema);
export const validateUserCreate = validateRequest(UserCreateSchema);
export const validateChangePassword = validateRequest(ChangePasswordSchema);
export const validateWebhookConfig = validateRequest(WebhookConfigSchema);
