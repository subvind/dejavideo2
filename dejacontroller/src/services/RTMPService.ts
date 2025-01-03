import NodeMediaServer from "node-media-server";
import { EventEmitter } from "events";
import { AppDataSource } from "../data-source";
import { Deck } from "../entities/Deck";
import { promises as fs } from "fs";
import path from "path";

export class RTMPService extends EventEmitter {
  private static instance: RTMPService;
  private nms: NodeMediaServer;
  private activeStreams: Map<string, string> = new Map();
  private initialized: boolean = false;

  constructor() {
    super();
    // Get ports from environment variables or use defaults
    const rtmpPort = process.env.RTMP_PORT
      ? parseInt(process.env.RTMP_PORT)
      : 1935;
    const httpPort = process.env.RTMP_HTTP_PORT
      ? parseInt(process.env.RTMP_HTTP_PORT)
      : 8000;

    this.nms = new NodeMediaServer({
      rtmp: {
        port: rtmpPort,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60,
      },
      http: {
        port: httpPort,
        allow_origin: "*",
        mediaroot: "./media",
      },
    });
  }

  public static getInstance(): RTMPService {
    if (!RTMPService.instance) {
      RTMPService.instance = new RTMPService();
    }
    return RTMPService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Ensure media directory exists
    const mediaDir = path.join(process.cwd(), "media");
    try {
      await fs.mkdir(mediaDir, { recursive: true });
    } catch (error) {
      console.warn(
        "Media directory already exists or could not be created:",
        error,
      );
    }

    try {
      // Wrap the server start in a promise
      await new Promise<void>((resolve, reject) => {
        try {
          this.nms.run();

          // Setup event handlers
          const app = (this.nms as any).nms;
          if (app) {
            app.on("preConnect", this.handlePreConnect.bind(this));
            app.on("postConnect", this.handlePostConnect.bind(this));
            app.on("prePublish", this.handlePrePublish.bind(this));
            app.on("donePublish", this.handleDonePublish.bind(this));
          }

          // Give the server a moment to start
          setTimeout(() => {
            this.initialized = true;
            resolve();
          }, 1000);
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      if ((error as any).code === "EADDRINUSE") {
        console.error(
          "RTMP ports are already in use. Please check your port configuration.",
        );
      }
      throw error;
    }
  }

  private handlePreConnect(id: string, args: any): void {
    console.log(
      "[NodeEvent on preConnect]",
      `id=${id} args=${JSON.stringify(args)}`,
    );
  }

  private handlePostConnect(id: string, args: any): void {
    console.log(
      "[NodeEvent on postConnect]",
      `id=${id} args=${JSON.stringify(args)}`,
    );
  }

  private async handlePrePublish(
    id: string,
    StreamPath: string,
    args: any,
  ): Promise<void> {
    console.log(
      "[NodeEvent on prePublish]",
      `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`,
    );

    try {
      const pathParts = StreamPath.split("/");
      const djId = pathParts[1];
      const deckType = pathParts[2];

      if (deckType === "A" || deckType === "B") {
        const deck = await AppDataSource.getRepository(Deck).findOne({
          where: {
            dj: { id: djId },
            type: deckType,
          },
          relations: ["dj"],
        });

        if (!deck) {
          console.log("Deck not found, rejecting stream");
          return;
        }

        this.activeStreams.set(StreamPath, djId);
        this.emit("streamStart", { djId, deckType });
      }
    } catch (error) {
      console.error("Error handling prePublish:", error);
    }
  }

  private handleDonePublish(id: string, StreamPath: string, args: any): void {
    console.log(
      "[NodeEvent on donePublish]",
      `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`,
    );

    const djId = this.activeStreams.get(StreamPath);
    if (djId) {
      const pathParts = StreamPath.split("/");
      const deckType = pathParts[2];

      this.activeStreams.delete(StreamPath);
      this.emit("streamEnd", { djId, deckType });
    }
  }

  public async start(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.nms && this.initialized) {
        // Properly stop the NodeMediaServer
        if ((this.nms as any).nms) {
          (this.nms as any).nms.stop();
        }

        // Clear active streams
        this.activeStreams.clear();

        // Reset initialization flag
        this.initialized = false;

        // Give it a moment to clean up
        setTimeout(() => {
          resolve();
        }, 1000);
      } else {
        resolve();
      }
    });
  }

  // Also improve the cleanup method:
  public async cleanupDJStreams(djId: string): Promise<void> {
    try {
      const streamsToRemove = Array.from(this.activeStreams.entries())
        .filter(([_, id]) => id === djId)
        .map(([path]) => path);

      for (const streamPath of streamsToRemove) {
        console.log(`Cleaning up stream: ${streamPath}`);
        this.activeStreams.delete(streamPath);
      }

      console.log(
        `Cleaned up ${streamsToRemove.length} streams for DJ ${djId}`,
      );
    } catch (error) {
      console.error(`Error cleaning up streams for DJ ${djId}:`, error);
      throw error;
    }
  }

  public isStreamActive(djId: string, deckType: "A" | "B"): boolean {
    const streamPath = `/live/${djId}/${deckType}`;
    return this.activeStreams.has(streamPath);
  }

  public getStreamUrl(djId: string, deckType: "A" | "B"): string {
    const rtmpPort = process.env.RTMP_PORT || 1935;
    return `rtmp://localhost:${rtmpPort}/live/${djId}/${deckType}`;
  }
}
