import "reflect-metadata";
import express from "express";
import { AppDataSource } from "./data-source";
import { StreamManager } from "./services/StreamManager";
import { RTMPService } from "./services/RTMPService";
import { createDJRouter } from "./routes/dj";
import { createDeckRouter } from "./routes/deck";
import { createBroadcastRouter } from "./routes/broadcast";
import { config } from "dotenv";
import path from "path";

config(); // Load environment variables

const app = express();
const streamManager = new StreamManager();
const rtmpService = new RTMPService();

app.use(express.json());

// Setup routes
app.use("/api/djs", createDJRouter(streamManager));
app.use("/api/decks", createDeckRouter(streamManager));
app.use("/api/broadcasts", createBroadcastRouter(streamManager, rtmpService));
app.use("/media", express.static(path.join(__dirname, "../media")));

// Create default media directory if it doesn't exist
import fs from "fs";
const mediaDir = path.join(__dirname, "../media");
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  },
);

// Initialize database and start server
async function startServer() {
  try {
    await AppDataSource.initialize();
    console.log("Database initialized");

    // Initialize RTMP service first
    const rtmpService = RTMPService.getInstance();
    try {
      await rtmpService.initialize();
      console.log(`RTMP service initialized`);
    } catch (error) {
      console.error("Failed to initialize RTMP service:", error);
      throw error;
    }

    // Then initialize stream manager
    try {
      await streamManager.initialize();
      console.log("Stream manager initialized");
    } catch (error) {
      console.error("Failed to initialize stream manager:", error);
      throw error;
    }

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`API Server running on port ${PORT}`);
      console.log(
        `RTMP Server running on port ${process.env.RTMP_PORT || 1935}`,
      );
      console.log(
        `RTMP HTTP Server running on port ${process.env.RTMP_HTTP_PORT || 8000}`,
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    await cleanup();
    process.exit(1);
  }
}

async function cleanup() {
  console.log("Cleaning up...");
  try {
    await streamManager.cleanup();
    await rtmpService.stop();
    await AppDataSource.destroy();
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

// Proper shutdown handling
process.on("SIGTERM", async () => {
  console.log("Received SIGTERM signal");
  await cleanup();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT signal");
  await cleanup();
  process.exit(0);
});

startServer();
