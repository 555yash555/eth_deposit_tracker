const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const depositRoutes = require("./routes/index");
const http = require("http");
const dbConfig = require("./config/db");
const blockController = require("./controllers/blockController");
const path = require("path");
const Deposit = require("./models/depositModel");
require("dotenv").config();
("./models/depositModel");
const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// Your existing middleware and route setup...

// Set up your routes
// app.use('/api', apiRoutes);

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});
// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
// blockController(io);
app.set("views", path.join(__dirname, "views"));
// Connect to MongoDB
app.get("/", (req, res) => {
  res.render("view"); // Ensure 'index.ejs' exists in the 'views' directory
});

mongoose
  .connect(process.env.MONGO_DB_URI || dbConfig.url, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log("Connected to MongoDB");
    // Start syncing blocks when the server starts
    //  const depositCount = await Deposit.countDocuments();
    //     if (depositCount === 0) {
    //         console.log('Deposits collection is empty. Fetching previous deposits...');
    //         await blockController.fetchAndStorePreviousDeposits();
    //     } else {
    //         console.log('Deposits collection is not empty. Skipping fetch of previous deposits.');
    //     }
    blockController.fetchAndStorePreviousDeposits().then(() => {
      console.log(
        "previous 1000 blocks checked for deposists and database updated synchronization completed."
      );
      blockController.trackDepositLive(io); // Start live updates after syncing
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB", err);
  });

app.use("/", depositRoutes);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
// module.exports = { io };
