import express from "express";
import indexRoutes from "./routes/index";
import config from "./config/config";

const app = express();
app.use(express.json());

app.use(indexRoutes);

app.listen(config.port, () => {
  console.log(`Server is running on port: ${config.port}`);
});
