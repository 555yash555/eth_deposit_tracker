const { ethers, Interface } = require("ethers");
const Block = require("../models/blockModel");
const Deposit = require("../models/depositModel");
const winston = require("winston");
const { io } = require("../index");
require("dotenv").config();
// Configure winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "logs/blockController.log" }),
  ],
});

// Ethereum WebSocket RPC setup
const infuraWsUrl = process.env.INFURA_WS_URL;
console.log(infuraWsUrl);
let provider = new ethers.WebSocketProvider(infuraWsUrl);

// Beacon Deposit Contract Address
const beaconDepositContract = "0x00000000219ab540356cBB839Cbe05303d7705Fa";

// Function to fetch and store the latest 100 blocks
const syncLatestBlocks = async () => {
  try {
    const latestBlockNumber = await provider.getBlockNumber();
    const currentBlockNumber = BigInt(latestBlockNumber);

    logger.info(
      `Syncing from block ${
        currentBlockNumber - BigInt(10)
      } to ${currentBlockNumber}`
    );

    for (
      let i = currentBlockNumber;
      i >= currentBlockNumber - BigInt(10);
      i--
    ) {
      const block = await provider.getBlock(Number(i));
      const newBlock = new Block({
        blockNumber: block.number.toString(),
        blockTimestamp: new Date(Number(block.timestamp) * 1000),
        fee: block.gasUsed.toString(),
        hash: block.hash,
      });

      try {
        await newBlock.save();
      } catch (err) {
        logger.info("Block already exists in database.");
      }
    }

    logger.info(`Blocks synced successfully up to ${currentBlockNumber}`);
  } catch (error) {
    console.error("Error syncing blocks:", error);
  }
};

