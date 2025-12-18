import express from "express";
import cors from "cors";
import indexRoutes from "./routes/index";
import config from "./config/config";

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.use(express.json());

app.use(indexRoutes);

app.listen(config.port, () => {
  console.log(`Server is running on port: ${config.port}`);
});
