import Company from './company.model.js';
import User from '../auth/auth.model.js';
import Role from '../roles/role.model.js';
import Permission from '../permissions/permission.model.js';
import TenantInfo from '../billing/tenantInfo.model.js';
import PrepaidBilling from '../billing/prepaidBilling.model.js';
import PostpaidBilling from '../billing/postpaidBilling.model.js';
import Plan from '../billing/plan.model.js';
import AppError from '../../utils/AppError.js';
import { generatePassword } from '../../utils/generatePassword.js';
import bcrypt from 'bcryptjs';

export const getNextTenantId = async () => {
  const tenants = await TenantInfo.find(
    {},
    { tenant_id: 1 }
  ).lean();

  let maxNum = 0;
  for (const t of tenants) {
    if (!t.tenant_id) continue;
    const match = t.tenant_id.match(/^(?:T|Voxa-tenant)-?(\d+)$/i);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  const nextNum = maxNum + 1;
  const paddedNum = String(nextNum).padStart(4, '0');
  return `T-${paddedNum}`;
};

export const createCompany = async (companyData, adminEmail, adminFullName, tenantData, planId, createdBy) => {
  const existingUser = await User.findOne({ email: adminEmail });
  if (existingUser) throw new AppError('Admin email is already in use by another user', 400);

  const plan = await Plan.findById(planId);
  if (!plan) throw new AppError('Plan not found', 404);

  // Automatically generate tenant_id in format T-0001 (incremented sequentially on successful creation)
  const autoTenantId = await getNextTenantId();
  const isAutoOrPlaceholder = !tenantData?.tenant_id || 
    tenantData.tenant_id === 'TENANT-123' || 
    /^Voxa-tenant-\d+$/i.test(tenantData.tenant_id.trim()) ||
    /^T-\d+$/i.test(tenantData.tenant_id.trim());

  const finalTenantId = isAutoOrPlaceholder ? autoTenantId : tenantData.tenant_id.trim();

  // 1. Create Company
  const company = await Company.create({ ...companyData, createdBy });

  try {
    // 2. Create Tenant Info
    await TenantInfo.create({
      company_id: company._id,
      tenant_id: finalTenantId,
      region: tenantData.region,
      province: tenantData.province,
      address: tenantData.address,
      contact_name: tenantData.contact_name,
      contact_email: tenantData.contact_email,
      is_active: true,
      effective_from: new Date()
    });

    // 3. Create Billing Record
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1); // Mock 1 month duration

    if (plan.type === 'prepaid') {
      await PrepaidBilling.create({
        company_id: company._id,
        plan_id: plan._id,
        amount_charged: plan.cost,
        tokens_cap: plan.tokens,
        status: 'active',
        purchased_at: new Date(),
        period_start: periodStart,
        period_end: periodEnd
      });
    } else {
      await PostpaidBilling.create({
        company_id: company._id,
        plan_id: plan._id,
        tokens_cap: plan.tokens,
        tokens_used: 0,
        status: 'active',
        period_start: periodStart,
        period_end: periodEnd
      });
    }

    // 4. Create default "Company Admin" role for this new company with all system permissions
    const allPermissions = await Permission.find();
    const permissionNames = allPermissions.map(p => p.name);

    const adminRole = await Role.create({
      name: 'Company Admin',
      description: 'Head administrator of the company. Full access within company scope.',
      scope: 'company',
      companyId: company._id,
      permissions: permissionNames,
      createdBy
    });

    // 5. Create the initial Company Admin User
    const tempPassword = generatePassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const adminUser = await User.create({
      email: adminEmail,
      fullName: adminFullName,
      passwordHash,
      portal: 'customer',
      companyId: company._id,
      roleId: adminRole._id,
      isActive: true,
      status: 'active',
      createdBy
    });

    // 6. Link admin user to company
    company.adminUserId = adminUser._id;
    await company.save();

    // TODO: send tempPassword to adminEmail via sendMail()
    console.log(`[EMAIL] Company admin temp password for ${adminEmail}: ${tempPassword}`);

    return {
      company,
      adminUser: {
        id: adminUser._id,
        email: adminUser.email,
        fullName: adminUser.fullName,
        tempPassword
      }
    };
  } catch (err) {
    // Rollback company creation if anything fails
    await Company.findByIdAndDelete(company._id);
    await TenantInfo.deleteMany({ company_id: company._id });
    await PrepaidBilling.deleteMany({ company_id: company._id });
    await PostpaidBilling.deleteMany({ company_id: company._id });
    throw err;
  }
};

export const getCompanies = async () => {
  const companies = await Company.find()
    .populate('adminUserId', 'email fullName isActive status lastLoginAt')
    .populate('createdBy', 'email fullName')
    .lean();
    
  // Fetch active tenants and billing for these companies
  const companyIds = companies.map(c => c._id);
  const tenants = await TenantInfo.find({ company_id: { $in: companyIds }, is_active: true }).lean();
  
  return companies.map(c => {
    const tenant = tenants.find(t => t.company_id.toString() === c._id.toString());
    return { ...c, tenant };
  });
};

export const getCompanyById = async (id) => {
  const company = await Company.findById(id)
    .populate('adminUserId', 'email fullName isActive status lastLoginAt')
    .populate('createdBy', 'email fullName')
    .lean();
  if (!company) throw new AppError('Company not found', 404);
  
  const tenant = await TenantInfo.findOne({ company_id: id, is_active: true }).lean();
  const prepaid = await PrepaidBilling.findOne({ company_id: id, status: 'active' }).populate('plan_id').lean();
  const postpaid = await PostpaidBilling.findOne({ company_id: id, status: 'active' }).populate('plan_id').lean();

  return { ...company, tenant, billing: prepaid || postpaid };
};

export const updateCompany = async (id, updateData) => {
  const company = await Company.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
  if (!company) throw new AppError('Company not found', 404);
  return company;
};

export const updateCompanyStatus = async (id, status) => {
  const company = await Company.findByIdAndUpdate(id, { status }, { new: true });
  if (!company) throw new AppError('Company not found', 404);

  // Cascade: suspend/activate all users in the company
  if (status === 'suspended' || status === 'inactive') {
    await User.updateMany({ companyId: id }, { isActive: false, status });
  } else if (status === 'active') {
    await User.updateMany({ companyId: id }, { isActive: true, status: 'active' });
  }

  return company;
};

export const updateTenant = async (companyId, tenantData) => {
  // 1. Validate company exists
  const company = await Company.findById(companyId);
  if (!company) throw new AppError('Company not found', 404);

  // 2. Find currently active tenant info and deactivate it
  const activeTenant = await TenantInfo.findOne({ company_id: companyId, is_active: true });
  if (activeTenant) {
    activeTenant.is_active = false;
    activeTenant.effective_to = new Date();
    await activeTenant.save();
  }

  // 3. Create new tenant info record
  const newTenant = await TenantInfo.create({
    company_id: companyId,
    tenant_id: tenantData.tenant_id,
    region: tenantData.region,
    province: tenantData.province,
    address: tenantData.address,
    contact_name: tenantData.contact_name,
    contact_email: tenantData.contact_email,
    is_active: true,
    effective_from: new Date()
  });

  return newTenant;
};
