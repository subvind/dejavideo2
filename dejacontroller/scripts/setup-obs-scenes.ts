import OBSWebSocket from "obs-websocket-js";

async function setupOBSScenes() {
  const obs = new OBSWebSocket();

  try {
    console.log("Attempting to connect to OBS WebSocket...");

    // You can specify connection options
    const { obsWebSocketVersion, negotiatedRpcVersion } = await obs.connect(
      "ws://localhost:4455",
      process.env.OBS_PASSWORD,
      {
        rpcVersion: 1,
      },
    );

    console.log(
      `Connected to OBS WebSocket v${obsWebSocketVersion} (using RPC ${negotiatedRpcVersion})`,
    );

    // Setup for Deck A
    await createDeckScene(obs, "A");
    console.log("Created Deck A scene");

    // Setup for Deck B
    await createDeckScene(obs, "B");
    console.log("Created Deck B scene");

    console.log("OBS scenes setup completed successfully");
  } catch (error: any) {
    if (error.code === 1006) {
      console.error("Failed to connect to OBS. Please check that:");
      console.error("1. OBS Studio is running");
      console.error("2. obs-websocket plugin is installed and enabled");
      console.error(
        "3. WebSocket server is enabled in Tools > obs-websocket Settings",
      );
      console.error("4. Port 4455 is set in obs-websocket Settings");
    } else {
      console.error("Error setting up OBS scenes:", error);
    }
    process.exit(1);
  } finally {
    obs.disconnect();
  }
}

async function createDeckScene(obs: OBSWebSocket, deck: "A" | "B") {
  const sceneName = `Deck${deck}`;
  const sourceName = `Deck${deck}Video`;

  try {
    // Create scene
    await obs.call("CreateScene", { sceneName });

    // Create video source
    await obs.call("CreateInput", {
      sceneName,
      inputName: sourceName,
      inputKind: "ffmpeg_source",
      inputSettings: {
        is_local_file: true,
        looping: false,
        restart_on_activate: true,
      },
    });
  } catch (error) {
    console.error(`Error creating scene for Deck ${deck}:`, error);
    throw error;
  }
}

setupOBSScenes();
