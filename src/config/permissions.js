export const PERMISSIONS = {
  // Companies
  COMPANIES_CREATE: 'companies:create',
  COMPANIES_READ:   'companies:read',
  COMPANIES_UPDATE: 'companies:update',
  COMPANIES_DELETE: 'companies:delete',

  // Users
  USERS_CREATE: 'users:create',
  USERS_READ:   'users:read',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',

  // Roles
  ROLES_CREATE: 'roles:create',
  ROLES_READ:   'roles:read',
  ROLES_UPDATE: 'roles:update',
  ROLES_DELETE: 'roles:delete',

  // Permissions
  PERMISSIONS_CREATE: 'permissions:create',
  PERMISSIONS_READ:   'permissions:read',
  PERMISSIONS_UPDATE: 'permissions:update',
  PERMISSIONS_DELETE: 'permissions:delete',

  // Billing
  BILLING_READ:   'billing:read',
  BILLING_UPDATE: 'billing:update',
  BILLING_EXPORT: 'billing:export',

  // DID
  DID_CREATE: 'did:create',
  DID_READ:   'did:read',
  DID_UPDATE: 'did:update',
  DID_DELETE: 'did:delete',

  // Calls
  CALLS_READ:   'calls:read',
  CALLS_EXPORT: 'calls:export',

  // Agents
  AGENTS_CREATE: 'agents:create',
  AGENTS_READ:   'agents:read',
  AGENTS_UPDATE: 'agents:update',
  AGENTS_DELETE: 'agents:delete',

  // Campaigns
  CAMPAIGNS_CREATE: 'campaigns:create',
  CAMPAIGNS_READ:   'campaigns:read',
  CAMPAIGNS_UPDATE: 'campaigns:update',
  CAMPAIGNS_DELETE: 'campaigns:delete',

  // Reports
  REPORTS_READ:   'reports:read',
  REPORTS_EXPORT: 'reports:export',
};

export const PERMISSION_LIST = Object.values(PERMISSIONS);
