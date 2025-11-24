// backend/src/config/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Snap DNS API',
      version: '2.0.0',
      description: `
Web-based DNS management API for BIND's nsupdate utility.

## Authentication

This API supports two authentication methods:

### 1. Session-Based Authentication
Used by the web interface. Login via \`/api/auth/login\` or \`/api/auth/sso\`.

### 2. API Key Authentication
Use the \`Authorization\` header with Bearer token:
\`\`\`
Authorization: Bearer snap_your_api_key_here
\`\`\`

Create API keys in the web interface under Settings > API Keys.

## Rate Limiting

All endpoints are rate-limited:
- General API: 60 requests/minute
- DNS queries (GET): 30 requests/minute
- DNS modifications (POST/DELETE): 10 requests/minute
- Key management: 10 operations/5 minutes
- API key management: 10 operations/5 minutes

## TSIG Keys

DNS operations require a TSIG key for zone authentication. Include the TSIG key ID in the \`x-dns-key-id\` header.
      `,
      contact: {
        name: 'API Support',
        url: 'https://github.com/yourusername/snap-dns'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3002',
        description: 'Development server'
      },
      {
        url: 'https://snap-dns-testing-api.teamgleim.com',
        description: 'Testing server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: 'API key authentication. Format: `Bearer snap_your_api_key_here`'
        },
        SessionAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'snap-dns.sid',
          description: 'Session-based authentication via login'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              example: 'Error message'
            },
            code: {
              type: 'string',
              example: 'ERROR_CODE'
            },
            details: {
              type: 'object'
            }
          }
        },
        DNSRecord: {
          type: 'object',
          required: ['name', 'type', 'ttl', 'value'],
          properties: {
            name: {
              type: 'string',
              description: 'Fully qualified domain name (FQDN)',
              example: 'www.example.com'
            },
            type: {
              type: 'string',
              enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SRV', 'SOA', 'CAA', 'SSHFP'],
              example: 'A'
            },
            ttl: {
              type: 'integer',
              minimum: 0,
              example: 3600
            },
            value: {
              type: 'string',
              description: 'Record value (format depends on record type)',
              example: '192.0.2.1'
            },
            class: {
              type: 'string',
              example: 'IN'
            }
          }
        },
        ApiKey: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'key_1763962026373_6d709ac5e4a268f2'
            },
            name: {
              type: 'string',
              example: 'My API Key'
            },
            scopes: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['read', 'write', 'admin']
              },
              example: ['read', 'write']
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            lastUsedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              nullable: true
            },
            keyPreview: {
              type: 'string',
              example: 'snap_...'
            }
          }
        },
        TSIGKey: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'key_1763844028272_353283a6'
            },
            name: {
              type: 'string',
              example: 'Production Zone Key'
            },
            server: {
              type: 'string',
              example: '10.100.0.10'
            },
            keyName: {
              type: 'string',
              example: 'snap-dns-key'
            },
            algorithm: {
              type: 'string',
              enum: ['hmac-md5', 'hmac-sha1', 'hmac-sha224', 'hmac-sha256', 'hmac-sha384', 'hmac-sha512'],
              example: 'hmac-sha256'
            },
            zones: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['example.com', 'test.local']
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'user-admin-001'
            },
            username: {
              type: 'string',
              example: 'admin'
            },
            role: {
              type: 'string',
              enum: ['admin', 'editor', 'viewer'],
              example: 'admin'
            },
            email: {
              type: 'string',
              format: 'email',
              nullable: true
            },
            lastLogin: {
              type: 'string',
              format: 'date-time',
              nullable: true
            },
            allowedKeyIds: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'TSIG key IDs this user can access (empty for admins = all keys)'
            }
          }
        }
      }
    },
    security: [
      {
        BearerAuth: []
      },
      {
        SessionAuth: []
      }
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints'
      },
      {
        name: 'Authentication',
        description: 'User authentication and session management'
      },
      {
        name: 'API Keys',
        description: 'API key management for programmatic access'
      },
      {
        name: 'DNS Zones',
        description: 'DNS zone and record operations'
      },
      {
        name: 'TSIG Keys',
        description: 'TSIG key management for BIND authentication'
      },
      {
        name: 'Users',
        description: 'User management (admin only)'
      },
      {
        name: 'Audit',
        description: 'Audit log access (admin only)'
      },
      {
        name: 'Backups',
        description: 'Zone snapshot and backup operations'
      },
      {
        name: 'Webhooks',
        description: 'Webhook configuration and testing'
      },
      {
        name: 'SSO',
        description: 'Single Sign-On configuration (admin only)'
      }
    ]
  },
  apis: [
    './src/routes/*.ts',
    './src/server.ts'
  ]
};

export const swaggerSpec = swaggerJsdoc(options);
