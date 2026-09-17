export const PERMISSIONS = {
  // Companies (Admin Portal)
  COMPANIES_CREATE: 'companies:create',
  COMPANIES_READ:   'companies:read',
  COMPANIES_UPDATE: 'companies:update',
  COMPANIES_DELETE: 'companies:delete',

  // Users (Admin Staff / Company Users)
  USERS_CREATE: 'users:create',
  USERS_READ:   'users:read',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',

  // Roles
  ROLES_CREATE: 'roles:create',
  ROLES_READ:   'roles:read',
  ROLES_UPDATE: 'roles:update',
  ROLES_DELETE: 'roles:delete',

  // Permissions (Admin Management)
  PERMISSIONS_CREATE: 'permissions:create',
  PERMISSIONS_READ:   'permissions:read',
  PERMISSIONS_UPDATE: 'permissions:update',
  PERMISSIONS_DELETE: 'permissions:delete',

  // Billing & Plans
  BILLING_READ:   'billing:read',
  BILLING_UPDATE: 'billing:update',
  BILLING_EXPORT: 'billing:export',

  // DID Numbers
  DID_CREATE:  'did:create',
  DID_READ:    'did:read',
  DID_UPDATE:  'did:update',
  DID_DELETE:  'did:delete',
  DID_ASSIGN:  'did:assign',
  DID_RELEASE: 'did:release',

  // Dialer
  DIALER_ACCESS: 'dialer:access',

  // Calls / Telephony
  CALLS_READ:       'calls:read',
  CALLS_NOTES:      'calls:notes',
  CALLS_RECORDINGS: 'calls:recordings',
  CALLS_EXPORT:     'calls:export',

  // IVR & Campaigns
  CAMPAIGNS_CREATE: 'campaigns:create',
  CAMPAIGNS_READ:   'campaigns:read',
  CAMPAIGNS_UPDATE: 'campaigns:update',
  CAMPAIGNS_DELETE: 'campaigns:delete',

  // Omnichannel & Integrations
  INTEGRATIONS_READ:   'integrations:read',
  INTEGRATIONS_MANAGE: 'integrations:manage',

  // Messenger
  MESSAGES_READ: 'messages:read',
  MESSAGES_SEND: 'messages:send',

  // Leads
  LEADS_READ:   'leads:read',
  LEADS_CREATE: 'leads:create',
  LEADS_UPDATE: 'leads:update',
  LEADS_DELETE: 'leads:delete',

  // Forms
  FORMS_READ:   'forms:read',
  FORMS_CREATE: 'forms:create',

  // Orders
  ORDERS_READ:   'orders:read',
  ORDERS_CREATE: 'orders:create',
  ORDERS_UPDATE: 'orders:update',
  ORDERS_DELETE: 'orders:delete',

  // AI Agents
  AGENTS_CREATE:  'agents:create',
  AGENTS_READ:    'agents:read',
  AGENTS_UPDATE:  'agents:update',
  AGENTS_DELETE:  'agents:delete',
  AGENTS_TRIGGER: 'agents:trigger',

  // Reports
  REPORTS_READ:   'reports:read',
  REPORTS_EXPORT: 'reports:export',
};

export const PERMISSION_LIST = Object.values(PERMISSIONS);
