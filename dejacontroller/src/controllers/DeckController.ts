import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Deck } from "../entities/Deck";
import { Video } from "../entities/Video";
import { StreamManager } from "../services/StreamManager";
import * as path from "path";
import { promises as fs } from "fs";
import { Not } from "typeorm";

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

      console.log(`Loading video ${videoId} into deck ${deckId}`);

      const deck = await this.deckRepository.findOne({
        where: { id: deckId },
        relations: ["dj"],
      });

      if (!deck) {
        console.error(`Deck not found: ${deckId}`);
        return res.status(404).json({ error: "Deck not found" });
      }

      // Debug logging
      console.log(`Found deck: `, deck);
      console.log(`DJ ID: ${deck.dj.id}, Deck Type: ${deck.type}`);

      const video = await this.videoRepository.findOneBy({ id: videoId });
      if (!video) {
        console.error(`Video not found: ${videoId}`);
        return res.status(404).json({ error: "Video not found" });
      }

      const obsInstance = this.streamManager.getOBSInstance(
        deck.dj.id,
        deck.type,
      );

      // Add debug logging
      if (!obsInstance) {
        console.error(
          `No OBS instance found for DJ ${deck.dj.id} Deck ${deck.type}`,
        );
        return res.status(500).json({ error: "OBS instance not found" });
      }

      console.log(`OBS instance found, loading video...`);

      await obsInstance.loadVideo(video);

      deck.currentVideo = video;
      deck.status = "loaded";
      await this.deckRepository.save(deck);

      console.log(`Successfully loaded video. Deck status: ${deck.status}`);

      res.json({
        message: "Video loaded successfully",
        deck: {
          id: deck.id,
          type: deck.type,
          status: deck.status,
          currentVideo: deck.currentVideo,
          streamHealth: deck.streamHealth,
        },
      });
    } catch (error) {
      console.error("Error loading video:", error);
      res.status(500).json({ error: "Failed to load video" });
    }
  };

  public play = async (req: Request, res: Response) => {
    console.log("play");
    try {
      const { deckId } = req.params;
      console.log("Going to play deckId:", deckId);

      const deck = await this.deckRepository.findOne({
        where: { id: deckId },
        relations: ["dj", "currentVideo"],
      });

      if (!deck) {
        console.error(`Deck not found: ${deckId}`);
        return res.status(404).json({ error: "Deck not found" });
      }

      if (!deck.currentVideo) {
        console.error(`Deck currentVideo not found`);
        return res.status(400).json({ error: "No video loaded" });
      }

      const obsInstance = this.streamManager.getOBSInstance(
        deck.dj.id,
        deck.type,
      );
      if (!obsInstance) {
        console.error(
          `No OBS instance found for DJ ${deck.dj.id} Deck ${deck.type}`,
        );
        return res.status(500).json({ error: "OBS instance not found" });
      }

      await obsInstance.play();

      console.log("Sucessfully played video", deck.currentVideo.id);

      // update Deck status
      deck.status = "playing";
      // Update DJ status to active when deck starts playing
      deck.dj.status = "active";

      await this.deckRepository.save(deck);

      // Fetch updated deck status
      const updatedDeck = await this.deckRepository.findOne({
        where: { id: deckId },
        relations: ["dj", "currentVideo"],
      });

      res.json({ message: "Playback started", deck: updatedDeck });
    } catch (error) {
      console.error("Error starting playback:", error);
      res.status(500).json({ error: "Failed to start playback" });
    }
  };

  public stop = async (req: Request, res: Response) => {
    console.log("stop");
    try {
      const { deckId } = req.params;
      console.log("Going to stop deckId:", deckId);

      const deck = await this.deckRepository.findOne({
        where: { id: deckId },
        relations: ["dj", "currentVideo"],
      });

      if (!deck) {
        console.error(`Deck not found: ${deckId}`);
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

      console.log("Sucessfully stopped video", deck.currentVideo?.id);

      // Update Deck Status
      deck.status = "stopped";

      // Check if DJ has any other playing decks
      const otherPlayingDeck = await this.deckRepository.findOne({
        where: {
          dj: { id: deck.dj.id },
          status: "playing",
          id: Not(deck.id), // Exclude current deck
        },
      });

      // If no other decks are playing, set DJ status to inactive
      if (!otherPlayingDeck) {
        deck.dj.status = "inactive";
      }

      await this.deckRepository.save(deck);

      // Fetch updated deck status
      const updatedDeck = await this.deckRepository.findOne({
        where: { id: deckId },
        relations: ["dj", "currentVideo"],
      });

      res.json({ message: "Playback stopped", deck: updatedDeck });
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
        console.log("Deck not found", deckId);
        return res.status(404).json({ error: "Deck not found" });
      }

      console.log("Found deck", deck.id);

      res.json(deck);
    } catch (error) {
      console.error("Error fetching deck status:", error);
      res.status(500).json({ error: "Failed to fetch deck status" });
    }
  };
}
