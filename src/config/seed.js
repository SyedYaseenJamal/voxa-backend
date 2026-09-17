import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

import Permission from '../modules/permissions/permission.model.js';
import Role from '../modules/roles/role.model.js';
import User from '../modules/auth/auth.model.js';
import Company from '../modules/companies/company.model.js';
import Did from '../modules/dids/did.model.js';

dotenv.config();

// Master permission list following VOXA schema: name = module:action
export const permissionsData = [
  // ── Companies (Admin Only) ─────────────────────────────────────────────────
  { name: 'companies:create', module: 'companies', action: 'create', description: 'Create new companies and onboard initial admin', scope: 'admin', isSystem: true },
  { name: 'companies:read',   module: 'companies', action: 'read',   description: 'View companies list, details, and tenant info', scope: 'admin', isSystem: true },
  { name: 'companies:update', module: 'companies', action: 'update', description: 'Update company details, status, and tenant configuration', scope: 'admin', isSystem: true },
  { name: 'companies:delete', module: 'companies', action: 'delete', description: 'Deactivate or delete companies', scope: 'admin', isSystem: true },

  // ── Users (Shared: Staff in Admin, Team in Company) ────────────────────────
  { name: 'users:create', module: 'users', action: 'create', description: 'Create and invite new users', scope: 'both', isSystem: true },
  { name: 'users:read',   module: 'users', action: 'read',   description: 'View users list and profiles', scope: 'both', isSystem: true },
  { name: 'users:update', module: 'users', action: 'update', description: 'Update user profiles, status, and assign roles', scope: 'both', isSystem: true },
  { name: 'users:delete', module: 'users', action: 'delete', description: 'Deactivate user accounts', scope: 'both', isSystem: true },

  // ── Roles & Permissions ───────────────────────────────────────────────────
  { name: 'roles:create', module: 'roles', action: 'create', description: 'Create new custom roles', scope: 'both', isSystem: true },
  { name: 'roles:read',   module: 'roles', action: 'read',   description: 'View roles list and permissions', scope: 'both', isSystem: true },
  { name: 'roles:update', module: 'roles', action: 'update', description: 'Update role details and permissions', scope: 'both', isSystem: true },
  { name: 'roles:delete', module: 'roles', action: 'delete', description: 'Delete custom roles', scope: 'both', isSystem: true },

  // ── System Permissions (Admin Only) ───────────────────────────────────────
  { name: 'permissions:create', module: 'permissions', action: 'create', description: 'Create new permissions', scope: 'admin', isSystem: true },
  { name: 'permissions:read',   module: 'permissions', action: 'read',   description: 'View system permissions list', scope: 'admin', isSystem: true },
  { name: 'permissions:update', module: 'permissions', action: 'update', description: 'Update system permissions metadata', scope: 'admin', isSystem: true },
  { name: 'permissions:delete', module: 'permissions', action: 'delete', description: 'Delete custom permissions', scope: 'admin', isSystem: true },

  // ── Billing & Plans ────────────────────────────────────────────────────────
  { name: 'billing:read',   module: 'billing', action: 'read',   description: 'View billing plans, quotas, and subscription details', scope: 'both', isSystem: true },
  { name: 'billing:update', module: 'billing', action: 'update', description: 'Create, modify, and delete billing plans', scope: 'admin', isSystem: true },
  { name: 'billing:export', module: 'billing', action: 'export', description: 'Export billing reports and transactions', scope: 'admin', isSystem: true },

  // ── DID Numbers ────────────────────────────────────────────────────────────
  { name: 'did:create',  module: 'did', action: 'create',  description: 'Add new DIDs to system pool', scope: 'admin', isSystem: true },
  { name: 'did:read',    module: 'did', action: 'read',    description: 'View DID list and history', scope: 'both', isSystem: true },
  { name: 'did:update',  module: 'did', action: 'update',  description: 'Update DID settings and notes', scope: 'admin', isSystem: true },
  { name: 'did:delete',  module: 'did', action: 'delete',  description: 'Delete DIDs from platform pool', scope: 'admin', isSystem: true },
  { name: 'did:assign',  module: 'did', action: 'assign',  description: 'Assign DIDs to companies or users', scope: 'both', isSystem: true },
  { name: 'did:release', module: 'did', action: 'release', description: 'Release DIDs back to platform pool', scope: 'admin', isSystem: true },

  // ── Dialer ─────────────────────────────────────────────────────────────────
  { name: 'dialer:access', module: 'dialer', action: 'access', description: 'Access web dialer / softphone to make and receive calls', scope: 'both', isSystem: true },

  // ── Calls & Telephony Analytics ────────────────────────────────────────────
  { name: 'calls:read',       module: 'calls', action: 'read',       description: 'View call history and CDR logs', scope: 'both', isSystem: true },
  { name: 'calls:notes',      module: 'calls', action: 'notes',      description: 'Add and view notes on calls', scope: 'both', isSystem: true },
  { name: 'calls:recordings', module: 'calls', action: 'recordings', description: 'Stream call audio recordings & view AI analysis', scope: 'both', isSystem: true },
  { name: 'calls:export',     module: 'calls', action: 'export',     description: 'Export call records to CSV/Excel', scope: 'both', isSystem: true },

  // ── IVR & OBD Campaigns ───────────────────────────────────────────────────
  { name: 'campaigns:create', module: 'campaigns', action: 'create', description: 'Create IVR campaigns and upload audio/CSV', scope: 'both', isSystem: true },
  { name: 'campaigns:read',   module: 'campaigns', action: 'read',   description: 'View IVR campaigns and OBD lists', scope: 'both', isSystem: true },
  { name: 'campaigns:update', module: 'campaigns', action: 'update', description: 'Start, pause, or edit campaigns', scope: 'both', isSystem: true },
  { name: 'campaigns:delete', module: 'campaigns', action: 'delete', description: 'Delete campaigns and audio assets', scope: 'both', isSystem: true },

  // ── Omnichannel & Integrations ─────────────────────────────────────────────
  { name: 'integrations:read',   module: 'integrations', action: 'read',   description: 'View connected integrations and overview', scope: 'both', isSystem: true },
  { name: 'integrations:manage', module: 'integrations', action: 'manage', description: 'Configure and disconnect platform integrations', scope: 'both', isSystem: true },

  // ── Messenger (Company) ────────────────────────────────────────────────────
  { name: 'messages:read', module: 'messages', action: 'read', description: 'View customer conversations in Messenger', scope: 'company', isSystem: true },
  { name: 'messages:send', module: 'messages', action: 'send', description: 'Send replies to Messenger customer chats', scope: 'company', isSystem: true },

  // ── Leads (Company) ────────────────────────────────────────────────────────
  { name: 'leads:read',   module: 'leads', action: 'read',   description: 'View captured leads and statistics', scope: 'company', isSystem: true },
  { name: 'leads:create', module: 'leads', action: 'create', description: 'Add single lead or import CSV batch', scope: 'company', isSystem: true },
  { name: 'leads:update', module: 'leads', action: 'update', description: 'Update lead status, assignment, and notes', scope: 'company', isSystem: true },
  { name: 'leads:delete', module: 'leads', action: 'delete', description: 'Delete lead records', scope: 'company', isSystem: true },

  // ── Forms (Company) ────────────────────────────────────────────────────────
  { name: 'forms:read',   module: 'forms', action: 'read',   description: 'View Meta instant forms and submissions', scope: 'company', isSystem: true },
  { name: 'forms:create', module: 'forms', action: 'create', description: 'Create and map lead capture forms', scope: 'company', isSystem: true },

  // ── Orders (Company Ecommerce) ─────────────────────────────────────────────
  { name: 'orders:read',   module: 'orders', action: 'read',   description: 'View ecommerce orders list and details', scope: 'company', isSystem: true },
  { name: 'orders:create', module: 'orders', action: 'create', description: 'Create customer orders', scope: 'company', isSystem: true },
  { name: 'orders:update', module: 'orders', action: 'update', description: 'Update order status and billing info', scope: 'company', isSystem: true },
  { name: 'orders:delete', module: 'orders', action: 'delete', description: 'Delete or cancel orders', scope: 'company', isSystem: true },

  // ── AI Agents ──────────────────────────────────────────────────────────────
  { name: 'agents:create',  module: 'agents', action: 'create',  description: 'Create AI Agent receptionist configs and schemas', scope: 'both', isSystem: true },
  { name: 'agents:read',    module: 'agents', action: 'read',    description: 'View AI Agent configs, logs, and schemas', scope: 'both', isSystem: true },
  { name: 'agents:update',  module: 'agents', action: 'update',  description: 'Update AI Agent configurations and prompt scripts', scope: 'both', isSystem: true },
  { name: 'agents:delete',  module: 'agents', action: 'delete',  description: 'Delete AI Agent configurations and schemas', scope: 'both', isSystem: true },
  { name: 'agents:trigger', module: 'agents', action: 'trigger', description: 'Trigger outbound AI voice calls', scope: 'both', isSystem: true },

  // ── Reports ────────────────────────────────────────────────────────────────
  { name: 'reports:read',   module: 'reports', action: 'read',   description: 'View analytics and performance reports', scope: 'both', isSystem: true },
  { name: 'reports:export', module: 'reports', action: 'export', description: 'Export analytics reports', scope: 'both', isSystem: true },
];

