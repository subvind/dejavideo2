const NodeMediaServer = require('node-media-server');
const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const sanitize = require('sanitize-filename');

const app = express();
const activeDeck = {
  deckA: null,
  deckB: null
};

// Configurations
const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*',
    mediaroot: './media', // Add this line
  },
  trans: {
    ffmpeg: 'ffmpeg',
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        dash: true,
        dashFlags: '[f=dash:window_size=3:extra_window_size=5]'
      }
    ]
  }
};

// Make sure the media directory exists
if (!fs.existsSync('./media')) {
  fs.mkdirSync('./media');
}

const nms = new NodeMediaServer(config);
const VIDEO_DIR = process.env.VIDEO_DIR || './videos';

// Ensure video directory exists
if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR);
}

app.use(express.json());

// YouTube download function using yt-dlp
function downloadYouTube(url, customFilename = null) {
  return new Promise((resolve, reject) => {
    // First get video info to extract title
    const infoCommand = `yt-dlp --print title --print duration "${url}"`;
    
    exec(infoCommand, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Failed to get video info: ${error.message}`));
        return;
      }

      const [title, duration] = stdout.trim().split('\n');
      const filename = customFilename || sanitize(title);
      const outputPath = path.join(VIDEO_DIR, `${filename}.mp4`);

      // Download command with best video+audio quality
      // Using yt-dlp specific options for better performance
      const downloadCommand = `yt-dlp \
        -f "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4] / bv*+ba/b" \
        --merge-output-format mp4 \
        --no-playlist \
        --concurrent-fragments 4 \
        --progress \
        -o "${outputPath}" \
        "${url}"`;

      console.log(`Downloading: ${title}`);
      
      exec(downloadCommand, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Download failed: ${error.message}`));
          return;
        }
        resolve({
          filename: `${filename}.mp4`,
          title,
          duration
        });
      });
    });
  });
}

// API Endpoints

// Import from YouTube
app.post('/api/import/youtube', async (req, res) => {
  const { url, filename } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'YouTube URL is required' });
  }

  // Verify yt-dlp is installed
  exec('which yt-dlp', async (error) => {
    if (error) {
      return res.status(500).json({ 
        error: 'yt-dlp not found. Please install it using: sudo pacman -S yt-dlp' 
      });
    }

    try {
      // Start download
      res.json({ 
        message: 'Download started',
        status: 'downloading'
      });

      // Process download
      const result = await downloadYouTube(url, filename);
      
      console.log('Download completed:', result);
    } catch (error) {
      console.error('Download failed:', error);
      // Log error but don't send to response since it's already been sent
    }
  });
});

// Check download status and get video info
app.get('/api/import/youtube/info', (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'YouTube URL is required' });
  }

  const infoCommand = `yt-dlp -j "${url}"`;
  
  exec(infoCommand, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: 'Failed to get video info' });
    }

    try {
      const info = JSON.parse(stdout);
      res.json({
        title: info.title,
        duration: info.duration,
        thumbnail: info.thumbnail,
        uploader: info.uploader,
        viewCount: info.view_count,
        formats: info.formats.map(f => ({
          format_id: f.format_id,
          ext: f.ext,
          resolution: f.resolution,
          filesize: f.filesize
        }))
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to parse video info' });
    }
  });
});

// List available videos
app.get('/api/videos', (req, res) => {
  fs.readdir(VIDEO_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read video directory' });
    }
    
    const videos = files
      .filter(file => ['.mp4', '.avi', '.mkv', '.mov'].includes(path.extname(file).toLowerCase()))
      .map(file => ({
        filename: file,
        path: path.join(VIDEO_DIR, file),
        size: fs.statSync(path.join(VIDEO_DIR, file)).size,
        created: fs.statSync(path.join(VIDEO_DIR, file)).birthtime
      }));
    
    res.json({ videos });
  });
});

app.post('/api/deck/stop', (req, res) => {
  const { deck } = req.body;
  
  console.log(`Stop request received for deck: ${deck}`);
  console.log('Active deck state:', activeDeck[deck]); // Debug log current deck state
  
  if (!activeDeck[deck]) {
    console.error(`Error: No video loaded in deck ${deck}`);
    return res.status(400).json({ error: 'No video loaded in deck' });
  }
  
  try {
    // Check if ffmpeg instance exists
    if (activeDeck[deck].ffmpeg) {
      console.log(`Stopping playback for ${deck}`);
      
      // Kill the FFmpeg process more gracefully
      try {
        activeDeck[deck].ffmpeg.kill();
      } catch (killError) {
        console.error('Error killing FFmpeg process:', killError);
        // Continue execution even if kill fails
      }
      
      // Update deck status
      activeDeck[deck].status = 'stopped';
      
      console.log(`Successfully stopped ${deck}. New state:`, activeDeck[deck]);
      
      res.json({ 
        message: 'Video stopped',
        deck,
        status: activeDeck[deck].status
      });
    } else {
      // If no ffmpeg instance but deck exists, just update status
      console.log(`No active FFmpeg instance for ${deck}, updating status only`);
      activeDeck[deck].status = 'stopped';
      
      res.json({ 
        message: 'Video stopped (no active stream)',
        deck,
        status: activeDeck[deck].status
      });
    }
  } catch (error) {
    console.error(`Error stopping deck ${deck}:`, error);
    res.status(500).json({ 
      error: error.message,
      details: 'Internal server error while stopping video'
    });
  }
});

