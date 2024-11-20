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

// Add connection management
const streamConnections = {
  deckA: null,
  deckB: null,
  broadcast: null
};

// Add transition lock to prevent overlapping transitions
let transitionInProgress = false;

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

// Add connection monitoring
function monitorConnection(channelId) {
  nms.on('preConnect', (id, args) => {
    console.log('[RTMP] Client connecting:', id, args);
  });

  nms.on('postConnect', (id, args) => {
    console.log('[RTMP] Client connected:', id, args);
    if (args.app === 'live') {
      if (args.path === `/live/deckA`) {
        streamConnections.deckA = id;
      } else if (args.path === `/live/deckB`) {
        streamConnections.deckB = id;
      } else if (args.path === `/live/channel_${channelId}`) {
        streamConnections.broadcast = id;
      }
    }
  });

  nms.on('doneConnect', (id, args) => {
    console.log('[RTMP] Client disconnected:', id, args);
    Object.keys(streamConnections).forEach(key => {
      if (streamConnections[key] === id) {
        streamConnections[key] = null;
      }
    });
  });
}

// Add connection verification
async function verifyConnections() {
  return new Promise((resolve) => {
    const checkConnections = () => {
      if (streamConnections.deckA && streamConnections.deckB) {
        resolve(true);
      } else {
        setTimeout(checkConnections, 100);
      }
    };
    checkConnections();
  });
}

// Update the killFFmpegProcess function
async function killFFmpegProcess(ffmpeg, channelId) {
  return new Promise((resolve, reject) => {
    if (!ffmpeg) {
      resolve();
      return;
    }

    let killed = false;
    const timeout = setTimeout(() => {
      if (!killed) {
        console.log('Force killing FFmpeg process after timeout');
        ffmpeg.kill('SIGKILL');
        killed = true;
        resolve();
      }
    }, 2000);

    // Monitor the current connections
    const currentBroadcast = streamConnections.broadcast;

    ffmpeg.on('end', () => {
      killed = true;
      clearTimeout(timeout);
      console.log('FFmpeg process ended gracefully');
      resolve();
    });

    ffmpeg.on('error', (err) => {
      killed = true;
      clearTimeout(timeout);
      console.log('FFmpeg process ended with error:', err);
      resolve();
    });

    // First try graceful shutdown
    console.log('Attempting graceful FFmpeg shutdown');
    ffmpeg.kill('SIGTERM');
  });
}

