const express = require("express");
const router = express.Router();

const iceConfig = require("../config/ice");

router.get("/ice-config", (req, res) => {
  res.json(iceConfig);
});

module.exports = router;
