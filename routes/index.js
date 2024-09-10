const express = require("express");
const router = express.Router();
const depositController = require("../controllers/depositController");

// View all deposits
router.get("/deposits", depositController.getAllDeposits);
router.get("/depositsjson", depositController.getAllDepositsJson);

module.exports = router;
