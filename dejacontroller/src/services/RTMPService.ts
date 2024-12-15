import NodeMediaServer from "node-media-server";
import { EventEmitter } from "events";
import { AppDataSource } from "../data-source";
import { Deck } from "../entities/Deck";

export class RTMPService extends EventEmitter {
  private static instance: RTMPService;
  private nms: NodeMediaServer;
  private activeStreams: Map<string, string> = new Map();
  private initialized: boolean = false;

  constructor() {
    super();
    // Get ports from environment variables or use defaults
    const rtmpPort = parseInt(process.env.RTMP_PORT || "1935");
    const httpPort = parseInt(process.env.RTMP_HTTP_PORT || "8000");

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

    try {
      // Wrap the server start in a promise
      await new Promise<void>((resolve, reject) => {
        try {
          this.nms.run();

          // Give a small delay to ensure the server has started
          setTimeout(() => {
            const app = (this.nms as any).app;
            if (app) {
              app.on("preConnect", this.handlePreConnect.bind(this));
              app.on("postConnect", this.handlePostConnect.bind(this));
              app.on("prePublish", this.handlePrePublish.bind(this));
              app.on("donePublish", this.handleDonePublish.bind(this));
              this.initialized = true;
              resolve();
            } else {
              reject(new Error("Failed to initialize RTMP server"));
            }
          }, 2000);
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
        this.nms.stop();
        this.initialized = false;
      }
      resolve();
    });
  }

  public async cleanupDJStreams(djId: string): Promise<void> {
    for (const [streamPath, id] of this.activeStreams.entries()) {
      if (id === djId) {
        this.activeStreams.delete(streamPath);
      }
    }
  }

  public isStreamActive(djId: string, deckType: "A" | "B"): boolean {
    const streamPath = `/live/${djId}/${deckType}`;
    return this.activeStreams.has(streamPath);
  }
}
