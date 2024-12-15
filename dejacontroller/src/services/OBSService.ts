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
    this.obs.on("ConnectionError", (err) => {
      console.error(`OBS WebSocket Error (Deck ${this.deck.id}):`, err);
      this.emit("connectionError", err);
    });

    this.obs.on("Identified", () => {
      this.connected = true;
      this.emit("connected");
    });

    this.obs.on("ConnectionClosed", () => {
      this.connected = false;
      this.emit("disconnected");
      this.attemptReconnect();
    });
  }

  public async connect(): Promise<void> {
    try {
      if (!process.env.OBS_PASSWORD) {
        throw new Error("OBS_PASSWORD not set in environment variables");
      }

      await this.obs.connect(
        `ws://localhost:${this.deck.obsPort}`,
        process.env.OBS_PASSWORD,
      );

      this.connected = true;
      this.emit("connected");

      console.log(`Successfully connected to OBS on port ${this.deck.obsPort}`);
    } catch (error) {
      console.error(`Failed to connect to OBS (Deck ${this.deck.id}):`, error);
      this.connected = false;
      throw error;
    }
  }

  public async loadVideo(video: Video): Promise<void> {
    if (!this.connected) throw new Error("OBS not connected");

    const deckRepo = AppDataSource.getRepository(Deck);

    try {
      await this.obs.call("SetInputSettings", {
        inputName: `Deck${this.deck.type}Video`,
        inputSettings: {
          local_file: video.path,
          is_local_file: true,
        },
      });

      // Update deck status
      this.deck.currentVideo = video;
      this.deck.status = "loading";
      await deckRepo.save(this.deck);
    } catch (error) {
      console.error(`Failed to load video (Deck ${this.deck.id}):`, error);
      throw error;
    }
  }

  public async play(): Promise<void> {
    if (!this.connected) throw new Error("OBS not connected");

    try {
      // Press play button for the media source
      await this.obs.call("PressInputPropertiesButton", {
        inputName: `Deck${this.deck.type}Video`,
        propertyName: "play",
      });

      const deckRepo = AppDataSource.getRepository(Deck);
      this.deck.status = "playing";
      await deckRepo.save(this.deck);
    } catch (error) {
      console.error(`Failed to start playback (Deck ${this.deck.id}):`, error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.connected) throw new Error("OBS not connected");

    try {
      // Stop playback by setting the media source to pause
      await this.obs.call("PressInputPropertiesButton", {
        inputName: `Deck${this.deck.type}Video`,
        propertyName: "pause",
      });

      // Reset media source
      await this.obs.call("SetInputSettings", {
        inputName: `Deck${this.deck.type}Video`,
        inputSettings: {
          is_local_file: false,
          local_file: "",
        },
      });

      const deckRepo = AppDataSource.getRepository(Deck);
      this.deck.status = "stopped";
      await deckRepo.save(this.deck);
    } catch (error) {
      console.error(`Failed to stop playback (Deck ${this.deck.id}):`, error);
      throw error;
    }
  }

  public async cleanup(): Promise<void> {
    try {
      if (this.connected) {
        await this.stop();
        await this.obs.disconnect();
        this.connected = false;

        const deckRepo = AppDataSource.getRepository(Deck);
        this.deck.status = "stopped";
        await deckRepo.save(this.deck);
      }
    } catch (error) {
      console.error(`Error during OBS cleanup (Deck ${this.deck.id}):`, error);
      throw error;
    }
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
