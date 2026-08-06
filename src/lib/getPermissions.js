// ─── getPermissions ────────────────────────────────────────────────────────
// Fetches all permission name strings from the database.
// Use this wherever you need a live list of valid permissions
// instead of the static config/permissions.js constant.
//
// Usage:
//   const perms = await getPermissions();
//   // perms = ['companies:create', 'companies:read', ...]
//
//   const permMap = await getPermissionsGrouped();
//   // permMap = { companies: ['companies:create', ...], users: [...], ... }

import Permission from '../modules/permissions/permission.model.js';

/**
 * Returns a flat array of all permission name strings from the DB.
 * @returns {Promise<string[]>}
 */
export const getPermissions = async () => {
  const permissions = await Permission.find({}).select('name -_id').lean();
  return permissions.map((p) => p.name);
};

/**
 * Returns permissions grouped by module.
 * @returns {Promise<Record<string, string[]>>}
 */
export const getPermissionsGrouped = async () => {
  const permissions = await Permission.find({}).select('name module -_id').lean();
  return permissions.reduce((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p.name);
    return acc;
  }, {});
};

/**
 * Returns the full permission documents (name, module, action, description).
 * @returns {Promise<Array<{name: string, module: string, action: string, description: string}>>}
 */
export const getPermissionDocuments = async () => {
  return Permission.find({}).select('name module action description -_id').lean();
};

/**
 * Validates that all given permission strings exist in the DB.
 * Throws if any are invalid.
 * @param {string[]} permissions
 */
export const validatePermissions = async (permissions) => {
  if (!Array.isArray(permissions) || permissions.length === 0) return;
  const found = await Permission.find({ name: { $in: permissions } }).select('name -_id').lean();
  if (found.length !== permissions.length) {
    const foundNames = found.map((p) => p.name);
    const invalid = permissions.filter((p) => !foundNames.includes(p));
    throw new Error(`Invalid permissions: ${invalid.join(', ')}. Use module:action format (e.g. billing:read).`);
  }
};
