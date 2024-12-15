"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const express_1 = __importDefault(require("express"));
const data_source_1 = require("./data-source");
const StreamManager_1 = require("./services/StreamManager");
const RTMPService_1 = require("./services/RTMPService");
const dj_1 = require("./routes/dj");
const deck_1 = require("./routes/deck");
const broadcast_1 = require("./routes/broadcast");
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)(); // Load environment variables
const app = (0, express_1.default)();
const streamManager = new StreamManager_1.StreamManager();
const rtmpService = new RTMPService_1.RTMPService();
app.use(express_1.default.json());
// Setup routes
app.use("/api/djs", (0, dj_1.createDJRouter)(streamManager));
app.use("/api/decks", (0, deck_1.createDeckRouter)(streamManager));
app.use("/api/broadcasts", (0, broadcast_1.createBroadcastRouter)(streamManager, rtmpService));
// Error handling middleware
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
        error: "Internal server error",
        message: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
});
// Initialize database and start server
async function startServer() {
    try {
        await data_source_1.AppDataSource.initialize();
        console.log("Database initialized");
        await streamManager.initialize();
        console.log("Stream manager initialized");
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    }
    catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}
// Cleanup on shutdown
process.on("SIGTERM", async () => {
    console.log("Received SIGTERM signal. Cleaning up...");
    await streamManager.cleanup();
    await data_source_1.AppDataSource.destroy();
    process.exit(0);
});
startServer();
