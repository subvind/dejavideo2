import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Broadcast } from "../entities/Broadcast";
import { DJ } from "../entities/DJ";
import { StreamManager } from "../services/StreamManager";
import { RTMPService } from "../services/RTMPService";
import { spawn } from "child_process";

export class BroadcastController {
  private broadcastRepository = AppDataSource.getRepository(Broadcast);
  private djRepository = AppDataSource.getRepository(DJ);
  private streamManager: StreamManager;
  private rtmpService: RTMPService;
  private broadcastProcesses: Map<string, any> = new Map();

  constructor(streamManager: StreamManager, rtmpService: RTMPService) {
    this.streamManager = streamManager;
    this.rtmpService = rtmpService;
  }

  private async cleanupExistingBroadcasts(djId: string) {
    try {
      // Find any existing live broadcasts for this DJ
      const existingBroadcasts = await this.broadcastRepository.find({
        where: {
          dj: { id: djId },
          status: "live",
        },
      });

      // Stop each existing broadcast
      for (const broadcast of existingBroadcasts) {
        const processKey = `${djId}_${broadcast.channelId}`;
        const existingProcess = this.broadcastProcesses.get(processKey);

        if (existingProcess) {
          console.log(`Stopping existing broadcast process: ${processKey}`);
          existingProcess.kill("SIGTERM");
          this.broadcastProcesses.delete(processKey);
        }

        // Update broadcast status
        broadcast.status = "offline";
        await this.broadcastRepository.save(broadcast);
      }

      // Give RTMP server time to cleanup
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error("Error cleaning up existing broadcasts:", error);
      throw error;
    }
  }

  private async stopBroadcastProcess(broadcastId: string) {
    try {
      const broadcast = await this.broadcastRepository.findOne({
        where: { id: broadcastId },
        relations: ["dj"],
      });

      if (!broadcast) {
        throw new Error("Broadcast not found");
      }

      // Stop the FFmpeg process
      const processKey = `${broadcast.dj.id}_${broadcast.channelId}`;
      const ffmpegProcess = this.broadcastProcesses.get(processKey);
      if (ffmpegProcess) {
        ffmpegProcess.kill("SIGTERM");
        this.broadcastProcesses.delete(processKey);
      }

      // Update broadcast status
      broadcast.status = "offline";
      await this.broadcastRepository.save(broadcast);

      return broadcast;
    } catch (error) {
      console.error("Error stopping broadcast process:", error);
      throw error;
    }
  }

