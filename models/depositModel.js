const mongoose = require('mongoose');

const DepositSchema = new mongoose.Schema({
    blockNumber: {
        type: String,
        unique: true
    },
    blockTimestamp: Date,
    fee: String,
    hash: String,
    pubkey: String,
}, {
    timestamps: true
});

module.exports = mongoose.model('Deposit', DepositSchema);