import { OBSService } from "./OBSService";
import { RTMPService } from "./RTMPService";
import { AppDataSource } from "../data-source";
import { DJ } from "../entities/DJ";
import { Deck } from "../entities/Deck";

export class StreamManager {
  private obsInstances: Map<string, OBSService> = new Map();
  private rtmpService: RTMPService;
  private usedPorts: Set<number> = new Set();
  private basePort: number = 4444;

  constructor() {
    this.rtmpService = RTMPService.getInstance();
  }

  public async initialize(): Promise<void> {
    await this.rtmpService.start();

    // Reinitialize streams for active DJs
    const djRepository = AppDataSource.getRepository(DJ);
    const activeDJs = await djRepository.find({
      where: { status: "active" },
      relations: ["decks"],
    });

    for (const dj of activeDJs) {
      await this.initializeDJStreams(dj.id);
    }
  }

  public async allocatePort(): Promise<number> {
    let port = this.basePort;
    while (this.usedPorts.has(port)) {
      port++;
    }
    this.usedPorts.add(port);
    return port;
  }

  private async checkOBSConnection(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${port}`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  public async initializeDJStreams(djId: string): Promise<void> {
    const deckRepository = AppDataSource.getRepository(Deck);
    const decks = await deckRepository.find({
      where: { dj: { id: djId } },
      relations: ["dj"],
    });

    for (const deck of decks) {
      // Check if OBS is running on the assigned port
      const obsRunning = await this.checkOBSConnection(deck.obsPort);
      if (!obsRunning) {
        console.warn(
          `OBS not running on port ${deck.obsPort} for deck ${deck.type}`,
        );
        continue;
      }

      const obsInstance = new OBSService(deck);

      try {
        // Add retry logic for connection
        let retries = 3;
        while (retries > 0) {
          try {
            await obsInstance.connect();
            break;
          } catch (error) {
            retries--;
            if (retries === 0) throw error;
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        this.obsInstances.set(`${djId}_${deck.type}`, obsInstance);

        obsInstance.on("error", (error) => {
          console.error(`OBS Error for DJ ${djId} Deck ${deck.type}:`, error);
        });

        obsInstance.on("disconnected", async () => {
          console.log(`OBS Disconnected for DJ ${djId} Deck ${deck.type}`);
          deck.status = "stopped";
          await deckRepository.save(deck);
        });
      } catch (error) {
        console.error(
          `Failed to initialize stream for DJ ${djId} Deck ${deck.type}:`,
          error,
        );
      }
    }
  }

  public async cleanupDJStreams(djId: string): Promise<void> {
    // Cleanup OBS instances
    for (const type of ["A", "B"]) {
      const key = `${djId}_${type}`;
      const obs = this.obsInstances.get(key);
      if (obs) {
        await obs.cleanup();
        this.obsInstances.delete(key);
      }
    }

    // Cleanup RTMP streams
    await this.rtmpService.cleanupDJStreams(djId);
  }

  public getOBSInstance(
    djId: string,
    deckType: "A" | "B",
  ): OBSService | undefined {
    return this.obsInstances.get(`${djId}_${deckType}`);
  }

  public async cleanup(): Promise<void> {
    // Cleanup all streams
    for (const [key, obs] of this.obsInstances) {
      await obs.cleanup();
    }
    this.obsInstances.clear();

    // Stop RTMP server
    await this.rtmpService.stop();
  }
}
