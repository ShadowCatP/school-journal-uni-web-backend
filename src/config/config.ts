import dotenv from "dotenv";

dotenv.config();

interface Config {
  port: number;
  db?: {
    host: string;
    user: string;
    password: string;
    database: string;
    port: number;
  };
}

const config: Config = {
  port: Number(process.env.PORT) || 3000,
  db:
    process.env.DB_HOST && process.env.DB_USER && process.env.DB_DATABASE ?
      {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD ?? "",
        database: process.env.DB_DATABASE,
        port: Number(process.env.DB_PORT) || 3306,
      }
    : undefined,
};

export default config;
