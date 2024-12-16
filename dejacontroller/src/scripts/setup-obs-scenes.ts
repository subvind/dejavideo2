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

    // Create DJ's main output scene
    await createMainScene(obs, djId);
    console.log(`Created main output scene for DJ ${djId}`);

    // Setup DJ's deck scenes
    await createDeckScene(obs, djId, "A");
    console.log(`Created Deck A scene for DJ ${djId}`);

    await createDeckScene(obs, djId, "B");
    console.log(`Created Deck B scene for DJ ${djId}`);

    console.log(`OBS scenes setup completed successfully for DJ ${djId}`);
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

async function createMainScene(obs: OBSWebSocket, djId: string) {
  const sceneName = `DJ_${djId}_Main`;

  try {
    // Create main scene
    await obs.call("CreateScene", { sceneName });

    // Add deck sources to main scene
    await obs.call("CreateSceneItem", {
      sceneName,
      sourceName: `DJ_${djId}_DeckA`,
      sceneItemEnabled: true,
    });

    await obs.call("CreateSceneItem", {
      sceneName,
      sourceName: `DJ_${djId}_DeckB`,
      sceneItemEnabled: true,
    });

    // Add crossfade transition
    await obs.call("CreateSourceFilter", {
      sourceName: `DJ_${djId}_Crossfade`,
      filterKind: "fade_transition",
      filterName: sceneName,
    });
  } catch (error) {
    console.error(`Error creating main scene for DJ ${djId}:`, error);
    throw error;
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
        clear_on_media_end: false,
      },
    });

    // Add volume filter
    await obs.call("CreateSourceFilter", {
      sourceName: sourceName,
      filterName: `DJ_${djId}_Deck${deck}Volume`,
      filterKind: "gain_filter",
      filterSettings: {
        db: 0,
      },
    });
  } catch (error) {
    console.error(`Error creating scene for DJ ${djId} Deck ${deck}:`, error);
    throw error;
  }
}

// Update the DJController to call this when creating a new DJ
export async function createDJScenes(djId: string) {
  await setupOBSScenes(djId);
}

// If running directly from command line
if (require.main === module) {
  // You can pass DJ ID as command line argument
  const djId = process.argv[2] || "test_dj";
  setupOBSScenes(djId);
}