const trackDepositLive = async (io) => {
  //   io.emit("live tracking established").then(() => {
  //     console.log("live tracking established");
  // //   });
  let deposits = [];

  const processBlock = async (blockNumber) => {
    try {
      const block = await provider.getBlock(blockNumber, true);
      logger.info(`Processing block ${block.number}`);

      try {
        const newBlock = new Block({
          blockNumber: block.number.toString(),
          blockTimestamp: new Date(Number(block.timestamp) * 1000),
          fee: block.gasUsed.toString(),
          hash: block.hash.toString(),
        });
        await newBlock.save();
        logger.info(`Block ${block.number} saved in database.`);
      } catch (err) {
        logger.info("Block already exists in database.");
      }

      if (block.transactions) {
        for (const tx of block.transactions) {
          if (tx && tx.to === beaconDepositContract) {
            try {
              const transaction = await provider.getTransaction(tx.hash);
              const receipt = await provider.getTransactionReceipt(tx.hash);
              console.log("Transaction:", transaction);
              if (receipt) {
                const newDeposit = new Deposit({
                  blockNumber: receipt.blockNumber.toString(),
                  blockTimestamp: new Date(block.timestamp * 1000),
                  fee: transaction.gasPrice.toString(),
                  hash: tx.hash.toString(),
                  pubkey: transaction.from,
                });
                deposits.push(newDeposit);
                logger.info("New deposit tracked:", newDeposit);

                if (deposits.length >= 100) {
                  await Deposit.insertMany(deposits);
                  logger.info(
                    `Batch of ${deposits.length} deposits saved to database.`
                  );
                  deposits = [];
                }
              }
            } catch (error) {
              logger.error(`Error processing transaction ${tx.hash}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error processing block:", error);
    }
  };

  const depositEventABI = [
    "event DepositEvent(bytes pubkey, bytes withdrawal_credentials, bytes amount, bytes signature, bytes index)",
  ];

  const subscribeToDeposits = async () => {
    logger.info("Subscribing to Beacon Deposit Contract events");
    try {
      const contract = new ethers.Contract(
        beaconDepositContract,
        depositEventABI,
        provider
      );
      contract.on(
        "DepositEvent",
        async (
          pubkey,
          withdrawal_credentials,
          amount,
          signature,
          index,
          event
        ) => {
          try {
            console.log("Event:deposit fetched");
            const block = await provider.getBlock(event.blockNumber);
            console.log("Block:", block);
            console.log(event);
            console.log(event.log.transactionHash);
            const transaction = await provider.getTransaction(
              event.log.transactionHash
            );
            console.log("Transaction:", transaction);
            const iface = new Interface(depositEventABI);

            // Assuming you have the eventObject from your previous example
            const eventData = event.log.data;
            const eventTopics = event.log.topics;

            // Decode the event data
            const decodedData = iface.parseLog({
              data: eventData,
              topics: eventTopics,
            });

            // Get the pubkey from the decoded data
            const pubkey = decodedData.args[0];

            console.log("Pubkey:", pubkey);
            const newDeposit = new Deposit({
              blockNumber: transaction.blockNumber.toString(),
              blockTimestamp: new Date(block.timestamp * 1000),
              fee: transaction.gasPrice.toString(),
              hash: event.log.transactionHash,
              pubkey: pubkey,
            });
            io.emit("newDeposit", newDeposit);
            try {
              await newDeposit.save();

              logger.info("New deposit saved to database:", newDeposit);
            } catch (error) {
              if (error.code === 11000) {
                logger.info(
                  "Duplicate deposit detected, not adding to database:",
                  newDeposit
                );
              } else {
                logger.error("Error saving deposit:", error);
              }
            }
          } catch (error) {
            logger.error("Error processing log data:", error);
          }
        }
      );

      logger.info("Successfully subscribed to Beacon Deposit Contract events");
    } catch (error) {
      logger.error(
        "Error subscribing to Beacon Deposit Contract events:",
        error
      );
    }
  };

  //   provider.on("block", async (blockNumber) => {
  //     logger.info("New block: ", blockNumber);
  //     processBlock(blockNumber).catch(console.error);
  //   });

  const heartbeat = async () => {
    try {
      await provider.getBlockNumber();
    } catch (error) {
      console.error("Heartbeat error:", error);
      provider.removeAllListeners();
      setupWebSocketProvider();
    }
  };

  setInterval(heartbeat, 30000);

  subscribeToDeposits();
};

const setupWebSocketProvider = () => {
  provider = new ethers.WebSocketProvider(infuraWsUrl);
  provider._websocket.on("error", async (e) => {
    console.error("WS Error", e);
    await reconnect();
  });
  provider._websocket.on("close", async (e) => {
    console.log("WS closed");
    await reconnect();
  });
};

const reconnect = async () => {
  console.log("Reconnecting...");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  //   setupWebSocketProvider();
  trackDepositLive();
};

// setupWebSocketProvider();

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

const fetchAndStorePreviousDeposits = async () => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const BLOCKS_TO_FETCH = BigInt(50);

  try {
    const depositEventABI = [
      "event DepositEvent(bytes pubkey, bytes withdrawal_credentials, bytes amount, bytes signature, bytes index)",
    ];
    const contract = new ethers.Contract(
      beaconDepositContract,
      depositEventABI,
      provider
    );

    const latestBlockNumber = BigInt(await provider.getBlockNumber());
    const startBlock =
      latestBlockNumber - BLOCKS_TO_FETCH > 0n
        ? latestBlockNumber - BLOCKS_TO_FETCH
        : 0n;

    logger.info(
      `Fetching deposits from block ${startBlock.toString()} to ${latestBlockNumber.toString()}`
    );

    const filter = contract.filters.DepositEvent();
    const events = await contract.queryFilter(
      filter,
      startBlock,
      latestBlockNumber
    );

    const iface = new ethers.Interface(depositEventABI);

    for (const event of events) {
      const block = await provider.getBlock(event.blockNumber);
      const transaction = await provider.getTransaction(event.transactionHash);

      const eventData = event.data;
      const eventTopics = event.topics;

      const decodedData = iface.parseLog({
        data: eventData,
        topics: eventTopics,
      });
      const pubkey = decodedData.args[0];

      const newDeposit = new Deposit({
        blockNumber: event.blockNumber.toString(),
        blockTimestamp: new Date(Number(block.timestamp) * 1000),
        fee: transaction.gasPrice.toString(),
        hash: event.transactionHash,
        pubkey: pubkey,
      });

      try {
        await newDeposit.save();
        logger.info("New deposit saved to database:", newDeposit);
      } catch (error) {
        if (error.code === 11000) {
          logger.info(
            "Duplicate deposit detected, not adding to database:",
            newDeposit
          );
        } else {
          logger.error("Error saving deposit:", error);
        }
      }

      await delay(100);
    }

    logger.info("All previous deposits fetched and saved.");
  } catch (error) {
    logger.error("Error fetching previous deposits:", error);
  }
};

module.exports = {
  syncLatestBlocks,
  trackDepositLive,
  fetchAndStorePreviousDeposits,
};
