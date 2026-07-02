import {
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarDays,
  Container,
  FileWarning,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Ship,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export const NAV_ICONS: Record<string, LucideIcon> = {
  today: CalendarCheck,
  home: LayoutDashboard,
  calendar: CalendarDays,
  files: FolderOpen,
  'pending-docs': FileWarning,
  'pending-payments': Wallet,
  cha: Ship,
  tracking: Container,
  reports: BarChart3,
  settings: Settings,
  alerts: Bell,
};

// Fallback so an un-mapped nav key never renders `undefined` (white screen).
export const NAV_ICON_FALLBACK: LucideIcon = FolderOpen;
