import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Deck } from "../entities/Deck";
import { Video } from "../entities/Video";
import { StreamManager } from "../services/StreamManager";
import * as path from "path";
import { promises as fs } from "fs";

export class DeckController {
  private deckRepository = AppDataSource.getRepository(Deck);
  private videoRepository = AppDataSource.getRepository(Video);
  private streamManager: StreamManager;

  constructor(streamManager: StreamManager) {
    this.streamManager = streamManager;
  }

  public loadVideo = async (req: Request, res: Response) => {
    try {
      const { deckId } = req.params;
      const { videoId } = req.body;

      const deck = await this.deckRepository.findOne({
        where: { id: deckId },
        relations: ["dj"],
      });

      if (!deck) {
        return res.status(404).json({ error: "Deck not found" });
      }

      const video = await this.videoRepository.findOneBy({ id: videoId });
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }

      const obsInstance = this.streamManager.getOBSInstance(
        deck.dj.id,
        deck.type,
      );
      if (!obsInstance) {
        return res.status(500).json({ error: "OBS instance not found" });
      }

      await obsInstance.loadVideo(video);

      deck.currentVideo = video;
      deck.status = "loaded";
      await this.deckRepository.save(deck);

      res.json({ message: "Video loaded successfully", deck });
    } catch (error) {
      console.error("Error loading video:", error);
      res.status(500).json({ error: "Failed to load video" });
    }
  };

  public play = async (req: Request, res: Response) => {
    try {
      const { deckId } = req.params;

      const deck = await this.deckRepository.findOne({
        where: { id: deckId },
        relations: ["dj", "currentVideo"],
      });

      if (!deck) {
        return res.status(404).json({ error: "Deck not found" });
      }

      if (!deck.currentVideo) {
        return res.status(400).json({ error: "No video loaded" });
      }

      const obsInstance = this.streamManager.getOBSInstance(
        deck.dj.id,
        deck.type,
      );
      if (!obsInstance) {
        return res.status(500).json({ error: "OBS instance not found" });
      }

      await obsInstance.play();

      deck.status = "playing";
      await this.deckRepository.save(deck);

      res.json({ message: "Playback started", deck });
    } catch (error) {
      console.error("Error starting playback:", error);
      res.status(500).json({ error: "Failed to start playback" });
    }
  };

  public stop = async (req: Request, res: Response) => {
    try {
      const { deckId } = req.params;

      const deck = await this.deckRepository.findOne({
        where: { id: deckId },
        relations: ["dj"],
      });

      if (!deck) {
        return res.status(404).json({ error: "Deck not found" });
      }

      const obsInstance = this.streamManager.getOBSInstance(
        deck.dj.id,
        deck.type,
      );
      if (!obsInstance) {
        return res.status(500).json({ error: "OBS instance not found" });
      }

      await obsInstance.stop();

      deck.status = "stopped";
      await this.deckRepository.save(deck);

      res.json({ message: "Playback stopped", deck });
    } catch (error) {
      console.error("Error stopping playback:", error);
      res.status(500).json({ error: "Failed to stop playback" });
    }
  };

  public getDeckStatus = async (req: Request, res: Response) => {
    try {
      const { deckId } = req.params;

      const deck = await this.deckRepository.findOne({
        where: { id: deckId },
        relations: ["dj", "currentVideo"],
      });

      if (!deck) {
        return res.status(404).json({ error: "Deck not found" });
      }

      res.json(deck);
    } catch (error) {
      console.error("Error fetching deck status:", error);
      res.status(500).json({ error: "Failed to fetch deck status" });
    }
  };
}
