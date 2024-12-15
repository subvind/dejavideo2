import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { createDJ } from "../factories/DJFactory";
import { DJ } from "../entities/DJ";
import { Deck } from "../entities/Deck";
import { OBSService } from "../services/OBSService";
import { StreamManager } from "../services/StreamManager";

export class DJController {
  private djRepository = AppDataSource.getRepository(DJ);
  private deckRepository = AppDataSource.getRepository(Deck);
  private streamManager: StreamManager;

  constructor(streamManager: StreamManager) {
    this.streamManager = streamManager;
  }

  public createDJ = async (req: Request, res: Response) => {
    try {
      const { username, email } = req.body;

      // Create new DJ
      const dj = createDJ(username, email);
      await this.djRepository.save(dj);

      // Create decks for DJ
      const deckA = new Deck();
      deckA.type = "A";
      deckA.dj = dj;
      deckA.obsPort = await this.streamManager.allocatePort();

      const deckB = new Deck();
      deckB.type = "B";
      deckB.dj = dj;
      deckB.obsPort = await this.streamManager.allocatePort();

      await this.deckRepository.save([deckA, deckB]);

      // Initialize OBS instances
      await this.streamManager.initializeDJStreams(dj.id);

      res.status(201).json({
        message: "DJ created successfully",
        dj: {
          ...dj,
          decks: [deckA, deckB],
        },
      });
    } catch (error) {
      console.error("Error creating DJ:", error);
      res.status(500).json({ error: "Failed to create DJ" });
    }
  };

  public getDJ = async (req: Request, res: Response) => {
    try {
      const dj = await this.djRepository.findOne({
        where: { id: req.params.id },
        relations: ["decks", "broadcasts"],
      });

      if (!dj) {
        return res.status(404).json({ error: "DJ not found" });
      }

      res.json(dj);
    } catch (error) {
      console.error("Error fetching DJ:", error);
      res.status(500).json({ error: "Failed to fetch DJ" });
    }
  };

  public getAllDJs = async (req: Request, res: Response) => {
    try {
      const djs = await this.djRepository.find({
        relations: ["decks", "broadcasts"],
      });
      res.json(djs);
    } catch (error) {
      console.error("Error fetching DJs:", error);
      res.status(500).json({ error: "Failed to fetch DJs" });
    }
  };

  public updateDJStatus = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const dj = await this.djRepository.findOneBy({ id });
      if (!dj) {
        return res.status(404).json({ error: "DJ not found" });
      }

      dj.status = status;
      await this.djRepository.save(dj);

      if (status === "inactive") {
        await this.streamManager.cleanupDJStreams(id);
      } else if (status === "active") {
        await this.streamManager.initializeDJStreams(id);
      }

      res.json({ message: "DJ status updated", dj });
    } catch (error) {
      console.error("Error updating DJ status:", error);
      res.status(500).json({ error: "Failed to update DJ status" });
    }
  };

  public deleteDJ = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Cleanup streams first
      await this.streamManager.cleanupDJStreams(id);

      // Delete DJ and related entities
      await this.djRepository.delete(id);

      res.json({ message: "DJ deleted successfully" });
    } catch (error) {
      console.error("Error deleting DJ:", error);
      res.status(500).json({ error: "Failed to delete DJ" });
    }
  };
}
