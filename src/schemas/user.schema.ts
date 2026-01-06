import type { RowDataPacket } from "mysql2/promise";

export type User = {
  userId: number;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string;
  pesel: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UserWithPassword = User & { passwordHash: string };

export type UserRow = RowDataPacket & User;