  public startBroadcast = async (req: Request, res: Response) => {
    try {
      const { djId } = req.params;
      const { channelId } = req.body;

      // Clean up any existing broadcasts first
      await this.cleanupExistingBroadcasts(djId);

      const dj = await this.djRepository.findOne({
        where: { id: djId },
        relations: ["decks"],
      });

      if (!dj) {
        return res.status(404).json({ error: "DJ not found" });
      }

      if (!channelId) {
        return res.status(400).json({ error: "channelId is required" });
      }

      const ffmpegInstances = dj.decks.map((deck) =>
        this.streamManager.getFFmpegInstance(dj.id, deck.type),
      );

      if (ffmpegInstances.some((instance) => !instance)) {
        return res.status(400).json({
          error:
            "FFmpeg instances not ready. Please ensure both decks are initialized.",
        });
      }

      const broadcastStreamUrl = `rtmp://localhost:1935/live/${dj.id}/broadcast/${channelId}`;

      // Create FFmpeg args
      const ffmpegArgs = [
        "-i",
        `rtmp://localhost:1935/live/${dj.id}/A`,
        "-i",
        `rtmp://localhost:1935/live/${dj.id}/B`,
        "-filter_complex",
        [
          // Audio mixing with initial volumes
          "[0:a]volume=1.0[a1]",
          "[1:a]volume=0.0[a2]",
          "[a1][a2]amix=inputs=2:duration=first:dropout_transition=0[aout]",
          // Pass through deck A video initially with frame timing
          "[0:v]fps=fps=30:round=near[vout]",
        ].join(";"),
        // Map outputs
        "-map",
        "[vout]",
        "-map",
        "[aout]",

        // Frame timing and sync
        "-vsync",
        "cfr", // Constant frame rate
        "-fps_mode",
        "cfr", // Force constant frame rate mode
        "-r",
        "30", // Output framerate

        // Video settings
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-profile:v",
        "baseline",
        "-x264opts",
        "no-scenecut", // Disable scene change detection
        "-b:v",
        "2500k",
        "-maxrate",
        "2500k",
        "-bufsize",
        "5000k",
        "-pix_fmt",
        "yuv420p",
        "-g",
        "30", // GOP size matches framerate
        "-keyint_min",
        "30", // Minimum GOP size

        // Audio settings
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "44100",

        // Output settings
        "-f",
        "flv",
        "-flvflags",
        "no_duration_filesize",
        broadcastStreamUrl,
      ];

      console.log("Starting FFmpeg with args:", ffmpegArgs.join(" "));

      const ffmpegProcess = spawn("ffmpeg", ffmpegArgs);

      // Enhanced error logging
      ffmpegProcess.stdout.on("data", (data: Buffer) => {
        console.log(`Broadcast FFmpeg stdout: ${data.toString()}`);
      });

      ffmpegProcess.stderr.on("data", async (data: Buffer) => {
        const error = data.toString();
        console.error(`Broadcast FFmpeg stderr: ${error}`);

        // Check for specific error conditions
        if (
          error.includes("Connection refused") ||
          error.includes("Failed to connect")
        ) {
          console.error("RTMP connection failed - stopping broadcast");
          try {
            await this.stopBroadcastProcess(broadcast.id);
            // No need to send response here as the client will get updates via status polling
          } catch (stopError) {
            console.error("Error stopping failed broadcast:", stopError);
          }
        }
      });

      ffmpegProcess.on("error", (error: Error) => {
        console.error("FFmpeg process error:", error);
      });

      ffmpegProcess.on("close", async (code: number) => {
        console.log(`Broadcast FFmpeg process exited with code ${code}`);
        const broadcast = await this.broadcastRepository.findOne({
          where: { channelId: channelId, dj: { id: djId }, status: "live" },
        });
        if (broadcast) {
          broadcast.status = "offline";
          await this.broadcastRepository.save(broadcast);
        }
        this.broadcastProcesses.delete(`${djId}_${channelId}`);
      });

      // Store the process
      const processKey = `${djId}_${channelId}`;
      this.broadcastProcesses.set(processKey, ffmpegProcess);

      // Create new broadcast record
      const broadcast = new Broadcast();
      broadcast.channelId = channelId.toString();
      broadcast.dj = dj;
      broadcast.status = "live";
      broadcast.activeVideo = "A"; // Start with deck A
      broadcast.crossfaderPosition = 0.5;
      broadcast.streamStats = {
        viewers: 0,
        startTime: new Date(),
        bitrate: 2192000, // Video + audio bitrate
      };

      await this.broadcastRepository.save(broadcast);

      res.json({
        message: "Broadcast started",
        broadcast,
        streamUrl: broadcastStreamUrl,
      });
    } catch (error) {
      console.error("Error starting broadcast:", error);
      res.status(500).json({ error: "Failed to start broadcast" });
    }
  };

  public switchVideo = async (req: Request, res: Response) => {
    try {
      const { broadcastId } = req.params;
      const { deck } = req.body;

      if (!["A", "B"].includes(deck)) {
        return res.status(400).json({ error: "Invalid deck selection" });
      }

      const broadcast = await this.broadcastRepository.findOne({
        where: { id: broadcastId },
        relations: ["dj"],
      });

      if (!broadcast) {
        return res.status(404).json({ error: "Broadcast not found" });
      }

      // Update the broadcast with new active video
      broadcast.activeVideo = deck;
      await this.broadcastRepository.save(broadcast);

      // Restart FFmpeg process with new video selection
      await this.restartFFmpegProcess(
        broadcast.dj.id,
        broadcast.channelId,
        deck,
        broadcast.crossfaderPosition,
      );

      // Update the stream manager's deck volumes
      await this.streamManager.setCrossfader(
        broadcast.dj.id,
        deck === "A" ? 0 : 1, // Set crossfader based on active deck
      );

      res.json({
        message: "Video source switched",
        activeVideo: deck,
        crossfaderPosition: broadcast.crossfaderPosition,
      });
    } catch (error) {
      console.error("Error switching video:", error);
      res.status(500).json({ error: "Failed to switch video" });
    }
  };

