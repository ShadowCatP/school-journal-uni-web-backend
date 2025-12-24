export type Role = "student" | "parent" | "teacher" | "staff" | "admin";

export interface UserPayload {
  userId: number;
  email: string;
  role: Role;
}
