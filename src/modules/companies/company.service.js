import Company from './company.model.js';
import User from '../auth/auth.model.js';
import Role from '../roles/role.model.js';
import Permission from '../permissions/permission.model.js';
import AppError from '../../utils/AppError.js';
import { generatePassword } from '../../utils/generatePassword.js';
import bcrypt from 'bcryptjs';

export const createCompany = async (companyData, adminEmail, adminFullName, createdBy) => {
  const existingUser = await User.findOne({ email: adminEmail });
  if (existingUser) throw new AppError('Admin email is already in use by another user', 400);

  // 1. Create Company
  const company = await Company.create({ ...companyData, createdBy });

  try {
    // 2. Create default "Company Admin" role for this new company with all system permissions
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

    // 3. Create the initial Company Admin User
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

    // 4. Link admin user to company
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
    // Rollback company creation if user/role creation fails
    await Company.findByIdAndDelete(company._id);
    throw err;
  }
};

export const getCompanies = async () => {
  return await Company.find()
    .populate('adminUserId', 'email fullName isActive status lastLoginAt')
    .populate('createdBy', 'email fullName');
};

export const getCompanyById = async (id) => {
  const company = await Company.findById(id)
    .populate('adminUserId', 'email fullName isActive status lastLoginAt')
    .populate('createdBy', 'email fullName');
  if (!company) throw new AppError('Company not found', 404);
  return company;
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