export const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/voxa');
    console.log('✅ Connected to MongoDB for seeding');

    // 1. Seed Permissions (upsert — safe to run multiple times)
    console.log('\n[1] Seeding permissions...');
    const allPermissionNames = [];
    const adminPermissionNames = [];
    const companyPermissionNames = [];

    for (const perm of permissionsData) {
      await Permission.findOneAndUpdate(
        { name: perm.name },
        perm,
        { upsert: true, new: true }
      );
      allPermissionNames.push(perm.name);
      if (perm.scope === 'admin' || perm.scope === 'both') {
        adminPermissionNames.push(perm.name);
      }
      if (perm.scope === 'company' || perm.scope === 'both') {
        companyPermissionNames.push(perm.name);
      }
    }
    console.log(`✅ ${allPermissionNames.length} total permissions seeded (${adminPermissionNames.length} admin, ${companyPermissionNames.length} company).`);

    // 1.5 Seed Plans
    console.log('\n[1.5] Seeding Plans...');
    const Plan = (await import('../modules/billing/plan.model.js')).default;
    await Plan.findOneAndUpdate({ name: 'Pro Prepaid' }, { name: 'Pro Prepaid', type: 'prepaid', cost: 99, tokens: 3000, description: '3000 tokens for $99 upfront' }, { upsert: true });
    await Plan.findOneAndUpdate({ name: 'Enterprise Postpaid' }, { name: 'Enterprise Postpaid', type: 'postpaid', cost: 0, tokens: 5000, description: '5000 tokens cap, pay at end of month' }, { upsert: true });
    console.log(`✅ Plans seeded.`);

    // 2. Seed Voxa Designated Admin Roles (scope: 'voxa')
    console.log('\n[2] Seeding designated Voxa Admin roles...');

    // 2.1 Super Admin (all permissions)
    const superAdminRole = await Role.findOneAndUpdate(
      { name: 'Super Admin', scope: 'voxa' },
      {
        name: 'Super Admin',
        description: 'Full system access across all platform modules',
        scope: 'voxa',
        companyId: null,
        permissions: allPermissionNames,
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Super Admin role: ${superAdminRole._id}`);

    // 2.2 DID Manager
    const didManagerRole = await Role.findOneAndUpdate(
      { name: 'DID Manager', scope: 'voxa' },
      {
        name: 'DID Manager',
        description: 'Manages system DID inventory and assigns/releases numbers for companies',
        scope: 'voxa',
        companyId: null,
        permissions: [
          'did:read', 'did:create', 'did:update', 'did:delete', 'did:assign', 'did:release',
          'companies:read'
        ],
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ DID Manager role: ${didManagerRole._id}`);

    // 2.3 Billing and Roles Manager
    const billingRolesRole = await Role.findOneAndUpdate(
      { name: 'Billing and Roles Manager', scope: 'voxa' },
      {
        name: 'Billing and Roles Manager',
        description: 'Manages subscription plans, pricing, staff users, and internal access roles',
        scope: 'voxa',
        companyId: null,
        permissions: [
          'billing:read', 'billing:update', 'billing:export',
          'roles:read', 'roles:create', 'roles:update', 'roles:delete',
          'users:read', 'users:update'
        ],
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Billing and Roles Manager role: ${billingRolesRole._id}`);

    // 2.4 Telephony & Call Auditor
    const callAuditorRole = await Role.findOneAndUpdate(
      { name: 'Telephony & Call Auditor', scope: 'voxa' },
      {
        name: 'Telephony & Call Auditor',
        description: 'Monitors platform master call logs, recordings, AI transcription, and analytics',
        scope: 'voxa',
        companyId: null,
        permissions: [
          'calls:read', 'calls:notes', 'calls:recordings', 'calls:export',
          'agents:read', 'companies:read'
        ],
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Telephony & Call Auditor role: ${callAuditorRole._id}`);

    // 2.5 Support & Operations
    const supportOpsRole = await Role.findOneAndUpdate(
      { name: 'Support & Operations', scope: 'voxa' },
      {
        name: 'Support & Operations',
        description: 'Operational diagnostics, company inspection, DID overview, and dialer testing',
        scope: 'voxa',
        companyId: null,
        permissions: [
          'companies:read', 'did:read', 'calls:read', 'agents:read', 'integrations:read', 'dialer:access'
        ],
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Support & Operations role: ${supportOpsRole._id}`);

    // 3. Seed Super Admin User
    console.log('\n[3] Seeding Super Admin user...');
    const passwordHash = await bcrypt.hash('voxa@123', 10);
    const superAdminUser = await User.findOneAndUpdate(
      { email: 'admin@voxa.com' },
      {
        email: 'admin@voxa.com',
        fullName: 'Voxa Super Admin',
        passwordHash,
        portal: 'admin',
        companyId: null,
        roleId: superAdminRole._id,
        isActive: true,
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`✅ Super Admin user: ${superAdminUser.email}`);

    // 3.2 Seed DID Manager sample user
    const didUserPasswordHash = await bcrypt.hash('did@12345', 10);
    const didUser = await User.findOneAndUpdate(
      { email: 'did.manager@voxa.com' },
      {
        email: 'did.manager@voxa.com',
        fullName: 'Voxa DID Manager',
        passwordHash: didUserPasswordHash,
        portal: 'admin',
        companyId: null,
        roleId: didManagerRole._id,
        isActive: true,
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ DID Manager user: ${didUser.email}`);

    // 3.3 Seed Billing & Roles Manager user
    const billingUserHash = await bcrypt.hash('billing@12345', 10);
    const billingUser = await User.findOneAndUpdate(
      { email: 'billing.manager@voxa.com' },
      {
        email: 'billing.manager@voxa.com',
        fullName: 'Voxa Billing & Roles Lead',
        passwordHash: billingUserHash,
        portal: 'admin',
        companyId: null,
        roleId: billingRolesRole._id,
        isActive: true,
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Billing Manager user: ${billingUser.email}`);

    // 3.4 Seed Telephony & Call Auditor user
    const auditorUserHash = await bcrypt.hash('auditor@12345', 10);
    const auditorUser = await User.findOneAndUpdate(
      { email: 'call.auditor@voxa.com' },
      {
        email: 'call.auditor@voxa.com',
        fullName: 'Voxa Call Quality Auditor',
        passwordHash: auditorUserHash,
        portal: 'admin',
        companyId: null,
        roleId: callAuditorRole._id,
        isActive: true,
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Telephony Auditor user: ${auditorUser.email}`);

    // 3.5 Seed Support & Operations user
    const supportUserHash = await bcrypt.hash('support@12345', 10);
    const supportUser = await User.findOneAndUpdate(
      { email: 'support.ops@voxa.com' },
      {
        email: 'support.ops@voxa.com',
        fullName: 'Voxa Operations Specialist',
        passwordHash: supportUserHash,
        portal: 'admin',
        companyId: null,
        roleId: supportOpsRole._id,
        isActive: true,
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Support & Ops user: ${supportUser.email}`);

    // 4. Seed Demo Companies
    console.log('\n[4] Seeding Demo Companies...');
    const demoCompany = await Company.findOneAndUpdate(
      { name: 'Acme Corp' },
      {
        name: 'Acme Corp',
        businessType: 'other',
        status: 'active',
        billingModel: 'prepaid',
        maxConcurrentCalls: 10,
        aiReceptionistEnabled: true,
        bulkAiCallingEnabled: true,
        forceHalt: false
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Demo Company (General/Leads): ${demoCompany.name} (${demoCompany._id})`);

    const demoEcommerceCompany = await Company.findOneAndUpdate(
      { name: 'Acme Commerce' },
      {
        name: 'Acme Commerce',
        businessType: 'ecommerce',
        status: 'active',
        billingModel: 'prepaid',
        maxConcurrentCalls: 10,
        aiReceptionistEnabled: true,
        bulkAiCallingEnabled: true,
        forceHalt: false
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Demo Company (Ecommerce/Orders): ${demoEcommerceCompany.name} (${demoEcommerceCompany._id})`);

    // Ensure Acme Corp has an active DID assigned for telephony/AI tests
    let assignedDid = await Did.findOne({ company_id: demoCompany._id, status: 'assigned' });
    if (!assignedDid) {
      assignedDid = await Did.findOneAndUpdate(
        { did_number: '02135863050' },
        {
          did_number: '02135863050',
          label: 'Acme Primary Line',
          notes: 'Seeded test DID for company testing',
          status: 'assigned',
          company_id: demoCompany._id
        },
        { upsert: true, new: true }
      );
      console.log(`  ✓ Assigned DID ${assignedDid.did_number} to ${demoCompany.name}`);
    } else {
      console.log(`  ✓ Existing assigned DID found: ${assignedDid.did_number}`);
    }

    // 5. Seed Designated Company Roles (scope: 'company')
    console.log('\n[5] Seeding Designated Company Roles for Acme Corp...');

    // 5.1 Company Admin (all company permissions)
    const companyAdminRole = await Role.findOneAndUpdate(
      { name: 'Company Admin', scope: 'company', companyId: demoCompany._id },
      {
        name: 'Company Admin',
        description: 'Full administrative control over company users, roles, billing, DIDs, omnichannel, AI agents, campaigns, and call logs',
        scope: 'company',
        companyId: demoCompany._id,
        permissions: companyPermissionNames,
        status: 'active',
        deletedAt: null
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Company Admin role: ${companyAdminRole._id} (${companyAdminRole.permissions.length} perms)`);

    // 5.2 Dialer Operator (Strictly dialer & own call logs — all 10 other modules hidden)
    const dialerOperatorRole = await Role.findOneAndUpdate(
      { name: 'Dialer Operator', scope: 'company', companyId: demoCompany._id },
      {
        name: 'Dialer Operator',
        description: 'Frontline phone operator restricted solely to web softphone dialer and personal call logs. All admin and management modules hidden',
        scope: 'company',
        companyId: demoCompany._id,
        permissions: ['dialer:access', 'calls:read', 'calls:notes'],
        status: 'active',
        deletedAt: null
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Dialer Operator role: ${dialerOperatorRole._id} (${dialerOperatorRole.permissions.length} perms)`);

    // 5.3 Campaign Manager
    const campaignManagerRole = await Role.findOneAndUpdate(
      { name: 'Campaign Manager', scope: 'company', companyId: demoCompany._id },
      {
        name: 'Campaign Manager',
        description: 'Manages outbound IVR campaigns, OBD audio broadcasts, captured leads, and marketing forms',
        scope: 'company',
        companyId: demoCompany._id,
        permissions: [
          'campaigns:create', 'campaigns:read', 'campaigns:update', 'campaigns:delete',
          'leads:create', 'leads:read', 'leads:update', 'leads:delete',
          'forms:create', 'forms:read',
          'messages:read', 'messages:send',
          'calls:read',
          'reports:read', 'reports:export'
        ],
        status: 'active',
        deletedAt: null
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Campaign Manager role: ${campaignManagerRole._id} (${campaignManagerRole.permissions.length} perms)`);

    // 5.4 AI Agent Specialist
    const aiSpecialistRole = await Role.findOneAndUpdate(
      { name: 'AI Agent Specialist', scope: 'company', companyId: demoCompany._id },
      {
        name: 'AI Agent Specialist',
        description: 'Configures AI voice receptionists, prompts, schemas, triggers outbound calls, and analyzes AI call transcripts',
        scope: 'company',
        companyId: demoCompany._id,
        permissions: [
          'agents:create', 'agents:read', 'agents:update', 'agents:delete', 'agents:trigger',
          'calls:read', 'calls:recordings', 'calls:notes',
          'did:read',
          'reports:read'
        ],
        status: 'active',
        deletedAt: null
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ AI Agent Specialist role: ${aiSpecialistRole._id} (${aiSpecialistRole.permissions.length} perms)`);

    // 5.5 Customer Support Agent
    const supportAgentRole = await Role.findOneAndUpdate(
      { name: 'Customer Support Agent', scope: 'company', companyId: demoCompany._id },
      {
        name: 'Customer Support Agent',
        description: 'Handles live customer chats in Omnichannel Messenger, softphone calls, orders, and lead records',
        scope: 'company',
        companyId: demoCompany._id,
        permissions: [
          'dialer:access',
          'calls:read', 'calls:notes',
          'messages:read', 'messages:send',
          'integrations:read',
          'leads:read', 'leads:create', 'leads:update',
          'orders:read', 'orders:create', 'orders:update'
        ],
        status: 'active',
        deletedAt: null
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Customer Support Agent role: ${supportAgentRole._id} (${supportAgentRole.permissions.length} perms)`);

    // 5.6 Call Center Supervisor
    const supervisorRole = await Role.findOneAndUpdate(
      { name: 'Call Center Supervisor', scope: 'company', companyId: demoCompany._id },
      {
        name: 'Call Center Supervisor',
        description: 'Team lead monitoring telephony operations, reviewing call recordings, analyzing team reports, and overseeing campaigns',
        scope: 'company',
        companyId: demoCompany._id,
        permissions: [
          'calls:read', 'calls:notes', 'calls:recordings', 'calls:export',
          'dialer:access',
          'did:read',
          'campaigns:read',
          'leads:read',
          'agents:read',
          'users:read',
          'reports:read', 'reports:export'
        ],
        status: 'active',
        deletedAt: null
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Call Center Supervisor role: ${supervisorRole._id} (${supervisorRole.permissions.length} perms)`);

    // Also seed an Ecommerce Company Admin role for Acme Commerce
    const ecommerceAdminRole = await Role.findOneAndUpdate(
      { name: 'Company Admin', scope: 'company', companyId: demoEcommerceCompany._id },
      {
        name: 'Company Admin',
        description: 'Full administrative control over ecommerce store',
        scope: 'company',
        companyId: demoEcommerceCompany._id,
        permissions: companyPermissionNames,
        status: 'active',
        deletedAt: null
      },
      { upsert: true, new: true }
    );

    // 6. Seed Designated Company Test Users (portal: 'customer')
    console.log('\n[6] Seeding Designated Company Test Users...');
    const companyPassHash = await bcrypt.hash('acme@12345', 10);
    const dialerPassHash = await bcrypt.hash('dialer@12345', 10);
    const campaignPassHash = await bcrypt.hash('campaign@12345', 10);
    const aiPassHash = await bcrypt.hash('ai@12345', 10);
    const supportPassHash = await bcrypt.hash('support@12345', 10);
    const supervisorPassHash = await bcrypt.hash('supervisor@12345', 10);

    // 6.1 Company Admin: admin@acme.com / acme@12345
    const companyAdminUser = await User.findOneAndUpdate(
      { email: 'admin@acme.com' },
      {
        email: 'admin@acme.com',
        fullName: 'Acme Company Admin',
        passwordHash: companyPassHash,
        portal: 'customer',
        companyId: demoCompany._id,
        roleId: companyAdminRole._id,
        isActive: true,
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Company Admin: ${companyAdminUser.email}`);

    // 6.2 Dialer Operator: dialer.operator@acme.com / dialer@12345
    const dialerOperatorUser = await User.findOneAndUpdate(
      { email: 'dialer.operator@acme.com' },
      {
        email: 'dialer.operator@acme.com',
        fullName: 'Acme Dialer Operator',
        passwordHash: dialerPassHash,
        portal: 'customer',
        companyId: demoCompany._id,
        roleId: dialerOperatorRole._id,
        isActive: true,
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Dialer Operator: ${dialerOperatorUser.email}`);

    // 6.3 Campaign Manager: campaign.manager@acme.com / campaign@12345
    const campaignManagerUser = await User.findOneAndUpdate(
      { email: 'campaign.manager@acme.com' },
      {
        email: 'campaign.manager@acme.com',
        fullName: 'Acme Campaign Manager',
        passwordHash: campaignPassHash,
        portal: 'customer',
        companyId: demoCompany._id,
        roleId: campaignManagerRole._id,
        isActive: true,
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Campaign Manager: ${campaignManagerUser.email}`);

    // 6.4 AI Agent Specialist: ai.specialist@acme.com / ai@12345
    const aiSpecialistUser = await User.findOneAndUpdate(
      { email: 'ai.specialist@acme.com' },
      {
        email: 'ai.specialist@acme.com',
        fullName: 'Acme AI Specialist',
        passwordHash: aiPassHash,
        portal: 'customer',
        companyId: demoCompany._id,
        roleId: aiSpecialistRole._id,
        isActive: true,
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ AI Agent Specialist: ${aiSpecialistUser.email}`);

    // 6.5 Customer Support Agent: support.agent@acme.com / support@12345
    const supportAgentUser = await User.findOneAndUpdate(
      { email: 'support.agent@acme.com' },
      {
        email: 'support.agent@acme.com',
        fullName: 'Acme Support Agent',
        passwordHash: supportPassHash,
        portal: 'customer',
        companyId: demoCompany._id,
        roleId: supportAgentRole._id,
        isActive: true,
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Customer Support Agent: ${supportAgentUser.email}`);

    // 6.6 Call Center Supervisor: supervisor@acme.com / supervisor@12345
    const supervisorUser = await User.findOneAndUpdate(
      { email: 'supervisor@acme.com' },
      {
        email: 'supervisor@acme.com',
        fullName: 'Acme Call Supervisor',
        passwordHash: supervisorPassHash,
        portal: 'customer',
        companyId: demoCompany._id,
        roleId: supervisorRole._id,
        isActive: true,
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Call Center Supervisor: ${supervisorUser.email}`);

    // 6.7 Ecommerce Admin (for testing Order Management): ecommerce.admin@acme.com / acme@12345
    const ecommerceAdminUser = await User.findOneAndUpdate(
      { email: 'ecommerce.admin@acme.com' },
      {
        email: 'ecommerce.admin@acme.com',
        fullName: 'Acme Store Admin',
        passwordHash: companyPassHash,
        portal: 'customer',
        companyId: demoEcommerceCompany._id,
        roleId: ecommerceAdminRole._id,
        isActive: true,
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`  ✓ Ecommerce Admin (Orders enabled): ${ecommerceAdminUser.email}`);

    console.log('\n🎉 Seeding completed successfully!');
    console.log('═════════════════════════════════════════════════════════════════════════════════');
    console.log('                 VOXA PLATFORM TEST CREDENTIALS');
    console.log('═════════════════════════════════════════════════════════════════════════════════');
    console.log('\n🛡️  ADMIN PORTAL (Login URL: /admin/login | portal: "admin")');
    console.log('─────────────────────────────────────────────────────────────────────────────────');
    console.log('  Role                     Email                       Password');
    console.log('  ─────────────────────────────────────────────────────────────────────────────');
    console.log('  Super Admin              admin@voxa.com              voxa@123');
    console.log('  DID Manager              did.manager@voxa.com        did@12345');
    console.log('  Billing & Roles Manager  billing.manager@voxa.com    billing@12345');
    console.log('  Telephony Auditor        call.auditor@voxa.com       auditor@12345');
    console.log('  Support & Operations     support.ops@voxa.com        support@12345');
    console.log('─────────────────────────────────────────────────────────────────────────────────');
    console.log('\n🏢  COMPANY PORTAL (Login URL: /company/login | portal: "customer")');
    console.log('─────────────────────────────────────────────────────────────────────────────────');
    console.log('  Role                     Email                       Password       Visible Modules');
    console.log('  ─────────────────────────────────────────────────────────────────────────────');
    console.log('  Company Admin            admin@acme.com              acme@12345     ALL 11 Modules');
    console.log('  Dialer Operator          dialer.operator@acme.com    dialer@12345   Dialer & Logs only (all others hidden)');
    console.log('  Campaign Manager         campaign.manager@acme.com   campaign@12345 IVR, Leads, Forms, Logs');
    console.log('  AI Agent Specialist      ai.specialist@acme.com      ai@12345       AI Agents, DIDs, Logs');
    console.log('  Customer Support Agent   support.agent@acme.com      support@12345  Dialer, Messenger, Leads, Logs');
    console.log('  Call Center Supervisor   supervisor@acme.com         supervisor@12345 Logs, Reports, Users(R), DIDs(R)');
    console.log('  Ecommerce Store Admin    ecommerce.admin@acme.com    acme@12345     Order Management enabled');
    console.log('═════════════════════════════════════════════════════════════════════════════════');

    if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
      process.exit(0);
    }
  } catch (err) {
    console.error('❌ Error during seeding:', err.message);
    if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
      process.exit(1);
    }
    throw err;
  }
};

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase();
}
