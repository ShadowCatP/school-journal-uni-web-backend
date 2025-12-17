import type { RowDataPacket } from "mysql2/promise";

export type User = {
  user_id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  pesel: string;
  created_at: Date;
  updated_at: Date;
};

export type UserRow = RowDataPacket & User;