function createBroadcastCommand(channelId, position) {
  const weight1 = 1 - position;
  const weight2 = position;

  console.log(`Creating broadcast command with weights: ${weight1} ${weight2}`);

  const ffmpegCommand = ffmpeg()
    // Input deck A with corrected buffering options
    .input('rtmp://localhost:1935/live/deckA')
    .inputOptions([
      '-re',
      '-thread_queue_size', '4096',
      '-max_delay', '500000',
      '-analyzeduration', '10M',
      '-probesize', '10M',
      '-fflags', 'nobuffer+genpts',
      '-flags', 'low_delay',
      '-rtmp_live', 'live',
      '-rtmp_buffer', '1000'
    ])
    
    // Input deck B with same corrections
    .input('rtmp://localhost:1935/live/deckB')
    .inputOptions([
      '-re',
      '-thread_queue_size', '4096',
      '-max_delay', '500000',
      '-analyzeduration', '10M',
      '-probesize', '10M',
      '-fflags', 'nobuffer+genpts',
      '-flags', 'low_delay',
      '-rtmp_live', 'live',
      '-rtmp_buffer', '1000'
    ])
    
    // Optimized filter graph
    .complexFilter([
      // Video processing
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
        options: { 
          w: 1280, 
          h: 720,
          flags: 'bicubic'
        },
        inputs: 'v0_fps',
        outputs: 'v0_scaled'
      },
      {
        filter: 'scale',
        options: { 
          w: 1280, 
          h: 720,
          flags: 'bicubic'
        },
        inputs: 'v1_fps',
        outputs: 'v1_scaled'
      },
      // Blend transition
      {
        filter: 'blend',
        options: {
          all_mode: 'overlay',
          c0_opacity: weight1,
          c1_opacity: weight2
        },
        inputs: ['v0_scaled', 'v1_scaled'],
        outputs: 'v_blended'
      },
      // Audio processing with corrected options
      {
        filter: 'aresample',
        options: {
          async: 1,
          first_pts: 0
        },
        inputs: '0:a',
        outputs: 'a0_resampled'
      },
      {
        filter: 'aresample',
        options: {
          async: 1,
          first_pts: 0
        },
        inputs: '1:a',
        outputs: 'a1_resampled'
      },
      {
        filter: 'amix',
        options: {
          inputs: 2,
          weights: `${weight1} ${weight2}`,
          normalize: 0,
          duration: 'longest'
        },
        inputs: ['a0_resampled', 'a1_resampled'],
        outputs: 'a_mixed'
      }
    ], ['v_blended', 'a_mixed'])
    
    // Updated output options with correct syntax
    .outputOptions([
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-maxrate', '2500k',
      '-bufsize', '5000k',
      '-g', '30',
      '-keyint_min', '30',
      '-x264opts', 'no-scenecut',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-ar', '44100',
      '-ac', '2',
      '-profile:v', 'baseline',
      '-level', '3.1',
      '-f', 'flv',
      '-movflags', '+faststart',
      '-fps_mode', 'cfr',       // Updated from -vsync
      '-max_interleave_delta', '0'
    ])
    .on('start', (commandLine) => {
      console.log('Started/Updated broadcast for channel:', channelId);
      console.log('FFmpeg command:', commandLine);
    })
    .on('stderr', (stderrLine) => {
      if (stderrLine.includes('Error') || 
          stderrLine.includes('Warning') || 
          stderrLine.includes('Connection')) {
        console.log('FFmpeg stderr:', stderrLine);
      }
    })
    .on('error', (err, stdout, stderr) => {
      console.error('Broadcasting error:', err);
      if (stderr) console.error('FFmpeg stderr:', stderr);
      transitionInProgress = false;
      activeBroadcasts.delete(channelId);
    });

  // Set output with retry options
  ffmpegCommand.output(`rtmp://localhost:1935/live/channel_${channelId}`);

  return ffmpegCommand;
}

app.post('/api/crossfade', async (req, res) => {
  const { position, channelId } = req.body;
  
  console.log('Crossfade request received:', { position, channelId });

  if (transitionInProgress) {
    return res.status(429).json({ error: 'Transition already in progress' });
  }

  if (!channelId || !activeBroadcasts.has(channelId)) {
    return res.status(400).json({ error: 'Invalid channel ID or no active broadcast' });
  }

  transitionInProgress = true;

  try {
    const broadcast = activeBroadcasts.get(channelId);
    
    // Store the current broadcast state
    const currentStatus = broadcast.ffmpeg ? 'active' : 'inactive';
    
    // Wait for connections to be established
    await verifyConnections();
    
    // Gracefully stop the existing FFmpeg process
    if (broadcast.ffmpeg) {
      console.log('Gracefully stopping existing broadcast');
      await killFFmpegProcess(broadcast.ffmpeg, channelId);
    }

    // Small delay to ensure clean transition
    await new Promise(resolve => setTimeout(resolve, 200));

    // Create and start new FFmpeg command
    console.log('Creating new broadcast with updated crossfader position:', position);
    const newCommand = createBroadcastCommand(channelId, position);
    
    // Update the broadcast instance
    activeBroadcasts.set(channelId, {
      ...broadcast,
      ffmpeg: newCommand,
      crossfaderPosition: position,
      lastTransition: Date.now(),
      status: currentStatus  // Preserve the previous status
    });

    // Start the new stream
    newCommand.run();

    // Wait for new connections to establish
    await verifyConnections();

    transitionInProgress = false;

    // Send response with preserved status
    res.json({
      message: 'Crossfader updated',
      position,
      channelId,
      status: currentStatus
    });
  } catch (error) {
    console.error('Failed to update crossfader:', error);
    transitionInProgress = false;
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

  // Check if we're in a transition
  const isTransitioning = transitionInProgress;
  
  // If transitioning, preserve the previous status
  const status = isTransitioning ? broadcast.status : 'active';

  res.json({
    channelId,
    status,
    uptime: Date.now() - broadcast.startTime,
    streamUrl: `rtmp://localhost:1935/live/channel_${channelId}`,
    crossfaderPosition: broadcast.crossfaderPosition
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

  // Initialize connection monitoring on server start
  monitorConnection();
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