  public updateCrossfader = async (req: Request, res: Response) => {
    try {
      const { broadcastId } = req.params;
      const { position } = req.body;

      if (position < 0 || position > 1) {
        return res
          .status(400)
          .json({ error: "Position must be between 0 and 1" });
      }

      const broadcast = await this.broadcastRepository.findOne({
        where: { id: broadcastId },
        relations: ["dj"],
      });

      if (!broadcast) {
        return res.status(404).json({ error: "Broadcast not found" });
      }

      // Update the broadcast with new crossfader position
      broadcast.crossfaderPosition = position;
      await this.broadcastRepository.save(broadcast);

      // Update both the broadcast mix and individual deck volumes
      await Promise.all([
        this.restartFFmpegProcess(
          broadcast.dj.id,
          broadcast.channelId,
          broadcast.activeVideo,
          position,
        ),
        this.streamManager.setCrossfader(broadcast.dj.id, position),
      ]);

      res.json({
        message: "Crossfader updated",
        position,
        activeVideo: broadcast.activeVideo,
      });
    } catch (error) {
      console.error("Error updating crossfader:", error);
      res.status(500).json({ error: "Failed to update crossfader" });
    }
  };

  private createFFmpegArgs(
    djId: string,
    outputUrl: string,
    activeVideo: "A" | "B",
    crossfaderPosition: number,
  ): string[] {
    // Calculate volume levels based on crossfader position
    const volumeA = Math.cos((crossfaderPosition * Math.PI) / 2); // Smooth curve transition
    const volumeB = Math.sin((crossfaderPosition * Math.PI) / 2);

    return [
      // Input settings with larger buffers
      "-thread_queue_size",
      "512",
      "-i",
      `rtmp://localhost:1935/live/${djId}/A`,
      "-thread_queue_size",
      "512",
      "-i",
      `rtmp://localhost:1935/live/${djId}/B`,

      // Complex filter for mixing
      "-filter_complex",
      [
        // Audio mixing with smooth crossfade
        `[0:a]volume=${volumeA}[a1]`,
        `[1:a]volume=${volumeB}[a2]`,
        "[a1][a2]amix=inputs=2:duration=first:dropout_transition=2[aout]",

        // Video mixing with smooth transition
        "[0:v]format=yuva420p,setpts=PTS-STARTPTS[v0]",
        "[1:v]format=yuva420p,setpts=PTS-STARTPTS[v1]",
        `[v0]split=2[v0_1][v0_2]`,
        `[v1]split=2[v1_1][v1_2]`,

        // Create transition masks based on active deck
        `[v0_1]${activeVideo === "A" ? "null" : "format=yuva420p,colorchannelmixer=aa=0"}[vm0]`,
        `[v1_1]${activeVideo === "B" ? "null" : "format=yuva420p,colorchannelmixer=aa=0"}[vm1]`,

        // Overlay videos with transition
        "[vm0][vm1]overlay=format=yuv420[vout]",
      ].join(";"),

      // Map outputs
      "-map",
      "[vout]",
      "-map",
      "[aout]",

      // Video encoding settings
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-tune",
      "zerolatency",
      "-profile:v",
      "baseline",

      // Frame timing
      "-vsync",
      "passthrough",
      "-copyts",
      "-start_at_zero",

      // Buffer and quality settings
      "-b:v",
      "3000k",
      "-maxrate",
      "3500k",
      "-bufsize",
      "7000k",
      "-g",
      "60",

      // Audio settings
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "44100",

      // Output
      "-f",
      "flv",
      outputUrl,
    ];
  }

