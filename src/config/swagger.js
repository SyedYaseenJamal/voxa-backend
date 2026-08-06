import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Voxa API',
      version: '1.0.0',
      description: 'Production-grade REST API for Voxa — a VoIP/Telecom SaaS platform',
      contact: {
        name: 'Voxa Dev Team',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000/api/v1',
        description: 'Local Development Server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
      },
      schemas: {
        // ── Auth ──────────────────────────────────────────────────────────
        SignupRequest: {
          type: 'object',
          required: ['email', 'password', 'portal'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'john.doe@acme.com',
            },
            password: {
              type: 'string',
              minLength: 6,
              example: 'Secure@123',
            },
            portal: {
              type: 'string',
              enum: ['admin', 'customer'],
              example: 'admin',
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password', 'portal'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'john.doe@acme.com',
            },
            password: {
              type: 'string',
              example: 'Secure@123',
            },
            portal: {
              type: 'string',
              enum: ['admin', 'customer'],
              example: 'admin',
            },
          },
        },
        RefreshTokenRequest: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
          },
        },
        ChangePasswordRequest: {
          type: 'object',
          required: ['oldPassword', 'newPassword'],
          properties: {
            oldPassword: {
              type: 'string',
              example: 'Secure@123',
            },
            newPassword: {
              type: 'string',
              minLength: 6,
              example: 'NewSecure@456',
            },
          },
        },
        ForgotPasswordRequest: {
          type: 'object',
          required: ['email'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'john.doe@acme.com',
            },
          },
        },
        ResetPasswordRequest: {
          type: 'object',
          required: ['token', 'newPassword'],
          properties: {
            token: {
              type: 'string',
              example: 'a3f8c2d1e9b74e6a...',
              description: 'Reset token received from forgot-password (check server console log)',
            },
            newPassword: {
              type: 'string',
              minLength: 6,
              example: 'Fresh@789',
            },
          },
        },
        // ── Responses ─────────────────────────────────────────────────────
        SuccessResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            message: { type: 'string', example: 'Operation successful' },
            data: { type: 'object', nullable: true },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'error' },
            message: { type: 'string', example: 'Something went wrong' },
            errors: {
              type: 'array',
              nullable: true,
              items: { type: 'object' },
            },
          },
        },
        LoginSuccessData: {
          type: 'object',
          properties: {
            accessToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            refreshToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            user: {
              type: 'object',
              properties: {
                userId: { type: 'string', example: '64f1a2b3c4d5e6f7a8b9c0d1' },
                email: { type: 'string', example: 'john.doe@acme.com' },
                role: { type: 'string', example: 'admin' },
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/modules/**/*.routes.js'],
};

export const swaggerSpec = swaggerJsdoc(options);
