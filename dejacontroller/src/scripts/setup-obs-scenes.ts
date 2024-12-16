import OBSWebSocket from "obs-websocket-js";

async function setupOBSScenes(djId: string) {
  const obs = new OBSWebSocket();

  try {
    console.log("Attempting to connect to OBS WebSocket...");

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

    // First create deck scenes and sources
    await createDeckScene(obs, djId, "A");
    console.log("Created Deck A scene");

    await createDeckScene(obs, djId, "B");
    console.log("Created Deck B scene");

    // Then create the main scene that references them
    await createMainScene(obs, djId);
    console.log("Created main scene");

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
    throw error;
  } finally {
    await obs.disconnect();
  }
}

async function createDeckScene(
  obs: OBSWebSocket,
  djId: string,
  deck: "A" | "B",
) {
  const sceneName = `DJ_${djId}_Deck${deck}`;
  const sourceName = `DJ_${djId}_Deck${deck}Video`;

  try {
    // Create scene
    await obs.call("CreateScene", {
      sceneName,
    });

    // Create video source
    await obs.call("CreateInput", {
      inputName: sourceName,
      sceneName: sceneName,
      inputKind: "ffmpeg_source",
      inputSettings: {
        is_local_file: true,
        looping: false,
        restart_on_activate: true,
        clear_on_media_end: false,
      },
    });

    // Add volume filter
    await obs.call("CreateSourceFilter", {
      sourceName,
      filterName: `DJ_${djId}_Deck${deck}Volume`,
      filterKind: "gain_filter",
      filterSettings: {
        db: 0,
      },
    });

    return sceneName;
  } catch (error) {
    console.error(`Error creating deck scene ${deck}:`, error);
    throw error;
  }
}

async function createMainScene(obs: OBSWebSocket, djId: string) {
  const mainSceneName = `DJ_${djId}_Main`;
  const deckASceneName = `DJ_${djId}_DeckA`;
  const deckBSceneName = `DJ_${djId}_DeckB`;

  try {
    // Create main scene
    await obs.call("CreateScene", {
      sceneName: mainSceneName,
    });

    // Add Deck A scene as source
    await obs.call("CreateSceneItem", {
      sceneName: mainSceneName,
      sourceName: deckASceneName,
    });

    // Add Deck B scene as source
    await obs.call("CreateSceneItem", {
      sceneName: mainSceneName,
      sourceName: deckBSceneName,
    });

    return mainSceneName;
  } catch (error) {
    console.error("Error creating main scene:", error);
    throw error;
  }
}

export async function createDJScenes(djId: string) {
  return setupOBSScenes(djId);
}

// If running directly from command line
if (require.main === module) {
  const djId = process.argv[2] || "test_dj";
  setupOBSScenes(djId)
    .then(() => {
      console.log("Setup completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Setup failed:", error);
      process.exit(1);
    });
}
