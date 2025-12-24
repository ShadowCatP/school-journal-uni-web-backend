export type Role = "student" | "parent" | "teacher" | "school_staff" | "admin";

export interface UserPayload {
  user_id: number;
  email: string;
  role: Role;
}
