import {
  BarChart3,
  Bell,
  FileWarning,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Ship,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export const NAV_ICONS: Record<string, LucideIcon> = {
  home: LayoutDashboard,
  files: FolderOpen,
  'pending-docs': FileWarning,
  'pending-payments': Wallet,
  cha: Ship,
  reports: BarChart3,
  settings: Settings,
  alerts: Bell,
};
