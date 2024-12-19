import { EventEmitter } from "events";
import { FFmpegService } from "./FFmpegService";
import { RTMPService } from "./RTMPService";
import { AppDataSource } from "../data-source";
import { DJ } from "../entities/DJ";
import { Deck } from "../entities/Deck";

export class StreamManager {
  private ffmpegInstances: Map<string, FFmpegService> = new Map();
  private rtmpService: RTMPService;

  constructor() {
    this.rtmpService = RTMPService.getInstance();
  }

  public async initialize(): Promise<void> {
    try {
      // Start RTMP service
      await this.rtmpService.start();

      // Initialize streams for active DJs
      const djRepository = AppDataSource.getRepository(DJ);
      const activeDJs = await djRepository.find({
        where: { status: "active" },
        relations: ["decks"],
      });

      for (const dj of activeDJs) {
        await this.initializeDJStreams(dj.id);
      }
    } catch (error) {
      console.error("Failed to initialize StreamManager:", error);
      throw error;
    }
  }

  public async initializeDJStreams(djId: string): Promise<void> {
    try {
      const deckRepository = AppDataSource.getRepository(Deck);
      const decks = await deckRepository.find({
        where: { dj: { id: djId } },
        relations: ["dj"],
      });

      for (const deck of decks) {
        const key = `${djId}_${deck.type}`;
        const ffmpegService = new FFmpegService(deck);
        this.ffmpegInstances.set(key, ffmpegService);
      }
    } catch (error) {
      console.error(`Failed to initialize streams for DJ ${djId}:`, error);
      throw error;
    }
  }

  public getFFmpegInstance(
    djId: string,
    deckType: "A" | "B",
  ): FFmpegService | undefined {
    const key = `${djId}_${deckType}`;
    return this.ffmpegInstances.get(key);
  }

  public async setCrossfader(djId: string, position: number): Promise<void> {
    try {
      const deckA = this.getFFmpegInstance(djId, "A");
      const deckB = this.getFFmpegInstance(djId, "B");

      // Calculate smooth crossfade volumes using cosine curve
      const volumeA = Math.cos((position * Math.PI) / 2);
      const volumeB = Math.sin((position * Math.PI) / 2);

      // Update volumes in parallel
      await Promise.all([deckA?.setVolume(volumeA), deckB?.setVolume(volumeB)]);

      console.log(`Updated volumes for DJ ${djId}: A=${volumeA}, B=${volumeB}`);
    } catch (error) {
      console.error(`Failed to set crossfader position for DJ ${djId}:`, error);
      throw error;
    }
  }

  public async cleanupDJStreams(djId: string): Promise<void> {
    try {
      // Clean up FFmpeg instances
      for (const type of ["A", "B"]) {
        const key = `${djId}_${type}`;
        const ffmpeg = this.ffmpegInstances.get(key);
        if (ffmpeg) {
          await ffmpeg.cleanup();
          this.ffmpegInstances.delete(key);
        }
      }

      // Clean up RTMP streams
      await this.rtmpService.cleanupDJStreams(djId);
    } catch (error) {
      console.error(`Failed to cleanup streams for DJ ${djId}:`, error);
      throw error;
    }
  }

  public async cleanup(): Promise<void> {
    try {
      // Cleanup all FFmpeg instances
      for (const [key, ffmpeg] of this.ffmpegInstances) {
        try {
          await ffmpeg.cleanup();
        } catch (error) {
          console.warn(
            `Warning during cleanup of FFmpeg instance ${key}:`,
            error,
          );
        }
      }
      this.ffmpegInstances.clear();

      // Stop RTMP server
      if (this.rtmpService) {
        await this.rtmpService.stop();
      }
    } catch (error) {
      console.error("Error during StreamManager cleanup:", error);
      throw error;
    }
  }
}