  private async restartFFmpegProcess(
    djId: string,
    channelId: string,
    activeVideo: "A" | "B",
    crossfaderPosition: number,
  ) {
    const processKey = `${djId}_${channelId}`;
    const currentProcess = this.broadcastProcesses.get(processKey);

    if (currentProcess) {
      // Kill the current process
      currentProcess.kill("SIGTERM");

      // Create new FFmpeg process
      const broadcastStreamUrl = `rtmp://localhost:1935/live/${djId}/broadcast/${channelId}`;
      const ffmpegArgs = this.createFFmpegArgs(
        djId,
        broadcastStreamUrl,
        activeVideo,
        crossfaderPosition,
      );

      const newProcess = spawn("ffmpeg", ffmpegArgs);
      this.setupProcessHandlers(newProcess, djId, channelId);
      this.broadcastProcesses.set(processKey, newProcess);
    }
  }

  private setupProcessHandlers(process: any, djId: string, channelId: string) {
    process.stdout.on("data", (data: Buffer) => {
      console.log(`Broadcast FFmpeg stdout: ${data.toString()}`);
    });

    process.stderr.on("data", (data: Buffer) => {
      console.error(`Broadcast FFmpeg stderr: ${data.toString()}`);
    });

    process.on("error", (error: Error) => {
      console.error("FFmpeg process error:", error);
    });

    process.on("close", async (code: number) => {
      console.log(`Broadcast FFmpeg process exited with code ${code}`);
      const broadcast = await this.broadcastRepository.findOne({
        where: { channelId: channelId, dj: { id: djId }, status: "live" },
      });
      if (broadcast) {
        broadcast.status = "offline";
        await this.broadcastRepository.save(broadcast);
      }
      this.broadcastProcesses.delete(`${djId}_${channelId}`);
    });
  }

  public stopBroadcast = async (req: Request, res: Response) => {
    try {
      const { broadcastId } = req.params;

      const broadcast = await this.broadcastRepository.findOne({
        where: { id: broadcastId },
        relations: ["dj"],
      });

      if (!broadcast) {
        return res.status(404).json({ error: "Broadcast not found" });
      }

      // Stop the FFmpeg process
      const processKey = `${broadcast.dj.id}_${broadcast.channelId}`;
      const ffmpegProcess = this.broadcastProcesses.get(processKey);
      if (ffmpegProcess) {
        ffmpegProcess.kill("SIGTERM");
        this.broadcastProcesses.delete(processKey);
      }

      // Update broadcast status
      broadcast.status = "offline";
      await this.broadcastRepository.save(broadcast);

      res.json({ message: "Broadcast stopped", broadcast });
    } catch (error) {
      console.error("Error stopping broadcast:", error);
      res.status(500).json({ error: "Failed to stop broadcast" });
    }
  };

  public getBroadcastStatus = async (req: Request, res: Response) => {
    try {
      const { broadcastId } = req.params;

      const broadcast = await this.broadcastRepository.findOne({
        where: { id: broadcastId },
        relations: ["dj"],
      });

      if (!broadcast) {
        return res.status(404).json({ error: "Broadcast not found" });
      }

      // Calculate uptime if broadcast is live
      let uptime = 0;
      if (broadcast.status === "live" && broadcast.streamStats?.startTime) {
        uptime = Math.floor(
          (Date.now() - new Date(broadcast.streamStats.startTime).getTime()) /
            1000,
        );
      }

      // Add stream URL and uptime to response
      const streamUrl = `rtmp://localhost:1935/live/${broadcast.dj.id}/broadcast/${broadcast.channelId}`;

      res.json({
        ...broadcast,
        uptime,
        streamUrl,
      });
    } catch (error) {
      console.error("Error fetching broadcast status:", error);
      res.status(500).json({ error: "Failed to fetch broadcast status" });
    }
  };
}
