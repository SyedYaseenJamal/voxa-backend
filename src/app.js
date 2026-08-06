import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { errorHandler } from './middlewares/errorHandler.js';
import { connectDB } from './config/db.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';

// Routes
import authRoutes from './modules/auth/auth.routes.js';
import roleRoutes from './modules/roles/role.routes.js';
import permissionRoutes from './modules/permissions/permission.routes.js';
import companyRoutes from './modules/companies/company.routes.js';
import adminUserRoutes from './modules/admin-users/adminUser.routes.js';
import companyUserRoutes from './modules/company-users/companyUser.routes.js';

// Connect to MongoDB
await connectDB();

const app = express();

// Security & parsing middleware
app.use(cors({ origin: true, credentials: true }));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Mount routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/roles', roleRoutes);
app.use('/api/v1/permissions', permissionRoutes);
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/admin-users', adminUserRoutes);
app.use('/api/v1/company-users', companyUserRoutes);

// Swagger docs (available in all environments — restrict in prod if needed)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Voxa API Docs',
  customCss: '.swagger-ui .topbar { background-color: #1a1a2e; } .swagger-ui .topbar-wrapper img { display: none; }',
}));
app.get('/api/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Global error handler (must be last)
app.use(errorHandler);

export default app;

