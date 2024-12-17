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

    // Get current scene collection for reference
    const { currentProgramSceneName } = await obs.call(
      "GetCurrentProgramScene",
    );
    console.log(`Current scene: ${currentProgramSceneName}`);

    // Create deck scenes and sources
    await createDeckScene(obs, djId, "A");
    console.log("Created Deck A scene");

    await createDeckScene(obs, djId, "B");
    console.log("Created Deck B scene");

    // Create the main scene that references them
    await createMainScene(obs, djId);
    console.log("Created main scene");

    // Set up transitions
    await setupTransitions(obs, djId);
    console.log("Set up transitions");

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
        restart_on_activate: false,
        close_when_inactive: false,
        buffering_mb: 2,
        speed_percent: 100,
        media_controls: true,
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

    // Set source properties
    await obs.call("SetSceneItemTransform", {
      sceneName,
      sceneItemId: await getSceneItemId(obs, sceneName, sourceName),
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        alignment: 5, // Center
        boundsType: "OBS_BOUNDS_STRETCH",
        boundsAlignment: 0,
        bounds: {
          x: 1920,
          y: 1080,
        },
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
    const deckAItemId = await obs.call("CreateSceneItem", {
      sceneName: mainSceneName,
      sourceName: deckASceneName,
    });

    // Add Deck B scene as source
    const deckBItemId = await obs.call("CreateSceneItem", {
      sceneName: mainSceneName,
      sourceName: deckBSceneName,
    });

    // Set initial transform for both decks
    await obs.call("SetSceneItemTransform", {
      sceneName: mainSceneName,
      sceneItemId: deckAItemId.sceneItemId,
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        alignment: 5,
        boundsType: "OBS_BOUNDS_STRETCH",
        boundsAlignment: 0,
        bounds: {
          x: 1920,
          y: 1080,
        },
      },
    });

    await obs.call("SetSceneItemTransform", {
      sceneName: mainSceneName,
      sceneItemId: deckBItemId.sceneItemId,
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        alignment: 5,
        boundsType: "OBS_BOUNDS_STRETCH",
        boundsAlignment: 0,
        bounds: {
          x: 1920,
          y: 1080,
        },
      },
    });

    // Set initial blend mode and opacity
    await obs.call("SetSceneItemBlendMode", {
      sceneName: mainSceneName,
      sceneItemId: deckAItemId.sceneItemId,
      sceneItemBlendMode: "OBS_BLEND_NORMAL",
    });

    await obs.call("SetSceneItemBlendMode", {
      sceneName: mainSceneName,
      sceneItemId: deckBItemId.sceneItemId,
      sceneItemBlendMode: "OBS_BLEND_NORMAL",
    });

    return mainSceneName;
  } catch (error) {
    console.error("Error creating main scene:", error);
    throw error;
  }
}

async function setupTransitions(obs: OBSWebSocket, djId: string) {
  try {
    // Create a stinger transition
    await obs.call("SetCurrentSceneTransition", {
      transitionName: "Fade",
    });

    await obs.call("SetCurrentSceneTransitionDuration", {
      transitionDuration: 200, // Duration in milliseconds
    });
  } catch (error) {
    console.error("Error setting up transitions:", error);
    throw error;
  }
}

async function getSceneItemId(
  obs: OBSWebSocket,
  sceneName: string,
  sourceName: string,
): Promise<number> {
  const response = await obs.call("GetSceneItemId", {
    sceneName,
    sourceName,
  });
  return response.sceneItemId;
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
