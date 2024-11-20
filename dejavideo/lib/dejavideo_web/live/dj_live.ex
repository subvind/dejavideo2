defmodule DejavideoWeb.DjLive do
  require Logger
  use DejavideoWeb, :live_view
  alias Dejavideo.StreamState

  @api_base_url "http://localhost:3000/api"

  def mount(_params, _session, socket) do
    if connected?(socket) do
      :timer.send_interval(1000, self(), :update_status)
      :timer.send_interval(1000, self(), :update_broadcast_status)
      :timer.send_interval(1000, self(), :update_stream_status)
    end

    {:ok,
     assign(socket,
       videos: [],
       deck_a: %{status: "stopped", volume: 1.0, current_video: nil},
       deck_b: %{status: "stopped", volume: 1.0, current_video: nil},
       crossfader: 0.5,
       importing: false,
       youtube_url: "",
       video_info: nil,
       import_error: nil,
       # New broadcast-related assigns
       broadcast_status: "inactive",
       channel_id: nil,
       stream_url: nil,
       broadcast_uptime: 0,
       broadcast_error: nil,
       deck_streams: %{
         "deckA" => false,
         "deckB" => false
       },
       has_active_streams: false,
       last_broadcast_check: nil
     ), temporary_assigns: []}
  end

  # Stream status handler
  def handle_info(:update_stream_status, socket) do
    case HTTPoison.get!("#{@api_base_url}/streams/status") do
      %{status_code: 200, body: body} ->
        status = Jason.decode!(body)
        Logger.debug("Stream status update: #{inspect(status)}")

        {:noreply,
          assign(socket,
            deck_streams: status["streams"],
            has_active_streams: status["hasActiveStreams"]
          )}

      error ->
        Logger.error("Failed to fetch stream status: #{inspect(error)}")
        {:noreply, socket}
    end
  end

  # Update broadcast status handler
  def handle_info(:update_broadcast_status, socket) do
    if socket.assigns.channel_id do
      case HTTPoison.get!("#{@api_base_url}/broadcast/status/#{socket.assigns.channel_id}") do
        %{status_code: 200, body: body} ->
          status = Jason.decode!(body)
          Logger.debug("Broadcast status update: #{inspect(status)}")

          {:noreply,
            assign(socket,
              broadcast_status: status["status"],
              broadcast_uptime: status["uptime"] || 0,
              stream_url: status["streamUrl"],
              last_broadcast_check: System.system_time(:second)
            )}

        error ->
          Logger.error("Failed to fetch broadcast status: #{inspect(error)}")
          {:noreply, socket}
      end
    else
      {:noreply, socket}
    end
  end

  # Modified load_deck handler to correctly handle the deck parameter
  def handle_event("load_deck", %{"deck" => deck, "video" => video}, socket) when video != "" do
    # Convert deck select value to proper format (e.g., "deck_a" to "deckA")
    formatted_deck = case deck do
      "deck_a" -> "deckA"
      "deck_b" -> "deckB"
      _ -> deck
    end

    case HTTPoison.post!("#{@api_base_url}/deck/load", Jason.encode!(%{
           deck: formatted_deck,
           videoFile: video
         }), [{"Content-Type", "application/json"}]) do
      %{status_code: 200} ->
        deck_atom = String.to_atom(String.downcase(formatted_deck))
        StreamState.update_deck(deck_atom, %{
          status: "loaded",
          current_video: video,
          volume: 1.0
        })

        {:noreply, socket}
      _ ->
        {:noreply, put_flash(socket, :error, "Failed to load video")}
    end
  end

  # Modified load_deck handler to handle the correct parameter structure
  def handle_event("load_deck_a", %{"video" => video}, socket) when video != "" do
    handle_deck_load("deckA", video, socket)
  end

  def handle_event("load_deck_b", %{"video" => video}, socket) when video != "" do
    handle_deck_load("deckB", video, socket)
  end

  # Helper function to handle deck loading
  defp handle_deck_load(deck, video, socket) do
    IO.puts("Loading #{video} into #{deck}") # Debug log

    case HTTPoison.post!("#{@api_base_url}/deck/load", Jason.encode!(%{
           deck: deck,
           videoFile: video
         }), [{"Content-Type", "application/json"}]) do
      %{status_code: 200} ->
        # Convert deck string to atom (deck_a or deck_b)
        deck_atom = case deck do
          "deckA" -> :deck_a
          "deckB" -> :deck_b
        end

        new_state = %{
          status: "loaded",
          current_video: video,
          volume: 1.0
        }

        # Update both StreamState and socket assigns
        StreamState.update_deck(deck_atom, new_state)
        {:noreply, assign(socket, deck_atom, new_state)}

      _ ->
        {:noreply, put_flash(socket, :error, "Failed to load video")}
    end
  end

  # Updated play_deck handler to use consistent deck naming
  def handle_event("play_deck", %{"deck" => deck}, socket) do
    IO.puts("Playing deck: #{deck}") # Debug log

    # Ensure deck name is in correct format
    formatted_deck = case deck do
      "deck_a" -> "deckA"
      "deck_b" -> "deckB"
      _ -> deck
    end

    case HTTPoison.post!("#{@api_base_url}/deck/play", Jason.encode!(%{deck: formatted_deck}), [
           {"Content-Type", "application/json"}
         ]) do
      %{status_code: 200} ->
        # Convert deck string to atom for socket assigns
        deck_atom = case formatted_deck do
          "deckA" -> :deck_a
          "deckB" -> :deck_b
        end

        current_state = StreamState.get_deck_status(deck_atom)
        new_state = %{current_state | status: "playing"}

        # Update both StreamState and socket assigns
        StreamState.update_deck(deck_atom, new_state)
        {:noreply, assign(socket, deck_atom, new_state)}

      _ ->
        {:noreply, put_flash(socket, :error, "Failed to play video")}
    end
  end

  def handle_event("stop_deck", %{"deck" => deck}, socket) do
    IO.puts("Stopping deck: #{deck}") # Debug log

    # Ensure deck name is in correct format
    formatted_deck = case deck do
      "deck_a" -> "deckA"
      "deck_b" -> "deckB"
      _ -> deck
    end

    IO.puts("Making stop request for deck: #{formatted_deck}")  # Additional debug log

    # Add debug logging for request
    result = HTTPoison.post!(
      "#{@api_base_url}/deck/stop",
      Jason.encode!(%{deck: formatted_deck}),
      [{"Content-Type", "application/json"}]
    )

    IO.puts("Stop request response status: #{result.status_code}")  # Log response status
    IO.puts("Stop request response body: #{result.body}")  # Log response body

    case result do
      %{status_code: 200} ->
        # Convert deck string to atom for socket assigns
        deck_atom = case formatted_deck do
          "deckA" -> :deck_a
          "deckB" -> :deck_b
        end

        current_state = StreamState.get_deck_status(deck_atom)
        new_state = %{
          current_state |
          status: "stopped"
        }

        # Update both StreamState and socket assigns
        StreamState.update_deck(deck_atom, new_state)
        {:noreply, assign(socket, deck_atom, new_state)}

      error ->
        IO.puts("Failed to stop deck: #{formatted_deck}. Error: #{inspect(error)}") # Enhanced error logging
        {:noreply, put_flash(socket, :error, "Failed to stop video")}
    end
  end

  def handle_event("update_volume", %{"deck" => deck, "value" => volume}, socket) do
    volume_float = String.to_float(volume)

    case HTTPoison.post!("#{@api_base_url}/deck/volume", Jason.encode!(%{
           deck: deck,
           volume: volume_float
         }), [{"Content-Type", "application/json"}]) do
      %{status_code: 200} ->
        deck_atom = String.to_atom(String.downcase(deck))
        current_state = StreamState.get_deck_status(deck_atom)

        new_state = %{current_state | volume: volume_float}
        StreamState.update_deck(deck_atom, new_state)

        socket = assign(socket, deck_atom, new_state)
        {:noreply, socket}
      _ ->
        {:noreply, put_flash(socket, :error, "Failed to update volume")}
    end
  end

  # Add broadcast control event handlers
  def handle_event("start_broadcast", %{"channel_id" => channel_id}, socket) when byte_size(channel_id) > 0 do
    if socket.assigns.has_active_streams do
      case HTTPoison.post!(
        "#{@api_base_url}/broadcast/start",
        Jason.encode!(%{channelId: channel_id}),
        [{"Content-Type", "application/json"}]
      ) do
        %{status_code: 200, body: body} ->
          response = Jason.decode!(body)
          # Immediately trigger a status update
          send(self(), :update_broadcast_status)
          {:noreply,
           socket
           |> assign(
             channel_id: channel_id,
             broadcast_status: "active",
             stream_url: response["streamUrl"],
             broadcast_error: nil
           )
           |> put_flash(:info, "Broadcast started")}

        error ->
          Logger.error("Failed to start broadcast: #{inspect(error)}")
          {:noreply,
           socket
           |> assign(broadcast_error: "Failed to start broadcast")
           |> put_flash(:error, "Failed to start broadcast")}
      end
    else
      {:noreply,
       socket
       |> assign(broadcast_error: "No active deck streams available")
       |> put_flash(:error, "Please start at least one deck before broadcasting")}
    end
  end

  def handle_event("stop_broadcast", _, socket) do
    if socket.assigns.channel_id do
      case HTTPoison.post!("#{@api_base_url}/broadcast/stop", Jason.encode!(%{
             channelId: socket.assigns.channel_id
           }), [{"Content-Type", "application/json"}]) do
        %{status_code: 200} ->
          {:noreply,
           socket
           |> assign(
             broadcast_status: "inactive",
             channel_id: nil,
             stream_url: nil,
             broadcast_uptime: 0,
             broadcast_error: nil
           )
           |> put_flash(:info, "Broadcast stopped")}

        _ ->
          {:noreply,
           socket
           |> assign(broadcast_error: "Failed to stop broadcast")
           |> put_flash(:error, "Failed to stop broadcast")}
      end
    else
      {:noreply, socket}
    end
  end

  def handle_event("update_crossfader", %{"value" => position}, socket) do
    Logger.info("Crossfader event received with position: #{position}")

    position_float = case position do
      pos when is_binary(pos) -> String.to_float(pos)
      pos when is_float(pos) -> pos
      pos when is_integer(pos) -> pos / 1
    end

    # Always update local state first
    socket = assign(socket, :crossfader, position_float)

    if socket.assigns.broadcast_status == "active" and socket.assigns.channel_id do
      Logger.info("Sending crossfade request - position: #{position_float}, channel: #{socket.assigns.channel_id}")

      case HTTPoison.post!(
        "#{@api_base_url}/crossfade",
        Jason.encode!(%{
          position: position_float,
          channelId: socket.assigns.channel_id
        }),
        [{"Content-Type", "application/json"}]
      ) do
        %{status_code: 200} ->
          Logger.info("Crossfade request successful")
          # Force an immediate broadcast status check
          send(self(), :update_broadcast_status)
          {:noreply, socket}

        error ->
          Logger.error("Crossfade request failed: #{inspect(error)}")
          {:noreply, put_flash(socket, :error, "Failed to update crossfader")}
      end
    else
      Logger.info("Broadcast not active, only updating local state")
      {:noreply, socket}
    end
  end

  # Add broadcast status polling handler
  def handle_info(:update_broadcast_status, socket) do
    if socket.assigns.channel_id do
      case HTTPoison.get!("#{@api_base_url}/broadcast/status/#{socket.assigns.channel_id}") do
        %{status_code: 200, body: body} ->
          status = Jason.decode!(body)

          {:noreply,
           assign(socket,
             broadcast_status: status["status"],
             broadcast_uptime: status["uptime"] || 0
           )}

        _ ->
          {:noreply, socket}
      end
    else
      {:noreply, socket}
    end
  end

  # New event handler for fetching video info
  def handle_event("fetch_video_info", %{"value" => url}, socket) when byte_size(url) > 0 do
    case HTTPoison.get!("#{@api_base_url}/import/youtube/info?url=#{URI.encode(url)}") do
      %{status_code: 200, body: body} ->
        video_info = Jason.decode!(body)
        {:noreply, assign(socket, video_info: video_info, youtube_url: url, import_error: nil)}

      %{status_code: 500, body: body} ->
        error = Jason.decode!(body)["error"]
        {:noreply, assign(socket, import_error: error, video_info: nil)}

      _ ->
        {:noreply, assign(socket, import_error: "Failed to fetch video info", video_info: nil)}
    end
  end

  def handle_event("fetch_video_info", %{"value" => ""}, socket) do
    {:noreply, assign(socket, video_info: nil, import_error: nil)}
  end

  def handle_event("import_youtube", %{"url" => url}, socket) do
    case HTTPoison.post!("#{@api_base_url}/import/youtube", Jason.encode!(%{url: url}), [
           {"Content-Type", "application/json"}
         ]) do
      %{status_code: 200} ->
        {:noreply,
         socket
         |> assign(importing: true, youtube_url: "", video_info: nil)
         |> put_flash(:info, "Video import started")}

      %{status_code: 500, body: body} ->
        error = Jason.decode!(body)["error"]
        {:noreply, assign(socket, import_error: error)}

      _ ->
        {:noreply, put_flash(socket, :error, "Failed to import video")}
    end
  end

  # Update video list handler
  def handle_info(:update_status, socket) do
    case HTTPoison.get!("#{@api_base_url}/videos") do
      %{status_code: 200, body: body} ->
        videos = Jason.decode!(body)["videos"]
        {:noreply, assign(socket, videos: videos)}

      error ->
        Logger.error("Failed to fetch videos: #{inspect(error)}")
        {:noreply, socket}
    end
  end

  # Add error handling for unexpected messages
  def handle_info(msg, socket) do
    Logger.warning("Received unexpected message: #{inspect(msg)}")
    {:noreply, socket}
  end

  # Add helper function to check broadcast health
  defp broadcast_healthy?(socket) when is_map(socket) do
    socket.broadcast_status == "active" and
      socket.channel_id != nil and
      socket.last_broadcast_check != nil and
      System.system_time(:second) - socket.last_broadcast_check < 5
  end

  def render(assigns) do
    ~H"""
    <div class="min-h-screen bg-gray-900 text-white p-8">
      <h1 class="text-4xl font-bold mb-8">Video DJ Controller</h1>

      <!-- Broadcast Status Section -->
      <div class={[
        "mb-4 p-2 rounded",
        if(broadcast_healthy?(assigns), do: "bg-green-800/20", else: "bg-red-800/20")
      ]}>
        <div class="flex items-center justify-between">
          <div>
            <span class="font-bold">Broadcast Status: </span>
            <span class={if(broadcast_healthy?(assigns), do: "text-green-400", else: "text-red-400")}>
              <%= @broadcast_status %>
            </span>
          </div>
          <%= if @channel_id do %>
            <div class="text-sm">Channel: <%= @channel_id %></div>
          <% end %>
          <%= if @broadcast_uptime > 0 do %>
            <div class="text-sm">Uptime: <%= format_duration(@broadcast_uptime/1000) %></div>
          <% end %>
        </div>
      </div>

      <!-- Add Broadcast Control Panel -->
        <div class="mb-8 bg-gray-800 p-6 rounded-lg">
        <h2 class="text-2xl font-bold mb-4">Broadcast Control</h2>

        <div class="mb-4 grid grid-cols-2 gap-4">
          <div class="text-sm">
            <p class="mb-2">Deck A:
              <%= if @deck_streams["deckA"] do %>
                <span class="text-green-400">Active</span>
              <% else %>
                <span class="text-red-400">Inactive</span>
              <% end %>
            </p>
            <p>Deck B:
              <%= if @deck_streams["deckB"] do %>
                <span class="text-green-400">Active</span>
              <% else %>
                <span class="text-red-400">Inactive</span>
              <% end %>
            </p>
          </div>
        </div>

        <%= if @broadcast_status == "inactive" do %>
          <form phx-submit="start_broadcast" class="flex space-x-4 mb-4">
            <input
              type="text"
              name="channel_id"
              placeholder="Enter channel ID"
              class="flex-1 bg-gray-700 p-2 rounded"
              required
            />
            <button
              type="submit"
              class="bg-green-600 px-4 py-2 rounded disabled:opacity-50"
              disabled={not @has_active_streams}
            >
              Start Broadcasting
            </button>
          </form>
          <%= if not @has_active_streams do %>
            <p class="text-yellow-400 text-sm">Start at least one deck to enable broadcasting</p>
          <% end %>
        <% else %>
          <div class="mb-4">
            <div class="flex justify-between items-center">
              <div>
                <p class="text-green-400 font-bold">Broadcasting Active</p>
                <p class="text-sm">Channel ID: <%= @channel_id %></p>
                <p class="text-sm">Stream URL: <%= @stream_url %></p>
                <p class="text-sm">Uptime: <%= format_duration(@broadcast_uptime/1000) %></p>
              </div>
              <button
                phx-click="stop_broadcast"
                class="bg-red-600 px-4 py-2 rounded"
              >
                Stop Broadcasting
              </button>
            </div>
          </div>
        <% end %>

        <%= if @broadcast_error do %>
          <div class="bg-red-900/50 text-red-200 p-3 rounded">
            <%= @broadcast_error %>
          </div>
        <% end %>
      </div>

      <div class="grid grid-cols-2 gap-8">
        <!-- Deck A -->
        <div class="bg-gray-800 p-6 rounded-lg">
          <h2 class="text-2xl font-bold mb-4">Deck A</h2>

          <div class="relative aspect-video bg-black rounded">
            <video
              id="deck-a-player"
              class="w-full h-full video-js vjs-default-skin"
              data-setup='{"fluid": true, "techOrder": ["flash", "html5"]}'
            >
              <source src={"http://localhost:1935/live/deckA/index.m3u8"} type="application/x-mpegURL" />
            </video>
          </div>

          <br />

          <div class="mb-4">
            <form phx-change="load_deck_a">
              <select class="w-full bg-gray-700 p-2 rounded" name="video">
                <option value="">Select Video</option>
                <%= for video <- @videos do %>
                  <option value={video["filename"]} selected={@deck_a.current_video == video["filename"]}>
                    <%= video["filename"] %>
                  </option>
                <% end %>
              </select>
            </form>
          </div>

          <div class="flex space-x-4 mb-4">
            <button class="bg-green-600 px-4 py-2 rounded"
                    phx-click="play_deck"
                    phx-value-deck="deckA"
                    disabled={is_nil(@deck_a.current_video)}>
              Play
            </button>
            <button class="bg-red-600 px-4 py-2 rounded"
                    phx-click="stop_deck"
                    phx-value-deck="deckA"
                    disabled={is_nil(@deck_a.current_video)}>
              Stop
            </button>
          </div>

          <div class="mb-4">
            <label class="block mb-2">Volume</label>
            <input type="range"
                   min="0"
                   max="1"
                   step="0.1"
                   value={@deck_a.volume}
                   class="w-full"
                   phx-change="update_volume"
                   phx-value-deck="deckA" />
          </div>

          <div class="text-sm">
            <p>Status: <%= @deck_a.status %></p>
            <p>Current: <%= @deck_a.current_video %></p>
          </div>
        </div>

        <!-- Deck B -->
        <div class="bg-gray-800 p-6 rounded-lg">
          <h2 class="text-2xl font-bold mb-4">Deck B</h2>

          <div class="relative aspect-video bg-black rounded">
            <video
              id="deck-b-player"
              class="w-full h-full video-js vjs-default-skin"
              data-setup='{"fluid": true, "techOrder": ["flash", "html5"]}'
            >
              <source src={"rtmp://localhost:1935/live/deckB"} type="rtmp/mp4" />
            </video>
          </div>

          <br />

          <div class="mb-4">
            <form phx-change="load_deck_b">
              <select class="w-full bg-gray-700 p-2 rounded" name="video">
                <option value="">Select Video</option>
                <%= for video <- @videos do %>
                  <option value={video["filename"]} selected={@deck_b.current_video == video["filename"]}>
                    <%= video["filename"] %>
                  </option>
                <% end %>
              </select>
            </form>
          </div>

          <div class="flex space-x-4 mb-4">
            <button class="bg-green-600 px-4 py-2 rounded"
                    phx-click="play_deck"
                    phx-value-deck="deckB"
                    disabled={is_nil(@deck_b.current_video)}>
              Play
            </button>
            <button class="bg-red-600 px-4 py-2 rounded"
                    phx-click="stop_deck"
                    phx-value-deck="deckB"
                    disabled={is_nil(@deck_b.current_video)}>
              Stop
            </button>
          </div>

          <div class="mb-4">
            <label class="block mb-2">Volume</label>
            <input type="range"
                   min="0"
                   max="1"
                   step="0.1"
                   value={@deck_b.volume}
                   class="w-full"
                   phx-change="update_volume"
                   phx-value-deck="deckB" />
          </div>

          <div class="text-sm">
            <p>Status: <%= @deck_b.status %></p>
            <p>Current: <%= @deck_b.current_video %></p>
          </div>
        </div>
      </div>


    <!-- Crossfader -->
    <div class="mt-8 bg-gray-800 p-6 rounded-lg">
      <h2 class="text-2xl font-bold mb-4">Crossfader</h2>
      <div class="mb-2 text-sm text-gray-400">
        <%= if @broadcast_status == "active" do %>
          <div class="flex justify-between items-center">
            <span>Mix Control: <%= Float.round(@crossfader * 100, 1) %>% Deck B</span>
            <%= if not (@deck_streams["deckA"] and @deck_streams["deckB"]) do %>
              <span class="text-yellow-400">Both decks must be streaming to enable mixing</span>
            <% end %>
          </div>
        <% else %>
          Start broadcasting to mix both decks
        <% end %>
      </div>

      <form phx-change="update_crossfader" phx-debounce="100">
        <input
          type="range"
          name="value"
          min="0"
          max="1"
          step="0.01"
          value={@crossfader}
          class="w-full slider-input"
          disabled={@broadcast_status != "active"}
        />
        <%= if @broadcast_status == "active" do %>
          <div class="text-xs text-gray-400 mt-1">
            Current position: <%= Float.round(@crossfader, 2) %>
          </div>
        <% end %>
      </form>

      <div class="flex justify-between text-sm mt-1">
        <span>100% Deck A</span>
        <span>100% Deck B</span>
      </div>

      <!-- Debug info -->
      <div class="mt-2 text-xs text-gray-500">
        <p>Broadcast Status: <%= @broadcast_status %></p>
        <p>Channel ID: <%= @channel_id %></p>
        <p>Crossfader Position: <%= @crossfader %></p>
        <p>Deck A Streaming: <%= @deck_streams["deckA"] %></p>
        <p>Deck B Streaming: <%= @deck_streams["deckB"] %></p>
      </div>
    </div>

      <!-- YouTube Import -->
      <div class="mt-8 bg-gray-800 p-6 rounded-lg">
        <h2 class="text-2xl font-bold mb-4">Import from YouTube</h2>
        <form phx-submit="import_youtube" class="flex space-x-4">
          <input type="text"
                 name="url"
                 value={@youtube_url}
                 placeholder="YouTube URL"
                 class="flex-1 bg-gray-700 p-2 rounded" />
          <button type="submit" class="bg-red-600 px-4 py-2 rounded">
            Import
          </button>
        </form>
      </div>
    </div>
    """
  end

  # Add helper function for formatting broadcast uptime
  defp format_duration(seconds) when is_number(seconds) do
    total_seconds = trunc(seconds)  # Convert float to integer
    hours = div(total_seconds, 3600)
    minutes = div(rem(total_seconds, 3600), 60)
    secs = rem(total_seconds, 60)

    cond do
      hours > 0 -> "#{hours}h #{minutes}m #{secs}s"
      minutes > 0 -> "#{minutes}m #{secs}s"
      true -> "#{secs}s"
    end
  end
  defp format_duration(_), do: "0s"
end
