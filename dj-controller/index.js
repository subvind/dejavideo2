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

// Track active streams
const activeStreams = {
  deckA: false,
  deckB: false
};

// Keep track of active broadcasts by channel ID
const activeBroadcasts = new Map();

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
  
  if (!activeDeck[deck]) {
    return res.status(400).json({ error: 'No video loaded in deck' });
  }
  
  try {
    if (activeDeck[deck].ffmpeg) {
      activeDeck[deck].ffmpeg.kill();
    }
    
    // Ensure stream is marked as inactive
    activeStreams[deck] = false;
    activeDeck[deck].status = 'stopped';
    
    res.json({ 
      message: 'Video stopped',
      deck,
      status: 'stopped'
    });
  } catch (error) {
    console.error(`Error stopping deck ${deck}:`, error);
    res.status(500).json({ error: error.message });
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
        // Ensure stream is marked as inactive during transition
        activeStreams[deck] = false;
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
        // Don't mark stream as active yet - wait for actual RTMP connection
      })
      .on('stderr', (stderrLine) => {
        console.log('FFmpeg stderr:', stderrLine);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('FFmpeg error:', err.message);
        console.error('FFmpeg stderr:', stderr);
        activeStreams[deck] = false;
        activeDeck[deck].status = 'error';
      })
      .on('end', () => {
        console.log(`FFmpeg process ended for ${deck}`);
        activeStreams[deck] = false;
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
    activeStreams[deck] = false;
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

// First, update the broadcast/start endpoint to store more information
app.post('/api/broadcast/start', async (req, res) => {
  const { channelId } = req.body;
  
  if (!channelId) {
    return res.status(400).json({ error: 'Channel ID is required' });
  }
  
  try {
    // Stop existing broadcast if any
    if (activeBroadcasts.has(channelId)) {
      const existingBroadcast = activeBroadcasts.get(channelId);
      existingBroadcast.ffmpeg.kill();
      activeBroadcasts.delete(channelId);
    }

    // Create initial ffmpeg command
    const ffmpegCommand = createBroadcastCommand(channelId, 0.5);
    
    // Run the command
    ffmpegCommand.run();

    // Store the broadcast instance with more info
    activeBroadcasts.set(channelId, {
      ffmpeg: ffmpegCommand,
      startTime: Date.now(),
      crossfaderPosition: 0.5
    });

    res.json({
      message: 'Broadcast started',
      channelId,
      streamUrl: `rtmp://localhost:1935/live/channel_${channelId}`
    });
  } catch (error) {
    console.error('Failed to start broadcast:', error);
    res.status(500).json({ error: 'Failed to start broadcast' });
  }
});

// Add a helper function to create the FFmpeg command
// First, update the createBroadcastCommand function to handle crossfading properly
function createBroadcastCommand(channelId, position) {
  // Calculate weights - position 0 is full deckA, position 1 is full deckB
  const weight1 = 1 - position;
  const weight2 = position;

  console.log(`Creating broadcast command with weights: ${weight1} ${weight2}`);

  const ffmpegCommand = ffmpeg()
    // Input deck A
    .input('rtmp://localhost:1935/live/deckA')
    .inputOptions(['-re'])
    
    // Input deck B
    .input('rtmp://localhost:1935/live/deckB')
    .inputOptions(['-re'])
    
    // Add complex filtergraph with corrected mixing
    .complexFilter([
      // First normalize video streams to same fps and resolution
      {
        filter: 'fps',
        options: { fps: 30 },
        inputs: '0:v',
        outputs: 'v0_fps'
      },
      {
        filter: 'fps',
        options: { fps: 30 },
        inputs: '1:v',
        outputs: 'v1_fps'
      },
      {
        filter: 'scale',
        options: { w: 1280, h: 720 },
        inputs: 'v0_fps',
        outputs: 'v0_scaled'
      },
      {
        filter: 'scale',
        options: { w: 1280, h: 720 },
        inputs: 'v1_fps',
        outputs: 'v1_scaled'
      },
      // Add fade transition between videos
      {
        filter: 'blend',
        options: {
          all_mode: 'overlay',
          all_opacity: weight2
        },
        inputs: ['v0_scaled', 'v1_scaled'],
        outputs: 'v_blended'
      },
      // Handle audio mixing with proper normalization
      {
        filter: 'aresample',
        options: {
          async: 1000,
          first_pts: 0
        },
        inputs: '0:a',
        outputs: 'a0_resampled'
      },
      {
        filter: 'aresample',
        options: {
          async: 1000,
          first_pts: 0
        },
        inputs: '1:a',
        outputs: 'a1_resampled'
      },
      {
        filter: 'volume',
        options: { volume: weight1 },
        inputs: 'a0_resampled',
        outputs: 'a0_vol'
      },
      {
        filter: 'volume',
        options: { volume: weight2 },
        inputs: 'a1_resampled',
        outputs: 'a1_vol'
      },
      {
        filter: 'amix',
        options: {
          inputs: 2,
          duration: 'first'
        },
        inputs: ['a0_vol', 'a1_vol'],
        outputs: 'a_mixed'
      }
    ], ['v_blended', 'a_mixed'])
    
    // Output options optimized for streaming
    .outputOptions([
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-maxrate', '2500k',
      '-bufsize', '5000k',
      '-g', '60',
      '-keyint_min', '60',
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-ar', '44100',
      '-ac', '2',
      '-profile:v', 'high',
      '-level', '4.1',
      '-f', 'flv'
    ])
    .on('start', (commandLine) => {
      console.log('Started/Updated broadcast for channel:', channelId);
      console.log('FFmpeg command:', commandLine);
    })
    .on('error', (err, stdout, stderr) => {
      console.error('Broadcasting error:', err);
      console.error('FFmpeg stderr:', stderr);
      activeBroadcasts.delete(channelId);
    });

  // Set output
  ffmpegCommand.output(`rtmp://localhost:1935/live/channel_${channelId}`);

  return ffmpegCommand;
}

// Update the crossfade endpoint to validate stream status
app.post('/api/crossfade', async (req, res) => {
  const { position, channelId } = req.body;
  console.log('corssfade', position, channelId);
  
  if (!channelId || !activeBroadcasts.has(channelId)) {
    return res.status(400).json({ error: 'Invalid channel ID or no active broadcast' });
  }

  // Verify both decks are streaming
  if (!activeStreams.deckA || !activeStreams.deckB) {
    return res.status(400).json({ error: 'Both decks must be streaming to use crossfader' });
  }

  try {
    const broadcast = activeBroadcasts.get(channelId);
    
    // Kill the existing FFmpeg process
    if (broadcast.ffmpeg) {
      console.log('Stopping existing broadcast for crossfade update');
      broadcast.ffmpeg.kill();
    }

    // Create new FFmpeg command with updated position
    console.log('Creating new broadcast with updated crossfader position:', position);
    const newCommand = createBroadcastCommand(channelId, position);
    
    // Start the new stream
    newCommand.run();

    // Update the broadcast instance
    activeBroadcasts.set(channelId, {
      ffmpeg: newCommand,
      startTime: broadcast.startTime,
      crossfaderPosition: position
    });

    res.json({
      message: 'Crossfader updated',
      position,
      channelId
    });
  } catch (error) {
    console.error('Failed to update crossfader:', error);
    res.status(500).json({ error: 'Failed to update crossfader' });
  }
});

// Stop broadcasting
app.post('/api/broadcast/stop', async (req, res) => {
  const { channelId } = req.body;
  
  if (!channelId || !activeBroadcasts.has(channelId)) {
    return res.status(400).json({ error: 'Invalid channel ID or no active broadcast' });
  }

  try {
    const broadcast = activeBroadcasts.get(channelId);
    broadcast.ffmpeg.kill();
    activeBroadcasts.delete(channelId);

    res.json({
      message: 'Broadcast stopped',
      channelId
    });
  } catch (error) {
    console.error('Failed to stop broadcast:', error);
    res.status(500).json({ error: 'Failed to stop broadcast' });
  }
});

// Get broadcast status
app.get('/api/broadcast/status/:channelId', (req, res) => {
  const { channelId } = req.params;
  
  if (!channelId) {
    return res.status(400).json({ error: 'Channel ID is required' });
  }

  const broadcast = activeBroadcasts.get(channelId);
  
  if (!broadcast) {
    return res.json({
      channelId,
      status: 'inactive'
    });
  }

  res.json({
    channelId,
    status: 'active',
    uptime: Date.now() - broadcast.startTime,
    streamUrl: `rtmp://localhost:1935/live/channel_${channelId}`
  });
});

// Add stream status endpoint
app.get('/api/streams/status', (req, res) => {
  const hasActiveStreams = Object.values(activeStreams).some(status => status);
  
  res.json({
    streams: {
      deckA: activeStreams.deckA,
      deckB: activeStreams.deckB
    },
    hasActiveStreams
  });
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

// Update stream status when streams start/stop
nms.on('prePublish', (id, StreamPath, args) => {
  const streamKey = StreamPath.split('/').pop(); // Gets "deckA" or "deckB" from path
  if (streamKey === 'deckA' || streamKey === 'deckB') {
    activeStreams[streamKey] = true;
    console.log(`Stream started: ${streamKey}`);
  }
});

nms.on('donePublish', (id, StreamPath, args) => {
  const streamKey = StreamPath.split('/').pop();
  if (streamKey === 'deckA' || streamKey === 'deckB') {
    activeStreams[streamKey] = false;
    console.log(`Stream ended: ${streamKey}`);
  }
});

nms.run();
