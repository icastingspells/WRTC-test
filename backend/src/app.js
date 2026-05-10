const express = require("express");
const cors = require("cors");

const iceRoutes = require("./routes/ice.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("backend is alive");
});

app.use("/api", iceRoutes);

module.exports = app;
