// Single source for the §0 rule-4 financial gating. Every financial / HSN /
// approve / close affordance routes through one of these predicates, so a leak
// is a one-line audit, not a screen-by-screen hunt.

import type { Role } from '../types';

const finance = (r: Role): boolean => r === 'accountant' || r === 'admin';

export const RolePolicy = {
  canSeeFinancials: (r: Role): boolean => finance(r),
  canSeeHsn: (r: Role): boolean => finance(r), // §0 rule 4 names HSN explicitly
  canApproveDoc: (r: Role): boolean => finance(r),
  canSeePaymentsTab: (r: Role): boolean => finance(r),
  canManageUsers: (r: Role): boolean => r === 'admin',
  canMarkClosed: (r: Role): boolean => r === 'admin', // §5 "owner closes"
  canDelete: (r: Role): boolean => r === 'admin', // delete file / invoice / uploaded doc
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Owner / Admin',
  import_manager: 'Import Manager',
  accountant: 'Accountant',
};

export const ROLE_SHORT: Record<Role, string> = {
  admin: 'Admin',
  import_manager: 'Import Mgr',
  accountant: 'Accountant',
};
