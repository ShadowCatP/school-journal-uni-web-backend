export type Role = "student" | "parent" | "teacher" | "staff" | "admin";

export interface UserPayload {
  id: number;
  email: string;
  role: Role;
}
