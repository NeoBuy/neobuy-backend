import type { RowDataPacket } from 'mysql2';

export interface UserRow extends RowDataPacket {
  id: number;
  merchant_id: number | null;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  status: 'ACTIVE' | 'BLOCKED' | 'PENDING';
  created_at: Date;
  updated_at: Date;
}

export interface UserPublicRow extends RowDataPacket {
  id: number;
  email: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'BLOCKED' | 'PENDING';
  merchant_id: number | null;
  created_at: Date;
}

export interface RoleCodeRow extends RowDataPacket {
  code: string;
}

export interface RoleIdRow extends RowDataPacket {
  id: number;
}

export interface MerchantIdRow extends RowDataPacket {
  id: number;
}

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface ProductListRow extends RowDataPacket {
  id: number;
  title: string;
  description: string | null;
  status: ProductStatus;
  created_at: Date;
}

export interface ProductRow extends ProductListRow {
  merchant_id: number;
  updated_at: Date;
}

export interface CreateUserData {
  merchant_id: number | null;
  email: string | null;
  phone: string | null;
  password_hash: string;
}
