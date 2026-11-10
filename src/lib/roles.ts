export const ROLES = ['superadmin', 'admin', 'manager', 'accountant'] as const
export type Role = typeof ROLES[number]
