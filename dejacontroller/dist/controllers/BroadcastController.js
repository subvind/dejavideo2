"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadcastController = void 0;
const data_source_1 = require("../data-source");
const Broadcast_1 = require("../entities/Broadcast");
const DJ_1 = require("../entities/DJ");
class BroadcastController {
    constructor(streamManager, rtmpService) {
        this.broadcastRepository = data_source_1.AppDataSource.getRepository(Broadcast_1.Broadcast);
        this.djRepository = data_source_1.AppDataSource.getRepository(DJ_1.DJ);
        this.startBroadcast = async (req, res) => {
            try {
                const { djId } = req.params;
                const { channelId } = req.body;
                const dj = await this.djRepository.findOne({
                    where: { id: djId },
                    relations: ["decks"],
                });
                if (!dj) {
                    return res.status(404).json({ error: "DJ not found" });
                }
                // Check if both decks are ready
                const decksReady = dj.decks.every((deck) => this.rtmpService.isStreamActive(dj.id, deck.type));
                if (!decksReady) {
                    return res.status(400).json({ error: "Both decks must be streaming" });
                }
                // Create new broadcast
                const broadcast = new Broadcast_1.Broadcast();
                broadcast.channelId = channelId;
                broadcast.dj = dj;
                broadcast.status = "live";
                broadcast.streamStats = {
                    viewers: 0,
                    startTime: new Date(),
                    bitrate: 0,
                };
                await this.broadcastRepository.save(broadcast);
                res.json({
                    message: "Broadcast started",
                    broadcast,
                    streamUrl: `rtmp://localhost:1935/live/${dj.id}/broadcast/${channelId}`,
                });
            }
            catch (error) {
                console.error("Error starting broadcast:", error);
                res.status(500).json({ error: "Failed to start broadcast" });
            }
        };
        this.updateCrossfader = async (req, res) => {
            try {
                const { broadcastId } = req.params;
                const { position } = req.body;
                if (position < 0 || position > 1) {
                    return res
                        .status(400)
                        .json({ error: "Position must be between 0 and 1" });
                }
                const broadcast = await this.broadcastRepository.findOne({
                    where: { id: broadcastId },
                    relations: ["dj"],
                });
                if (!broadcast) {
                    return res.status(404).json({ error: "Broadcast not found" });
                }
                broadcast.crossfaderPosition = position;
                await this.broadcastRepository.save(broadcast);
                // Update the broadcast mix
                // Implementation depends on your mixing strategy
                res.json({ message: "Crossfader updated", broadcast });
            }
            catch (error) {
                console.error("Error updating crossfader:", error);
                res.status(500).json({ error: "Failed to update crossfader" });
            }
        };
        this.stopBroadcast = async (req, res) => {
            try {
                const { broadcastId } = req.params;
                const broadcast = await this.broadcastRepository.findOne({
                    where: { id: broadcastId },
                    relations: ["dj"],
                });
                if (!broadcast) {
                    return res.status(404).json({ error: "Broadcast not found" });
                }
                broadcast.status = "offline";
                await this.broadcastRepository.save(broadcast);
                res.json({ message: "Broadcast stopped", broadcast });
            }
            catch (error) {
                console.error("Error stopping broadcast:", error);
                res.status(500).json({ error: "Failed to stop broadcast" });
            }
        };
        this.getBroadcastStatus = async (req, res) => {
            try {
                const { broadcastId } = req.params;
                const broadcast = await this.broadcastRepository.findOne({
                    where: { id: broadcastId },
                    relations: ["dj"],
                });
                if (!broadcast) {
                    return res.status(404).json({ error: "Broadcast not found" });
                }
                res.json(broadcast);
            }
            catch (error) {
                console.error("Error fetching broadcast status:", error);
                res.status(500).json({ error: "Failed to fetch broadcast status" });
            }
        };
        this.streamManager = streamManager;
        this.rtmpService = rtmpService;
    }
}
exports.BroadcastController = BroadcastController;
