import type { Role } from '../types';

export type BadgeKey = 'today' | 'pending-docs' | 'pending-payments' | 'alerts' | null;

export interface NavDef {
  key: string;
  label: string;
  path: string;
  roles: Role[];
  badge: BadgeKey;
}

const ALL: Role[] = ['admin', 'import_manager', 'accountant'];

/** Sidebar / role-aware navigation (§3). Order is the display order. */
export const NAV: NavDef[] = [
  { key: 'today', label: 'Today', path: '/today', roles: ALL, badge: 'today' },
  { key: 'home', label: 'Dashboard', path: '/', roles: ALL, badge: null },
  { key: 'calendar', label: 'Calendar', path: '/calendar', roles: ALL, badge: null },
  { key: 'files', label: 'Files', path: '/files', roles: ALL, badge: null },
  { key: 'exports', label: 'Exports', path: '/exports', roles: ALL, badge: null },
  { key: 'pending-docs', label: 'Pending Docs', path: '/pending-docs', roles: ['admin', 'import_manager'], badge: 'pending-docs' },
  { key: 'pending-payments', label: 'Pending Payments', path: '/pending-payments', roles: ['admin', 'accountant'], badge: 'pending-payments' },
  { key: 'cha', label: 'CHA Desk', path: '/cha-desk', roles: ['admin', 'import_manager'], badge: null },
  { key: 'reports', label: 'Reports', path: '/reports', roles: ALL, badge: null },
  { key: 'settings', label: 'Settings', path: '/settings', roles: ALL, badge: null },
];

export const navForRole = (role: Role): NavDef[] => NAV.filter((n) => n.roles.includes(role));
