import { EventEmitter } from "events";
import { spawn } from "child_process";
import { Deck } from "../entities/Deck";
import { Video } from "../entities/Video";
import { AppDataSource } from "../data-source";

export class FFmpegService extends EventEmitter {
  private deck: Deck;
  private ffmpegProcess: any;
  private videoPath: string | null = null;
  private status: "stopped" | "playing" | "loaded" = "stopped";
  private volume: number = 1.0;
  private rtmpUrl: string;
  private streamUrl: string;

  constructor(deck: Deck) {
    super();
    this.deck = deck;
    this.rtmpUrl = `rtmp://localhost:1935/live/${deck.dj.id}/${deck.type}`;
    this.streamUrl = `/live/${deck.dj.id}/${deck.type}`;
  }

  public getStreamUrl(): string {
    return this.streamUrl;
  }

  public async loadVideo(video: Video): Promise<void> {
    try {
      this.videoPath = video.path;

      const deckRepo = AppDataSource.getRepository(Deck);
      this.deck.currentVideo = video;
      this.deck.status = "loaded";
      await deckRepo.save(this.deck);

      this.status = "loaded";
      this.emit("videoLoaded", video);
    } catch (error) {
      console.error("Error loading video:", error);
      throw error;
    }
  }

  public async play(): Promise<void> {
    if (!this.videoPath) {
      throw new Error("No video loaded");
    }

    try {
      // Optimized FFmpeg args for smooth playback
      const ffmpegArgs = [
        // Input options
        "-re", // Read input at native frame rate
        "-stream_loop",
        "-1", // Enable infinite looping
        "-i",
        this.videoPath,

        // Video processing
        "-c:v",
        "libx264", // Use H.264 codec
        "-preset",
        "veryfast", // Changed from ultrafast for better quality/performance balance
        "-tune",
        "zerolatency",
        "-profile:v",
        "baseline",

        // Frame timing (crucial for smooth playback)
        "-vsync",
        "passthrough", // Changed from cfr to passthrough
        "-copyts", // Preserve original timestamps
        "-start_at_zero", // Start timestamps at 0

        // Buffer settings
        "-thread_queue_size",
        "512", // Increase buffer size
        "-probesize",
        "10M", // Increase probe size
        "-analyzeduration",
        "10M", // Increase analysis duration

        // Video quality settings
        "-b:v",
        "2500k",
        "-maxrate",
        "3000k", // Slightly higher than target bitrate
        "-bufsize",
        "6000k", // 2x maxrate for smoother quality
        "-pix_fmt",
        "yuv420p",
        "-g",
        "60", // Keyframe interval

        // Audio settings
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "44100",
        "-filter:a",
        `volume=${this.volume}`,

        // Output settings
        "-f",
        "flv",
        "-flvflags",
        "no_duration_filesize",
        this.rtmpUrl,
      ];

      console.log("Starting FFmpeg deck with args:", ffmpegArgs.join(" "));

      // Increase process priority if possible
      const ffmpegProcess = spawn(
        "nice",
        ["-n", "-10", "ffmpeg", ...ffmpegArgs],
        {
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      // Start FFmpeg process
      this.ffmpegProcess = spawn("ffmpeg", ffmpegArgs);

      // Enhanced logging
      this.ffmpegProcess.stdout.on("data", (data: Buffer) => {
        console.log(`FFmpeg stdout: ${data}`);
      });

      this.ffmpegProcess.stderr.on("data", (data: Buffer) => {
        const msg = data.toString();
        // Only log errors and warnings, not regular progress
        if (!msg.includes("frame=") && !msg.includes("fps=")) {
          console.log(`FFmpeg stderr: ${msg}`);
        }
      });

      this.ffmpegProcess.on("error", (error: Error) => {
        console.error("FFmpeg process error:", error);
        this.emit("error", error);
      });

      this.ffmpegProcess.on("close", (code: number) => {
        console.log(`FFmpeg process exited with code ${code}`);
        if (this.status === "playing") {
          this.emit("mediaEnded");
        }
        this.status = "stopped";
      });

      // Update deck status
      const deckRepo = AppDataSource.getRepository(Deck);
      this.deck.status = "playing";
      await deckRepo.save(this.deck);

      this.status = "playing";
      this.emit("playbackStarted");
    } catch (error) {
      console.error("Error starting playback:", error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      if (this.ffmpegProcess) {
        // Gracefully terminate FFmpeg process
        this.ffmpegProcess.kill("SIGTERM");
        this.ffmpegProcess = null;
      }

      // Update deck status
      const deckRepo = AppDataSource.getRepository(Deck);
      this.deck.status = "stopped";
      await deckRepo.save(this.deck);

      this.status = "stopped";
      this.emit("playbackStopped");
    } catch (error) {
      console.error("Error stopping playback:", error);
      throw error;
    }
  }

  public async setVolume(volume: number): Promise<void> {
    try {
      this.volume = volume;

      // If currently playing, restart the stream with new volume
      if (this.status === "playing") {
        await this.stop();
        await this.play();
      }
    } catch (error) {
      console.error("Error setting volume:", error);
      throw error;
    }
  }

  public async cleanup(): Promise<void> {
    try {
      await this.stop();
    } catch (error) {
      console.error("Error during cleanup:", error);
      throw error;
    }
  }

  public isConnected(): boolean {
    return true; // FFmpeg doesn't maintain a persistent connection
  }
}
