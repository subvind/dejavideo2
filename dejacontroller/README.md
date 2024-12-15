# DejaController

DejaController is a backend service that manages video mixing and broadcasting for DJs, allowing them to stream and mix video content in real-time using dual deck controls.

## Features

- Dual deck video mixing system
- Real-time RTMP streaming
- OBS integration for video processing
- DJ management with multiple decks
- Live broadcasting with crossfader control
- Video loading and playback controls
- Stream health monitoring
- Multi-DJ support with isolated instances

## Technologies

- Node.js
- TypeScript
- Express.js
- TypeORM
- SQLite
- OBS WebSocket
- Node Media Server (RTMP)
- Socket.IO

## Prerequisites

- Node.js (v14 or higher)
- OBS Studio
- FFmpeg

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/dejacontroller.git
cd dejacontroller
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with the following configurations:
```env
OBS_PASSWORD=your_obs_websocket_password
PORT=3000
```

4. Start the application:
```bash
npm run build
npm start
```

## API Endpoints

### DJ Management
- `POST /dj` - Create a new DJ
- `GET /dj` - Get all DJs
- `GET /dj/:id` - Get specific DJ
- `PATCH /dj/:id/status` - Update DJ status
- `DELETE /dj/:id` - Delete DJ

### Deck Controls
- `POST /deck/:deckId/load` - Load video to deck
- `POST /deck/:deckId/play` - Start playback
- `POST /deck/:deckId/stop` - Stop playback
- `GET /deck/:deckId/status` - Get deck status

### Broadcasting
- `POST /broadcast/dj/:djId/start` - Start broadcasting
- `POST /broadcast/:broadcastId/crossfader` - Update crossfader position
- `POST /broadcast/:broadcastId/stop` - Stop broadcasting
- `GET /broadcast/:broadcastId/status` - Get broadcast status

## Architecture

The system consists of several key components:

- **StreamManager**: Manages OBS instances and RTMP streams
- **OBSService**: Handles individual OBS instance control
- **RTMPService**: Manages RTMP streaming
- **Controllers**: Handle API endpoints and business logic
- **Entities**: Define data models for DJs, Decks, Videos, and Broadcasts

## Development

To run in development mode with auto-reload:

```bash
npm run dev
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

UNLICENSED
