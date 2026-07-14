import type { Role } from '../types';

export type BadgeKey = 'today' | 'pending-docs' | 'pending-payments' | 'alerts' | null;

export type NavDesk = 'import' | 'export' | 'both';

export interface NavDef {
  key: string;
  label: string;
  path: string;
  roles: Role[];
  badge: BadgeKey;
  desk: NavDesk;
}

const ALL: Role[] = ['admin', 'import_manager', 'accountant'];

/** Sidebar / role-aware navigation (§3). Order is the display order. */
export const NAV: NavDef[] = [
  { key: 'today', label: 'Today', path: '/today', roles: ALL, badge: 'today', desk: 'import' },
  { key: 'home', label: 'Dashboard', path: '/', roles: ALL, badge: null, desk: 'import' },
  { key: 'calendar', label: 'Calendar', path: '/calendar', roles: ALL, badge: null, desk: 'import' },
  { key: 'files', label: 'Files', path: '/files', roles: ALL, badge: null, desk: 'import' },
  { key: 'exports', label: 'Export Files', path: '/exports', roles: ALL, badge: null, desk: 'export' },
  { key: 'pending-docs', label: 'Pending Docs', path: '/pending-docs', roles: ['admin', 'import_manager'], badge: 'pending-docs', desk: 'import' },
  { key: 'pending-payments', label: 'Pending Payments', path: '/pending-payments', roles: ['admin', 'accountant'], badge: 'pending-payments', desk: 'import' },
  { key: 'cha', label: 'CHA Desk', path: '/cha-desk', roles: ['admin', 'import_manager'], badge: null, desk: 'import' },
  { key: 'reports', label: 'Reports', path: '/reports', roles: ALL, badge: null, desk: 'import' },
  { key: 'settings', label: 'Settings', path: '/settings', roles: ALL, badge: null, desk: 'both' },
];

export const navForRole = (role: Role): NavDef[] => NAV.filter((n) => n.roles.includes(role));

export const navFor = (desk: 'import' | 'export', role: Role): NavDef[] =>
  NAV.filter((n) => (n.desk === 'both' || n.desk === desk) && n.roles.includes(role));
