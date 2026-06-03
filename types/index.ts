export interface Product {
  id?: string;
  name: string;
  code: string;
  barcode: string;
  cost: number;
  list: number;
  stock: number;
  photo?: string;
  catName: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
}

export interface Sale {
  id?: string;
  customer: string;
  items: SaleItem[];
  total: number;
  date: unknown;
  status: 'completed' | 'pending' | 'cancelled';
  note?: string;
}

export interface StockMove {
  id?: string;
  productId: string;
  productName: string;
  type: 'in' | 'out';
  qty: number;
  note: string;
  date: unknown;
}

export interface OfferItem {
  productId: string;
  name: string;
  qty: number;
  listPrice: number;
  cost: number;
  discountRate: number;
  finalPrice: number;
  photo?: string;
}

export interface Offer {
  id?: string;
  no: string;
  customer: string;
  by: string;
  approvedBy?: string;
  items: OfferItem[];
  total: number;
  status: 'pending' | 'approved' | 'rejected';
  date: unknown;
  discountEnabled: boolean;
  discountRate?: number;
  note?: string;
}

export interface Category {
  id?: string;
  name: string;
  prefix: string;
  desc: string;
}

export interface AppUser {
  id?: string;
  name: string;
  email: string;
  role: 'admin' | 'atolye' | 'sales';
  uid: string;
  active: boolean;
}

export interface Task {
  id?: string;
  title: string;
  description: string;
  assignedTo: string;
  assignedToName: string;
  price: number;
  showPriceToWorkshop: boolean;
  status: 'todo' | 'in_progress' | 'done';
  category: string;
  createdBy: string;
  createdByName: string;
  createdAt: unknown;
  startedAt: unknown;
  completedAt: unknown;
  note: string;
}

export type PermissionKey =
  | 'products' | 'stock' | 'sales' | 'offers'
  | 'categories' | 'users' | 'settings' | 'tasks' | 'my-tasks';

export interface Permissions {
  admin: PermissionKey[];
  atolye: PermissionKey[];
  sales: PermissionKey[];
}

export interface DiscountTier {
  qty: number;
  rate: number;
}

export interface MainSettings {
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  firmEmail: string;
  offerTerms: string;
  bankInfo: string;
  invoiceInfo: string;
  discounts: DiscountTier[];
}
