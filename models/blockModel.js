const mongoose = require('mongoose');

const BlockSchema = new mongoose.Schema({
    blockNumber: {
        type: String,
        unique: true
    },
    blockTimestamp: Date,
    fee: String,
    pubkey: String,
    hash: String,
}, {
    timestamps: true
});

module.exports = mongoose.model('Block', BlockSchema);
