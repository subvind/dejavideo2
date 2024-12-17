import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Video } from "../entities/Video";
import * as path from "path";
import { promises as fs } from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface YouTubeVideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  description: string;
  uploader: string;
  upload_date: string;
  view_count: number;
  like_count: number;
}

export class VideoController {
  private videoRepository = AppDataSource.getRepository(Video);
  private mediaDir = path.join(process.cwd(), "media");

  private async fetchYouTubeInfo(url: string): Promise<YouTubeVideoInfo> {
    try {
      const { stdout } = await execAsync(
        `yt-dlp --dump-json "${url}"`,
        { maxBuffer: 1024 * 1024 * 10 }, // 10MB buffer
      );

      return JSON.parse(stdout);
    } catch (error) {
      throw new Error(`Failed to fetch video info: ${error}`);
    }
  }

  private async downloadVideo(url: string, outputPath: string) {
    try {
      await execAsync(
        `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" ` +
          `--merge-output-format mp4 "${url}" -o "${outputPath}"`,
        { maxBuffer: 1024 * 1024 * 10 },
      );
    } catch (error) {
      throw new Error(`Failed to download video: ${error}`);
    }
  }

  public getVideoInfo = async (req: Request, res: Response) => {
    try {
      const { url } = req.query;

      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "YouTube URL is required" });
      }

      // Validate URL format
      if (!url.includes("youtube.com/") && !url.includes("youtu.be/")) {
        return res.status(400).json({ error: "Invalid YouTube URL" });
      }

      const videoInfo = await this.fetchYouTubeInfo(url);

      res.json({
        id: videoInfo.id,
        title: videoInfo.title,
        duration: videoInfo.duration,
        thumbnail: videoInfo.thumbnail,
        description: videoInfo.description,
        uploader: videoInfo.uploader,
        uploadDate: videoInfo.upload_date,
        viewCount: videoInfo.view_count,
        likeCount: videoInfo.like_count,
      });
    } catch (error) {
      console.error("Error fetching video info:", error);
      res.status(500).json({
        error: "Failed to fetch video info",
        details: error,
      });
    }
  };

  public importFromYoutube = async (req: Request, res: Response) => {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ error: "YouTube URL is required" });
      }

      // Get video info first
      const videoInfo = await this.fetchYouTubeInfo(url);

      // Check if video already exists
      const existingVideo = await this.videoRepository.findOne({
        where: { youtubeUrl: url },
      });

      if (existingVideo) {
        return res.status(400).json({ error: "Video already imported" });
      }

      const videoId = videoInfo.id;
      const filename = `${videoId}.mp4`;
      const filePath = path.join(this.mediaDir, filename);

      // Download video
      await this.downloadVideo(url, filePath);

      // Create video entity
      const video = new Video();
      video.filename = filename;
      video.path = filePath;
      video.duration = videoInfo.duration;
      video.source = "youtube";
      video.youtubeUrl = url;
      video.youtubeId = videoId;

      await this.videoRepository.save(video);

      res.json({
        message: "Video import completed",
        video,
      });
    } catch (error) {
      console.error("Error importing YouTube video:", error);
      res.status(500).json({
        error: "Failed to import video",
        details: error,
      });
    }
  };

  public checkYtDlp = async (req: Request, res: Response) => {
    try {
      const { stdout } = await execAsync("yt-dlp --version");
      res.json({
        status: "ok",
        version: stdout.trim(),
      });
    } catch (error) {
      res.status(500).json({
        error: "yt-dlp not found or not working",
        details: error,
      });
    }
  };

  public getAllVideos = async (req: Request, res: Response) => {
    try {
      const videos = await this.videoRepository.find();
      res.json({ videos });
    } catch (error) {
      console.error("Error fetching videos:", error);
      res.status(500).json({ error: "Failed to fetch videos" });
    }
  };
}
