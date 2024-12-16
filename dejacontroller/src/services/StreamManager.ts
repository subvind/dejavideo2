import OBSWebSocket from "obs-websocket-js";
import { OBSService } from "./OBSService";
import { RTMPService } from "./RTMPService";
import { AppDataSource } from "../data-source";
import { DJ } from "../entities/DJ";
import { Deck } from "../entities/Deck";

export class StreamManager {
  private obsConnection: OBSWebSocket;
  private rtmpService: RTMPService;
  private obsInstances: Map<string, OBSService> = new Map();
  private usedPorts: Set<number> = new Set();
  private basePort: number = 4455;

  constructor() {
    this.obsConnection = new OBSWebSocket();
    this.rtmpService = RTMPService.getInstance();
  }

  public async initialize(): Promise<void> {
    try {
      // Connect to main OBS instance
      await this.obsConnection.connect(
        `ws://localhost:${this.basePort}`,
        process.env.OBS_PASSWORD,
        {
          rpcVersion: 1,
        },
      );

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

  public async allocatePort(): Promise<number> {
    return this.basePort; // Since we're using a single OBS instance
  }

  private async checkOBSConnection(port: number): Promise<boolean> {
    try {
      const obs = new OBSWebSocket();
      await obs.connect(`ws://localhost:${port}`, process.env.OBS_PASSWORD, {
        rpcVersion: 1,
      });
      await obs.disconnect();
      return true;
    } catch (error) {
      return false;
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
        const obsService = new OBSService(deck);
        this.obsInstances.set(`${djId}_${deck.type}`, obsService);

        try {
          await obsService.connect();
        } catch (error) {
          console.error(
            `Failed to initialize OBS service for DJ ${djId} Deck ${deck.type}:`,
            error,
          );
        }
      }
    } catch (error) {
      console.error(`Failed to initialize streams for DJ ${djId}:`, error);
      throw error;
    }
  }

  public async loadVideo(
    djId: string,
    deckType: "A" | "B",
    videoPath: string,
  ): Promise<void> {
    const sourceName = `DJ_${djId}_Deck${deckType}Video`;

    try {
      await this.obsConnection.call("SetInputSettings", {
        inputName: sourceName,
        inputSettings: {
          local_file: videoPath,
          is_local_file: true,
        },
      });
    } catch (error) {
      console.error(
        `Failed to load video for DJ ${djId} Deck ${deckType}:`,
        error,
      );
      throw error;
    }
  }

  public async setVolume(
    djId: string,
    deckType: "A" | "B",
    volume: number,
  ): Promise<void> {
    const filterName = `DJ_${djId}_Deck${deckType}Volume`;

    try {
      await this.obsConnection.call("SetSourceFilterSettings", {
        sourceName: `DJ_${djId}_Deck${deckType}Video`,
        filterName: filterName,
        filterSettings: {
          db: Math.log10(volume) * 20,
        },
      });
    } catch (error) {
      console.error(
        `Failed to set volume for DJ ${djId} Deck ${deckType}:`,
        error,
      );
      throw error;
    }
  }

  public async setCrossfader(djId: string, position: number): Promise<void> {
    const mainScene = `DJ_${djId}_Main`;
    try {
      // Set opacity for Deck A (decreases as position increases)
      await this.obsConnection.call("SetSceneItemEnabled", {
        sceneName: mainScene,
        sceneItemId: await this.getSceneItemId(mainScene, `DJ_${djId}_DeckA`),
        sceneItemEnabled: true,
      });

      await this.obsConnection.call("SetSceneItemBlendMode", {
        sceneName: mainScene,
        sceneItemId: await this.getSceneItemId(mainScene, `DJ_${djId}_DeckA`),
        sceneItemBlendMode: "normal",
      });

      await this.obsConnection.call("SetSceneItemTransform", {
        sceneName: mainScene,
        sceneItemId: await this.getSceneItemId(mainScene, `DJ_${djId}_DeckA`),
        sceneItemTransform: {
          opacity: (1 - position) * 100,
        },
      });

      // Set opacity for Deck B (increases as position increases)
      await this.obsConnection.call("SetSceneItemEnabled", {
        sceneName: mainScene,
        sceneItemId: await this.getSceneItemId(mainScene, `DJ_${djId}_DeckB`),
        sceneItemEnabled: true,
      });

      await this.obsConnection.call("SetSceneItemBlendMode", {
        sceneName: mainScene,
        sceneItemId: await this.getSceneItemId(mainScene, `DJ_${djId}_DeckB`),
        sceneItemBlendMode: "normal",
      });

      await this.obsConnection.call("SetSceneItemTransform", {
        sceneName: mainScene,
        sceneItemId: await this.getSceneItemId(mainScene, `DJ_${djId}_DeckB`),
        sceneItemTransform: {
          opacity: position * 100,
        },
      });
    } catch (error) {
      console.error(`Failed to set crossfader position for DJ ${djId}:`, error);
      throw error;
    }
  }

  // Helper function to get scene item ID
  private async getSceneItemId(
    sceneName: string,
    sourceName: string,
  ): Promise<number> {
    try {
      const response = await this.obsConnection.call("GetSceneItemId", {
        sceneName: sceneName,
        sourceName: sourceName,
      });
      return response.sceneItemId;
    } catch (error) {
      console.error(
        `Failed to get scene item ID for source ${sourceName} in scene ${sceneName}:`,
        error,
      );
      throw error;
    }
  }

  public async cleanupDJStreams(djId: string): Promise<void> {
    try {
      // Clean up OBS instances
      for (const type of ["A", "B"]) {
        const key = `${djId}_${type}`;
        const obs = this.obsInstances.get(key);
        if (obs) {
          await obs.cleanup();
          this.obsInstances.delete(key);
        }
      }

      // Clean up scenes
      try {
        // Delete main scene
        await this.obsConnection.call("RemoveScene", {
          sceneName: `DJ_${djId}_Main`,
        });

        // Delete deck scenes
        await this.obsConnection.call("RemoveScene", {
          sceneName: `DJ_${djId}_DeckA`,
        });
        await this.obsConnection.call("RemoveScene", {
          sceneName: `DJ_${djId}_DeckB`,
        });
      } catch (error) {
        console.error(`Error cleaning up scenes for DJ ${djId}:`, error);
      }

      // Clean up RTMP streams
      await this.rtmpService.cleanupDJStreams(djId);
    } catch (error) {
      console.error(`Failed to cleanup streams for DJ ${djId}:`, error);
      throw error;
    }
  }

  public getOBSInstance(
    djId: string,
    deckType: "A" | "B",
  ): OBSService | undefined {
    return this.obsInstances.get(`${djId}_${deckType}`);
  }

  public async cleanup(): Promise<void> {
    try {
      // Cleanup all OBS instances
      for (const [key, obs] of this.obsInstances) {
        await obs.cleanup();
      }
      this.obsInstances.clear();

      // Disconnect from main OBS instance
      if (this.obsConnection) {
        await this.obsConnection.disconnect();
      }

      // Stop RTMP server
      await this.rtmpService.stop();
    } catch (error) {
      console.error("Error during StreamManager cleanup:", error);
      throw error;
    }
  }
}