app.post('/api/deck/play', (req, res) => {
  const { deck } = req.body;
  
  console.log(`Play request received for deck: ${deck}`);
  
  if (!activeDeck[deck]) {
    console.error(`Error: No video loaded in deck ${deck}`);
    return res.status(400).json({ error: 'No video loaded in deck' });
  }
  
  try {
    console.log(`Starting playback for ${deck} with video: ${activeDeck[deck].videoFile}`);
    
    // Kill any existing FFmpeg process for this deck
    if (activeDeck[deck].ffmpeg) {
      try {
        activeDeck[deck].ffmpeg.kill();
      } catch (e) {
        console.log('Error killing existing FFmpeg process:', e);
      }
    }

    // Create new FFmpeg command with fixed streaming settings
    const ffmpegCommand = ffmpeg(path.join(VIDEO_DIR, activeDeck[deck].videoFile))
      .inputOptions([
        '-re', // Read input at native frame rate
        '-stream_loop -1' // Loop the video indefinitely
      ])
      .size('1280x720') // Downscale to 720p
      .outputOptions([
        '-c:v libx264', // Use H.264 codec
        '-preset veryfast', // Fast encoding preset
        '-maxrate 2000k', // Maximum bitrate
        '-bufsize 4000k', // Buffer size
        '-g 50', // Keyframe interval
        '-c:a aac', // AAC audio codec
        '-b:a 128k', // Audio bitrate
        '-ar 44100', // Audio sample rate
        '-pix_fmt yuv420p', // Pixel format
        '-profile:v high', // H.264 profile
        '-level 4.1', // H.264 level that supports our requirements
        '-f flv' // FLV output format
      ])
      .on('start', (commandLine) => {
        console.log('FFmpeg start command:', commandLine);
      })
      .on('stderr', (stderrLine) => {
        console.log('FFmpeg stderr:', stderrLine);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('FFmpeg error:', err.message);
        console.error('FFmpeg stderr:', stderr);
        // Don't kill the process here, just log the error
        activeDeck[deck].status = 'error';
      })
      .on('end', () => {
        console.log(`FFmpeg process ended for ${deck}`);
        activeDeck[deck].status = 'stopped';
      });

    // Start streaming to RTMP
    ffmpegCommand.output(`rtmp://localhost:1935/live/${deck}`);
    
    // Save the new FFmpeg command instance
    activeDeck[deck].ffmpeg = ffmpegCommand;
    
    // Start the stream
    ffmpegCommand.run();
    
    activeDeck[deck].status = 'playing';
    
    res.json({ 
      message: 'Video playing',
      deck,
      status: activeDeck[deck].status
    });
  } catch (error) {
    console.error(`Error playing deck ${deck}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to get video information
function getVideoInfo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(metadata);
    });
  });
}

// Update the load endpoint to include video probing
app.post('/api/deck/load', async (req, res) => {
  const { deck, videoFile } = req.body;
  
  console.log(`Load request received for deck: ${deck}, video: ${videoFile}`);
  
  if (!['deckA', 'deckB'].includes(deck)) {
    console.error(`Invalid deck specified: ${deck}`);
    return res.status(400).json({ error: 'Invalid deck specified' });
  }
  
  const videoPath = path.join(VIDEO_DIR, videoFile);
  console.log(`Checking video path: ${videoPath}`);
  
  if (!fs.existsSync(videoPath)) {
    console.error(`Video file not found at path: ${videoPath}`);
    return res.status(400).json({ error: 'Video file not found' });
  }
  
  try {
    // Get video information
    const videoInfo = await getVideoInfo(videoPath);
    console.log('Video info:', JSON.stringify(videoInfo, null, 2));

    // Stop current video if playing
    if (activeDeck[deck]) {
      console.log(`Stopping current video in ${deck}`);
      if (activeDeck[deck].ffmpeg) {
        activeDeck[deck].ffmpeg.kill();
      }
    }
    
    // Store video info and metadata
    activeDeck[deck] = {
      videoFile,
      ffmpeg: null,
      status: 'loaded',
      volume: 1.0,
      metadata: videoInfo
    };
    
    console.log(`Video successfully loaded in ${deck}`);
    res.json({ 
      message: 'Video loaded',
      deck,
      videoFile,
      metadata: videoInfo
    });
  } catch (error) {
    console.error(`Error loading video in deck ${deck}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Add this error handler at the bottom of your Express app
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message
  });
});

// Start servers
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Server running on port ${PORT}`);
});

nms.run();
