import OBSWebSocket from "obs-websocket-js";
import { EventEmitter } from "events";
import { Deck } from "../entities/Deck";
import { Video } from "../entities/Video";
import { AppDataSource } from "../data-source";

export class OBSService extends EventEmitter {
  private obs: OBSWebSocket;
  private deck: Deck;
  private connected: boolean = false;

  constructor(deck: Deck) {
    super();
    this.deck = deck;
    this.obs = new OBSWebSocket();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle WebSocket events
    this.obs.on("ConnectionOpened", () => {
      console.log(`OBS WebSocket connected for Deck ${this.deck.type}`);
    });

    this.obs.on("ConnectionClosed", () => {
      console.log(`OBS WebSocket disconnected for Deck ${this.deck.type}`);
      this.connected = false;
      this.emit("disconnected");
    });

    this.obs.on("ConnectionError", (error) => {
      console.error(`OBS WebSocket error for Deck ${this.deck.type}:`, error);
      this.emit("error", error);
    });

    // Handle media events
    this.obs.on("MediaInputPlaybackEnded", (data) => {
      if (data.inputName === `Deck${this.deck.type}Video`) {
        this.emit("mediaEnded");
      }
    });

    this.obs.on("MediaInputPlaybackStarted", (data) => {
      if (data.inputName === `Deck${this.deck.type}Video`) {
        this.emit("mediaStarted");
      }
    });
  }

  public async connect(): Promise<void> {
    try {
      if (!process.env.OBS_PASSWORD) {
        throw new Error("OBS_PASSWORD not set in environment variables");
      }

      // Connect to OBS WebSocket
      await this.obs.connect(
        `ws://localhost:${this.deck.obsPort}`,
        process.env.OBS_PASSWORD,
        {
          rpcVersion: 1,
        },
      );
      this.connected = true;

      // Initialize the scene and sources if needed
      await this.initializeScene();

      console.log(`Connected to OBS WebSocket for Deck ${this.deck.type}`);
    } catch (error) {
      console.error(
        `Failed to connect to OBS WebSocket for Deck ${this.deck.type}:`,
        error,
      );
      throw error;
    }
  }

  private async initializeScene(): Promise<void> {
    try {
      // Create scene if it doesn't exist
      const sceneName = `Deck${this.deck.type}`;
      const scenes = await this.obs.call("GetSceneList");

      if (!scenes.scenes.find((scene) => scene.sceneName === sceneName)) {
        await this.obs.call("CreateScene", { sceneName });
      }

      // Create video source if it doesn't exist
      const sourceName = `Deck${this.deck.type}Video`;
      try {
        await this.obs.call("GetInputSettings", { inputName: sourceName });
      } catch {
        // Source doesn't exist, create it
        await this.obs.call("CreateInput", {
          sceneName,
          inputName: sourceName,
          inputKind: "ffmpeg_source",
          inputSettings: {
            is_local_file: true,
            looping: false,
            restart_on_activate: true,
          },
        });
      }
    } catch (error) {
      console.error("Error initializing OBS scene:", error);
      throw error;
    }
  }

  public async loadVideo(video: Video): Promise<void> {
    if (!this.connected) {
      throw new Error("OBS not connected");
    }

    try {
      // Update the video source settings
      await this.obs.call("SetInputSettings", {
        inputName: `Deck${this.deck.type}Video`,
        inputSettings: {
          local_file: video.path,
          is_local_file: true,
        },
      });

      // Update deck status
      const deckRepo = AppDataSource.getRepository(Deck);
      this.deck.currentVideo = video;
      this.deck.status = "loaded";
      await deckRepo.save(this.deck);

      this.emit("videoLoaded", video);
    } catch (error) {
      console.error("Error loading video:", error);
      throw error;
    }
  }

  public async play(): Promise<void> {
    if (!this.connected) {
      throw new Error("OBS not connected");
    }

    try {
      // Start playback
      await this.obs.call("StartOutput", {
        outputName: `Deck${this.deck.type}Video`,
      });

      // Update deck status
      const deckRepo = AppDataSource.getRepository(Deck);
      this.deck.status = "playing";
      await deckRepo.save(this.deck);

      this.emit("playbackStarted");
    } catch (error) {
      console.error("Error starting playback:", error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.connected) {
      throw new Error("OBS not connected");
    }

    try {
      // Stop playback
      await this.obs.call("StopOutput", {
        outputName: `Deck${this.deck.type}Video`,
      });

      // Reset source
      await this.obs.call("SetInputSettings", {
        inputName: `Deck${this.deck.type}Video`,
        inputSettings: {
          local_file: "",
          is_local_file: false,
        },
      });

      // Update deck status
      const deckRepo = AppDataSource.getRepository(Deck);
      this.deck.status = "stopped";
      this.deck.currentVideo = null;
      await deckRepo.save(this.deck);

      this.emit("playbackStopped");
    } catch (error) {
      console.error("Error stopping playback:", error);
      throw error;
    }
  }

  public async setVolume(volume: number): Promise<void> {
    if (!this.connected) {
      throw new Error("OBS not connected");
    }

    try {
      await this.obs.call("SetInputVolume", {
        inputName: `Deck${this.deck.type}Video`,
        inputVolumeDb: volume,
      });
    } catch (error) {
      console.error("Error setting volume:", error);
      throw error;
    }
  }

  public async cleanup(): Promise<void> {
    try {
      if (this.connected) {
        await this.stop();
        await this.obs.disconnect();
        this.connected = false;
      }
    } catch (error) {
      console.error("Error during cleanup:", error);
      throw error;
    }
  }

  public isConnected(): boolean {
    return this.connected;
  }

  private async attemptReconnect(): Promise<void> {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries && !this.connected) {
      try {
        console.log(
          `Attempting to reconnect to OBS (Attempt ${retries + 1}/${maxRetries})`,
        );
        await this.connect();
        break;
      } catch (error) {
        retries++;
        if (retries === maxRetries) {
          console.error("Max reconnection attempts reached");
          this.emit("error", error);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
  }

  // ... Additional methods for play, stop, etc.
}
