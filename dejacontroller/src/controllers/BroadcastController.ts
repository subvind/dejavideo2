import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Broadcast } from "../entities/Broadcast";
import { DJ } from "../entities/DJ";
import { StreamManager } from "../services/StreamManager";
import { RTMPService } from "../services/RTMPService";

export class BroadcastController {
  private broadcastRepository = AppDataSource.getRepository(Broadcast);
  private djRepository = AppDataSource.getRepository(DJ);
  private streamManager: StreamManager;
  private rtmpService: RTMPService;

  constructor(streamManager: StreamManager, rtmpService: RTMPService) {
    this.streamManager = streamManager;
    this.rtmpService = rtmpService;
  }

  public startBroadcast = async (req: Request, res: Response) => {
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

      // Check if OBS instances are connected
      const obsInstances = dj.decks.map((deck) =>
        this.streamManager.getOBSInstance(dj.id, deck.type),
      );

      if (obsInstances.some((obs) => !obs?.isConnected())) {
        return res.status(400).json({
          error:
            "OBS instances not ready. Please ensure OBS Studio is running.",
        });
      }

      // Check if both decks are ready
      const decksReady = dj.decks.every((deck) =>
        this.rtmpService.isStreamActive(dj.id, deck.type),
      );

      if (!decksReady) {
        return res.status(400).json({ error: "Both decks must be streaming" });
      }

      // Create new broadcast
      const broadcast = new Broadcast();
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
    } catch (error) {
      console.error("Error starting broadcast:", error);
      res.status(500).json({ error: "Failed to start broadcast" });
    }
  };

  public updateCrossfader = async (req: Request, res: Response) => {
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

      this.streamManager.setCrossfader(broadcast.dj.id, position);
      console.log("====== crossfader updated", position, broadcast.dj.id);

      res.json({ message: "Crossfader updated", position });
    } catch (error) {
      console.error("Error updating crossfader:", error);
      res.status(500).json({ error: "Failed to update crossfader" });
    }
  };

  public stopBroadcast = async (req: Request, res: Response) => {
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
    } catch (error) {
      console.error("Error stopping broadcast:", error);
      res.status(500).json({ error: "Failed to stop broadcast" });
    }
  };

  public getBroadcastStatus = async (req: Request, res: Response) => {
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
    } catch (error) {
      console.error("Error fetching broadcast status:", error);
      res.status(500).json({ error: "Failed to fetch broadcast status" });
    }
  };
}
