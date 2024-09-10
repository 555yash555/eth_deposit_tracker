const Deposit = require("../models/depositModel");

// Get all deposits
const getAllDeposits = async (req, res) => {
  try {
    const deposits = await Deposit.find();
    // console.log(deposits);
    res.render("view", { deposits });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching deposits.");
  }
};
const getAllDepositsJson = async (req, res) => {
    try {
      const deposits = await Deposit.find();
      res.json(deposits);
    } catch (error) {
      console.error(error);
      res.status(500).send("Error fetching deposits.");
    }
  };

module.exports = {
  getAllDeposits,
getAllDepositsJson
};
