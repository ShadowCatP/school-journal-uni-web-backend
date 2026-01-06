import express from "express";
import cors from "cors";
import config from "./config/config";

import indexRoutes from "./routes/index";
import studentRoutes from './routes/student';
import adminRoutes from './routes/admin';
import teacherRoutes from './routes/teacher';
import parentRoutes from './routes/parent';
import staffRoutes from './routes/staff';


const app = express();

app.use(
  cors({
    origin: "http://localhost:5173", 
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true 
  })
);

app.use(express.json());


app.use(indexRoutes); 


app.use("/api/student", studentRoutes);
app.use("/api/teacher", teacherRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/staff', staffRoutes);


app.listen(config.port, () => {
  console.log(`Server is running on port: ${config.port}`);
});