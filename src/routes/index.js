const { Router } = require("express");
const pool = require("../config/database");

const router = Router();

router.get("/", (req, res) => {
  res.send("Hello World");
});

router.get("/db", async (req, res) => {
  try {
    const [result] = await pool.query("SELECT NOW()");
    res.json(result[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error while connecting to database" });
  }
});

module.exports = router;
