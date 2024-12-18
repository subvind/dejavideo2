import OBSWebSocket from "obs-websocket-js";
import { OBSService } from "./OBSService";
import { RTMPService } from "./RTMPService";
import { AppDataSource } from "../data-source";
import { DJ } from "../entities/DJ";
import { Deck } from "../entities/Deck";
import AggregateError from "aggregate-error";

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
        console.log("init stream for", dj.id);
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
      console.log(`Initializing streams for DJ ${djId}`);

      // Create main scene first
      const mainSceneName = `DJ_${djId}_Main`;
      try {
        await this.obsConnection.call("CreateScene", {
          sceneName: mainSceneName,
        });
      } catch (error) {
        console.log("Main scene might already exist, continuing...");
      }

      const deckRepository = AppDataSource.getRepository(Deck);
      const decks = await deckRepository.find({
        where: { dj: { id: djId } },
        relations: ["dj"],
      });

      console.log(`Found ${decks.length} decks for DJ ${djId}`);

      for (const deck of decks) {
        const key = `${djId}_${deck.type}`;
        console.log(`Creating OBS service for ${key}`);

        // Create video source first
        const sourceName = `DJ_${djId}_Deck${deck.type}Video`;
        try {
          // Check if source exists first
          try {
            const sourcesList = await this.obsConnection.call(
              "GetInputList",
              {},
            );
            const sourceExists = sourcesList.inputs.some(
              (input) => input.inputName === sourceName,
            );

            if (!sourceExists) {
              await this.obsConnection.call("CreateInput", {
                inputName: sourceName,
                inputKind: "ffmpeg_source",
                sceneItemEnabled: true,
                sceneName: `DJ_${djId}_Deck${deck.type}`,
              });
              console.log(`Created video source: ${sourceName}`);
            } else {
              console.log(
                `Video source ${sourceName} already exists, continuing...`,
              );
            }
          } catch (error) {
            console.error(
              `Error checking/creating source ${sourceName}:`,
              error,
            );
            throw error;
          }

          // Setup RTMP Output
          const outputName = `DJ_${djId}_Deck${deck.type}Output`;

          try {
            // Get current outputs to check if it exists
            const outputs = await this.obsConnection.call("GetOutputList");
            const outputExists = outputs.outputs.some(
              (output) => output.outputName === outputName,
            );

            if (outputExists) {
              // Try to stop the output if it exists
              try {
                await this.obsConnection.call("StopOutput", {
                  outputName: outputName,
                });
                console.log(`Stopped existing output: ${outputName}`);
              } catch (error) {
                console.log(`Output might not be running: ${outputName}`);
              }
            }

            // Set up the RTMP output settings
            await this.obsConnection.call("SetOutputSettings", {
              outputName: outputName,
              outputSettings: {
                server: "rtmp://localhost:1935/live",
                key: `${djId}/${deck.type}`,
              },
            });

            console.log(`Configured RTMP output: ${outputName}`);

            // Start the output
            await this.obsConnection.call("StartOutput", {
              outputName: outputName,
            });
            console.log(`Started RTMP output: ${outputName}`);
          } catch (error) {
            console.error(`Error setting up RTMP output ${outputName}:`, error);
            throw error;
          }
        } catch (error) {
          console.error(
            `Failed to create/configure RTMP for ${sourceName}:`,
            error,
          );
          throw error;
        }

        const obsService = new OBSService(deck);
        this.obsInstances.set(key, obsService);

        try {
          await obsService.connect();
          console.log(`Connected OBS service for ${key}`);

          // Add deck scene as a source to the main scene
          const deckSceneName = `DJ_${djId}_Deck${deck.type}`;

          try {
            // First, ensure the scene exists
            try {
              await this.obsConnection.call("CreateScene", {
                sceneName: deckSceneName,
              });
            } catch (error) {
              console.log(
                `Scene ${deckSceneName} might already exist, continuing...`,
              );
            }

            // Add scene as source to main scene
            try {
              await this.obsConnection.call("CreateSceneItem", {
                sceneName: mainSceneName,
                sourceName: deckSceneName,
                sceneItemEnabled: true,
              });
            } catch (error) {
              console.log(
                `Scene item might already exist in main scene, continuing...`,
              );
            }

            // Set initial transform
            const sceneItemId = await this.getSceneItemId(
              mainSceneName,
              deckSceneName,
            );

            // Set transform properties
            await this.obsConnection.call("SetSceneItemTransform", {
              sceneName: mainSceneName,
              sceneItemId: sceneItemId,
              sceneItemTransform: {
                positionX: 0,
                positionY: 0,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
                sourceWidth: 1920,
                sourceHeight: 1080,
                width: 1920,
                height: 1080,
                opacity: deck.type === "A" ? 100 : 0,
              },
            });
          } catch (error) {
            console.error(
              `Failed to add deck scene ${deckSceneName} to main scene:`,
              error,
            );
            throw error;
          }
        } catch (error) {
          console.error(`Failed to connect OBS service for ${key}:`, error);
          throw error;
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
    const key = `${djId}_${deckType}`;
    const instance = this.obsInstances.get(key);

    if (!instance) {
      console.error(`No OBS instance found for key: ${key}`);
      console.debug("Current instances:", Array.from(this.obsInstances.keys()));
    }

    return instance;
  }

  public async cleanup(): Promise<void> {
    const errors: Error[] = [];

    // Cleanup all OBS instances
    for (const [key, obs] of this.obsInstances) {
      try {
        await obs.cleanup();
      } catch (error) {
        console.warn(`Warning during cleanup of OBS instance ${key}:`, error);
        errors.push(error as Error);
      }
    }
    this.obsInstances.clear();

    // Disconnect from main OBS instance
    if (this.obsConnection) {
      try {
        await this.obsConnection.disconnect();
      } catch (error) {
        console.warn("Warning during OBS main connection cleanup:", error);
        errors.push(error as Error);
      }
    }

    // Stop RTMP server with better error handling
    try {
      if (this.rtmpService) {
        await this.rtmpService.stop().catch((error) => {
          console.warn("Warning during RTMP service cleanup:", error);
          errors.push(error);
        });
      }
    } catch (error) {
      console.error("Error during StreamManager cleanup:", error);
      errors.push(error as Error);
    }

    // If there were any errors during cleanup, throw an aggregate error
    if (errors.length > 0) {
      errors.forEach((error) => {
        console.error(error);
      });
    }
  }
}
