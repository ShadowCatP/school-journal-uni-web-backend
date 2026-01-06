import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../config/config";
import { UserPayload, Role } from "../types/auth";

export interface AuthRequest extends Request {
  user?: UserPayload;
}

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, config.jwtSecret, (err, user) => {
    if (err) {
      return res.sendStatus(403);
    }
    

    (req as AuthRequest).user = user as UserPayload;
    next();
  });
};

export const authorizeRoles = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    if (!authReq.user) {
      return res.sendStatus(401);
    }
    if (!roles.includes(authReq.user.role)) {
      return res.sendStatus(403);
    }
    next();
  };
};
