import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

import Permission from '../modules/permissions/permission.model.js';
import Role from '../modules/roles/role.model.js';
import User from '../modules/auth/auth.model.js';

dotenv.config();

// Master permission list following VOXA schema: name = module:action
const permissionsData = [
  // Companies
  { name: 'companies:create', module: 'companies', action: 'create', description: 'Create new companies', isSystem: true },
  { name: 'companies:read',   module: 'companies', action: 'read',   description: 'View companies list and details', isSystem: true },
  { name: 'companies:update', module: 'companies', action: 'update', description: 'Update company details and status', isSystem: true },
  { name: 'companies:delete', module: 'companies', action: 'delete', description: 'Delete companies', isSystem: true },

  // Users
  { name: 'users:create', module: 'users', action: 'create', description: 'Create new users', isSystem: true },
  { name: 'users:read',   module: 'users', action: 'read',   description: 'View users list and details', isSystem: true },
  { name: 'users:update', module: 'users', action: 'update', description: 'Update user details', isSystem: true },
  { name: 'users:delete', module: 'users', action: 'delete', description: 'Delete users', isSystem: true },

  // Roles
  { name: 'roles:create', module: 'roles', action: 'create', description: 'Create new roles', isSystem: true },
  { name: 'roles:read',   module: 'roles', action: 'read',   description: 'View roles list and details', isSystem: true },
  { name: 'roles:update', module: 'roles', action: 'update', description: 'Update role details and permissions', isSystem: true },
  { name: 'roles:delete', module: 'roles', action: 'delete', description: 'Delete roles', isSystem: true },

  // Permissions
  { name: 'permissions:create', module: 'permissions', action: 'create', description: 'Create new permissions', isSystem: true },
  { name: 'permissions:read',   module: 'permissions', action: 'read',   description: 'View permissions list', isSystem: true },
  { name: 'permissions:update', module: 'permissions', action: 'update', description: 'Update permissions', isSystem: true },
  { name: 'permissions:delete', module: 'permissions', action: 'delete', description: 'Delete permissions', isSystem: true },

  // Billing
  { name: 'billing:read',   module: 'billing', action: 'read',   description: 'View billing records', isSystem: true },
  { name: 'billing:update', module: 'billing', action: 'update', description: 'Manage billing settings', isSystem: true },
  { name: 'billing:export', module: 'billing', action: 'export', description: 'Export billing data', isSystem: true },

  // DID
  { name: 'did:create', module: 'did', action: 'create', description: 'Assign and create DIDs', isSystem: true },
  { name: 'did:read',   module: 'did', action: 'read',   description: 'View DID list', isSystem: true },
  { name: 'did:update', module: 'did', action: 'update', description: 'Update DID settings', isSystem: true },
  { name: 'did:delete', module: 'did', action: 'delete', description: 'Release DIDs', isSystem: true },

  // Calls / Logs
  { name: 'calls:read',   module: 'calls', action: 'read',   description: 'View call records', isSystem: true },
  { name: 'calls:export', module: 'calls', action: 'export', description: 'Export call logs', isSystem: true },

  // Agents
  { name: 'agents:create', module: 'agents', action: 'create', description: 'Create agents', isSystem: true },
  { name: 'agents:read',   module: 'agents', action: 'read',   description: 'View agents', isSystem: true },
  { name: 'agents:update', module: 'agents', action: 'update', description: 'Update agent settings', isSystem: true },
  { name: 'agents:delete', module: 'agents', action: 'delete', description: 'Delete agents', isSystem: true },

  // Campaigns
  { name: 'campaigns:create', module: 'campaigns', action: 'create', description: 'Create campaigns', isSystem: true },
  { name: 'campaigns:read',   module: 'campaigns', action: 'read',   description: 'View campaigns', isSystem: true },
  { name: 'campaigns:update', module: 'campaigns', action: 'update', description: 'Update campaigns', isSystem: true },
  { name: 'campaigns:delete', module: 'campaigns', action: 'delete', description: 'Delete campaigns', isSystem: true },

  // Reports
  { name: 'reports:read',   module: 'reports', action: 'read',   description: 'View reports', isSystem: true },
  { name: 'reports:export', module: 'reports', action: 'export', description: 'Export reports', isSystem: true },
];

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/voxa');
    console.log('✅ Connected to MongoDB for seeding');

    // 1. Seed Permissions (upsert — safe to run multiple times)
    console.log('\n[1] Seeding permissions...');
    const permissionNames = [];
    for (const perm of permissionsData) {
      await Permission.findOneAndUpdate(
        { name: perm.name },
        perm,
        { upsert: true, new: true }
      );
      permissionNames.push(perm.name);
    }
    console.log(`✅ ${permissionNames.length} permissions seeded.`);

    // 1.5 Seed Plans
    console.log('\n[1.5] Seeding Plans...');
    const Plan = (await import('../modules/billing/plan.model.js')).default;
    await Plan.findOneAndUpdate({ name: 'Pro Prepaid' }, { name: 'Pro Prepaid', type: 'prepaid', cost: 99, tokens: 3000, description: '3000 tokens for $99 upfront' }, { upsert: true });
    await Plan.findOneAndUpdate({ name: 'Enterprise Postpaid' }, { name: 'Enterprise Postpaid', type: 'postpaid', cost: 0, tokens: 5000, description: '5000 tokens cap, pay at end of month' }, { upsert: true });
    console.log(`✅ Plans seeded.`);

    // 2. Seed Super Admin Role (voxa scope — all permissions)
    console.log('\n[2] Seeding Super Admin role...');
    const superAdminRole = await Role.findOneAndUpdate(
      { name: 'Super Admin', scope: 'voxa' },
      {
        name: 'Super Admin',
        description: 'Full system access across all modules',
        scope: 'voxa',
        companyId: null,
        permissions: permissionNames,
        status: 'active'
      },
      { upsert: true, new: true }
    );
    console.log(`✅ Super Admin role ID: ${superAdminRole._id}`);

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

    console.log('\n🎉 Seeding completed successfully!');
    console.log('─────────────────────────────────');
    console.log('Login credentials:');
    console.log('  Email   : admin@voxa.com');
    console.log('  Password: voxa@123');
    console.log('  Portal  : admin');
    console.log('─────────────────────────────────');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during seeding:', err.message);
    process.exit(1);
  }
};

seedDatabase();
