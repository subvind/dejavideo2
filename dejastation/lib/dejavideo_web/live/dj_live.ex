defmodule DejavideoWeb.DjLive do
  require Logger
  use DejavideoWeb, :live_view
  alias Dejavideo.StreamState
  import DejavideoWeb.Components.VideoPlayer

  @api_base_url "http://localhost:3000/api"

  # API endpoints
  @endpoints %{
    create_dj: "#{@api_base_url}/djs",
    deck_load: "#{@api_base_url}/decks/:deckId/load",
    deck_play: "#{@api_base_url}/decks/:deckId/play",
    deck_stop: "#{@api_base_url}/decks/:deckId/stop",
    deck_status: "#{@api_base_url}/decks/:deckId/status",
    broadcast_start: "#{@api_base_url}/broadcasts/dj/:djId/start",
    broadcast_stop: "#{@api_base_url}/broadcasts/:broadcastId/stop",
    broadcast_crossfader: "#{@api_base_url}/broadcasts/:broadcastId/crossfader",
    broadcast_status: "#{@api_base_url}/broadcasts/:broadcastId/status"
  }

  def mount(_params, session, socket) do
    if connected?(socket) do
      # Set up polling intervals
      :timer.send_interval(1000, self(), :update_decks)
      :timer.send_interval(1000, self(), :update_broadcast)
      # Initialize DJ if needed
      Process.send_after(self(), :initialize_dj, 0)
    end

    {:ok,
     assign(socket,
       # DJ State
       dj: nil,
       dj_id: session["dj_id"],
       initializing: true,

       # Deck States
       decks: %{
         "A" => %{
           id: nil,
           type: "A",
           status: "stopped",
           current_video: nil,
           stream_health: 100,
           volume: 1.0,
           stream_url: nil
         },
         "B" => %{
           id: nil,
           type: "B",
           status: "stopped",
           current_video: nil,
           stream_health: 100,
           volume: 1.0,
           stream_url: nil
         }
       },

       # Broadcast State
       broadcast: %{
         id: nil,
         status: "offline",
         channel_id: nil,
         stream_url: nil,
         crossfader_position: 0.5,
         uptime: 0,
         viewers: 0
       },

       # Media State
       videos: [],
       loading_video: false,
       video_error: nil,

       # YouTube Import State
       youtube_url: "",
       importing: false,
       import_error: nil
     )}
  end

  # dj initialization and managemnt
  def handle_info(:initialize_dj, socket) do
    case create_or_get_dj(socket.assigns.dj_id) do
      {:ok, dj} ->
        {:noreply,
         socket
         |> assign(:dj, dj)
         |> assign(:dj_id, dj["id"])
         |> assign(:initializing, false)
         |> assign_deck_ids(dj["decks"])}

      {:error, reason} ->
        {:noreply,
         socket
         |> put_flash(:error, reason)
         |> assign(:initializing, false)}
    end
  end

  defp create_or_get_dj(nil) do
    username = "dj_#{:rand.uniform(999)}"
    email = "dj#{:rand.uniform(999)}@example.com"

    case HTTPoison.post!(
           @endpoints.create_dj,
           Jason.encode!(%{
             username: username,
             email: email
           }),
           [{"Content-Type", "application/json"}]
         ) do
      %{status_code: status, body: body} when status in [200, 201] ->
        {:ok, Jason.decode!(body)["dj"]}

      %{status_code: status, body: body} when status in 400..499 ->
        error = Jason.decode!(body)["error"]
        {:error, "Failed to create DJ: #{error}"}

      error ->
        IO.inspect(error, label: "DJ Creation Error")
        {:error, "Failed to create DJ: unexpected error"}
    end
  end

  defp create_or_get_dj(dj_id) do
    # Get existing DJ
    case HTTPoison.get!("#{@api_base_url}/djs/#{dj_id}") do
      %{status_code: 200, body: body} -> {:ok, Jason.decode!(body)}
      error -> {:error, "Failed to fetch DJ"}
    end
  end

  defp assign_deck_ids(socket, decks) do
    updated_decks =
      Enum.reduce(decks, socket.assigns.decks, fn deck, acc ->
        Map.update!(acc, deck["type"], fn current_deck ->
          Map.merge(current_deck, %{
            "id" => deck["id"],
            "status" => deck["status"],
            "current_video" => deck["currentVideo"]
          })
        end)
      end)

    assign(socket, :decks, updated_decks)
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

  def handle_event("load_deck", %{"deck" => deck_type, "video_id" => video_id}, socket) do
    deck = get_in(socket.assigns.decks, [deck_type])

    case HTTPoison.post!(
           "#{@api_base_url}/decks/#{deck["id"]}/load",
           Jason.encode!(%{
             videoId: video_id
           })
         ) do
      %{status_code: 200, body: body} ->
        updated_deck = Jason.decode!(body)
        {:noreply, update_deck_state(socket, deck_type, updated_deck)}

      error ->
        {:noreply, put_flash(socket, :error, "Failed to load video")}
    end
  end

  def handle_event("play_deck", %{"deck" => deck_type}, socket) do
    deck = get_in(socket.assigns.decks, [deck_type])

    case HTTPoison.post!("#{@api_base_url}/decks/#{deck["id"]}/play", "") do
      %{status_code: 200, body: body} ->
        updated_deck = Jason.decode!(body)
        {:noreply, update_deck_state(socket, deck_type, updated_deck)}

      error ->
        {:noreply, put_flash(socket, :error, "Failed to play deck")}
    end
  end

  def handle_event("stop_deck", %{"deck" => deck_type}, socket) do
    deck = get_in(socket.assigns.decks, [deck_type])

    case HTTPoison.post!("#{@api_base_url}/decks/#{deck["id"]}/stop", "") do
      %{status_code: 200, body: body} ->
        updated_deck = Jason.decode!(body)
        {:noreply, update_deck_state(socket, deck_type, updated_deck)}

      error ->
        {:noreply, put_flash(socket, :error, "Failed to stop deck")}
    end
  end

  # Helper function to handle deck loading
  defp handle_deck_load(deck, video, socket) do
    # Debug log
    IO.puts("Loading #{video} into #{deck}")

    case HTTPoison.post!(
           "#{@api_base_url}/deck/load",
           Jason.encode!(%{
             deck: deck,
             videoFile: video
           }),
           [{"Content-Type", "application/json"}]
         ) do
      %{status_code: 200} ->
        # Convert deck string to atom (deck_a or deck_b)
        deck_atom =
          case deck do
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

  def handle_event("update_volume", %{"deck" => deck, "value" => volume}, socket) do
    volume_float = String.to_float(volume)

    case HTTPoison.post!(
           "#{@api_base_url}/deck/volume",
           Jason.encode!(%{
             deck: deck,
             volume: volume_float
           }),
           [{"Content-Type", "application/json"}]
         ) do
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

  def handle_event("start_broadcast", %{"channel_id" => channel_id}, socket) do
    case HTTPoison.post!(
           "#{@api_base_url}/broadcasts/dj/#{socket.assigns.dj_id}/start",
           Jason.encode!(%{channelId: channel_id})
         ) do
      %{status_code: 200, body: body} ->
        broadcast_data = Jason.decode!(body)

        {:noreply,
         socket
         |> assign(
           :broadcast,
           Map.merge(socket.assigns.broadcast, %{
             id: broadcast_data["id"],
             status: "live",
             channel_id: channel_id,
             stream_url: broadcast_data["streamUrl"]
           })
         )}

      error ->
        {:noreply, put_flash(socket, :error, "Failed to start broadcast")}
    end
  end

  def handle_event("stop_broadcast", _params, socket) do
    case HTTPoison.post!("#{@api_base_url}/broadcasts/#{socket.assigns.broadcast.id}/stop", "") do
      %{status_code: 200} ->
        {:noreply,
         socket
         |> assign(:broadcast, %{
           id: nil,
           status: "offline",
           channel_id: nil,
           stream_url: nil,
           crossfader_position: 0.5,
           uptime: 0,
           viewers: 0
         })}

      error ->
        {:noreply, put_flash(socket, :error, "Failed to stop broadcast")}
    end
  end

  def handle_event("update_crossfader", %{"position" => position}, socket) do
    case HTTPoison.post!(
           "#{@api_base_url}/broadcasts/#{socket.assigns.broadcast.id}/crossfader",
           Jason.encode!(%{position: String.to_float(position)})
         ) do
      %{status_code: 200} ->
        {:noreply,
         assign(
           socket,
           :broadcast,
           Map.put(socket.assigns.broadcast, :crossfader_position, String.to_float(position))
         )}

      error ->
        {:noreply, put_flash(socket, :error, "Failed to update crossfader")}
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

  def handle_info(:update_decks, socket) do
    updated_decks =
      Enum.map(socket.assigns.decks, fn {type, deck} ->
        case HTTPoison.get!("#{@api_base_url}/decks/#{deck.id}/status") do
          %{status_code: 200, body: body} ->
            {type, Jason.decode!(body)}

          _ ->
            {type, deck}
        end
      end)
      |> Enum.into(%{})

    {:noreply, assign(socket, :decks, updated_decks)}
  end

  def handle_info(:update_broadcast, socket) do
    if socket.assigns.broadcast.id do
      case HTTPoison.get!("#{@api_base_url}/broadcasts/#{socket.assigns.broadcast.id}/status") do
        %{status_code: 200, body: body} ->
          broadcast_status = Jason.decode!(body)

          {:noreply,
           assign(socket, :broadcast, Map.merge(socket.assigns.broadcast, broadcast_status))}

        _ ->
          {:noreply, socket}
      end
    else
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

  defp update_deck_state(socket, deck_type, deck_data) do
    assign(socket,
      decks:
        Map.update!(socket.assigns.decks, deck_type, fn deck ->
          Map.merge(deck, %{
            status: deck_data["status"],
            current_video: deck_data["currentVideo"]
          })
        end)
    )
  end

  defp fetch_deck_statuses(socket) do
    for {deck_type, deck} <- socket.assigns.decks do
      case HTTPoison.get!(String.replace(@endpoints.deck_status, ":deckId", deck.id)) do
        %{status_code: 200, body: body} ->
          {deck_type, Jason.decode!(body)}

        _ ->
          {deck_type, deck}
      end
    end
    |> Enum.into(%{})
  end

  defp update_deck_state(socket, deck_type, deck_data) do
    assign(socket,
      decks:
        Map.update!(socket.assigns.decks, deck_type, fn deck ->
          Map.merge(deck, deck_data)
        end)
    )
  end

  defp format_duration(seconds) when is_number(seconds) do
    {hours, remainder} = {div(seconds, 3600), rem(seconds, 3600)}
    {minutes, seconds} = {div(remainder, 60), rem(remainder, 60)}

    cond do
      hours > 0 -> "#{hours}h #{minutes}m #{seconds}s"
      minutes > 0 -> "#{minutes}m #{seconds}s"
      true -> "#{seconds}s"
    end
  end

  def render(assigns) do
    ~H"""
    <div class="min-h-screen bg-gray-900 text-white p-8">
      <%= if @initializing do %>
        <div class="flex items-center justify-center h-screen">
          <div class="text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p class="text-xl">Initializing DJ Console...</p>
          </div>
        </div>
      <% else %>
        <div class="min-h-screen bg-gray-900 text-white p-8">
          <!-- DJ Status Header -->
          <div class="mb-8 flex justify-between items-center">
            <h1 class="text-4xl font-bold">Video DJ Console</h1>
            <div class="bg-gray-800 px-4 py-2 rounded-lg">
              <span class="text-gray-400">DJ ID:</span>
              <span class="font-mono"><%= @dj_id %></span>
            </div>
          </div>

          <!-- Broadcast Control Panel -->
          <div class="mb-8 bg-gray-800 p-6 rounded-lg">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-2xl font-bold">Broadcast Control</h2>
              <div class="flex items-center space-x-2">
                <div class={[
                  "px-3 py-1 rounded-full",
                  @broadcast.status == "live" && "bg-green-600",
                  @broadcast.status == "offline" && "bg-red-600"
                ]}>
                  <%= String.upcase(@broadcast.status) %>
                </div>
                <%= if @broadcast.status == "live" do %>
                  <div class="text-sm text-gray-400">
                    Uptime: <%= format_duration(@broadcast.uptime) %>
                  </div>
                <% end %>
              </div>
            </div>

            <%= if @broadcast.status == "offline" do %>
              <form phx-submit="start_broadcast" class="flex space-x-4">
                <input
                  type="text"
                  name="channel_id"
                  placeholder="Enter channel ID"
                  class="flex-1 bg-gray-700 p-2 rounded"
                  required
                />
                <button
                  type="submit"
                  class="bg-green-600 px-4 py-2 rounded hover:bg-green-700 transition"
                  disabled={not all_decks_ready?(@decks)}
                >
                  Start Broadcasting
                </button>
              </form>
              <%= unless all_decks_ready?(@decks) do %>
                <p class="text-yellow-400 text-sm mt-2">
                  Both decks must be ready to start broadcasting
                </p>
              <% end %>
            <% else %>
              <div class="flex justify-between items-center">
                <div class="text-sm">
                  <p>Channel: <%= @broadcast.channel_id %></p>
                  <p class="font-mono text-gray-400">
                    Stream URL: <%= @broadcast.stream_url %>
                  </p>
                  <p>Viewers: <%= @broadcast.viewers %></p>
                </div>
                <button
                  phx-click="stop_broadcast"
                  class="bg-red-600 px-4 py-2 rounded hover:bg-red-700 transition"
                >
                  Stop Broadcasting
                </button>
              </div>
            <% end %>
          </div>

          <!-- Deck Controls -->
          <div class="grid grid-cols-2 gap-8 mb-8">
            <%= for {deck_type, deck} <- @decks do %>
              <div class="bg-gray-800 p-6 rounded-lg">
                <div class="flex justify-between items-center mb-4">
                  <h2 class="text-2xl font-bold">Deck <%= deck_type %></h2>
                  <div class={[
                    "px-3 py-1 rounded-full text-sm",
                    deck_status_color(deck.status)
                  ]}>
                    <%= String.upcase(deck.status) %>
                  </div>
                </div>

                <!-- Video Preview -->
                <div class="relative aspect-video bg-black rounded-lg mb-4 overflow-hidden">
                  <.preview
                    id={"deck-#{String.downcase(deck_type)}-preview"}
                    src={deck_stream_url(deck)}
                    autoplay={true}
                    muted={true}
                    controls={false}
                    type={'video/pm4'}
                  />

                  <!-- Stream Health Indicator -->
                  <div class={[
                    "absolute top-2 right-2 px-2 py-1 rounded text-xs",
                    stream_health_color(deck.stream_health)
                  ]}>
                    <%= deck.stream_health %>%
                  </div>
                </div>

                <!-- Video Selection -->
                <div class="mb-4">
                  <form phx-change={"select_video_#{String.downcase(deck_type)}"}>
                    <select
                      name="video_id"
                      class="w-full bg-gray-700 p-2 rounded"
                      disabled={deck.status in ["loading", "playing"]}
                    >
                      <option value="">Select Video</option>
                      <%= for video <- @videos do %>
                        <option
                          value={video.id}
                          selected={deck.current_video && deck.current_video.id == video.id}
                        >
                          <%= video.filename %>
                        </option>
                      <% end %>
                    </select>
                  </form>
                </div>

                <!-- Deck Controls -->
                <div class="flex space-x-4 mb-4">
                  <button
                    phx-click="play_deck"
                    phx-value-deck={deck_type}
                    class="bg-green-600 px-4 py-2 rounded hover:bg-green-700 transition"
                    disabled={deck.status not in ["loaded", "stopped"] or is_nil(deck.current_video)}
                  >
                    Play
                  </button>
                  <button
                    phx-click="stop_deck"
                    phx-value-deck={deck_type}
                    class="bg-red-600 px-4 py-2 rounded hover:bg-red-700 transition"
                    disabled={deck.status not in ["playing", "loading"]}
                  >
                    Stop
                  </button>
                </div>

                <!-- Volume Control -->
                <div class="mb-4">
                  <label class="block text-sm text-gray-400 mb-2">Volume</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={deck.volume}
                    class="w-full"
                    phx-change="update_volume"
                    phx-value-deck={deck_type}
                  />
                </div>

                <!-- Current Video Info -->
                <%= if deck.current_video do %>
                  <div class="text-sm text-gray-400">
                    <p>Current: <%= deck.current_video.filename %></p>
                    <p>Duration: <%= format_duration(deck.current_video.duration) %></p>
                  </div>
                <% end %>
              </div>
            <% end %>
          </div>

          <!-- Crossfader -->
          <%= if @broadcast.status == "live" do %>
            <div class="bg-gray-800 p-6 rounded-lg mb-8">
              <h2 class="text-2xl font-bold mb-4">Crossfader</h2>
              <div class="flex items-center space-x-4">
                <span class="text-sm">Deck A</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={@broadcast.crossfader_position}
                  class="flex-1"
                  phx-change="update_crossfader"
                  phx-debounce="100"
                />
                <span class="text-sm">Deck B</span>
              </div>
              <div class="text-center text-sm text-gray-400 mt-2">
                <%= Float.round(@broadcast.crossfader_position * 100, 1) %>% Deck B
              </div>
            </div>
          <% end %>

          <!-- YouTube Import -->
          <div class="bg-gray-800 p-6 rounded-lg">
            <h2 class="text-2xl font-bold mb-4">Import from YouTube</h2>
            <form phx-submit="import_youtube" class="flex space-x-4">
              <input
                type="text"
                name="url"
                value={@youtube_url}
                placeholder="YouTube URL"
                class="flex-1 bg-gray-700 p-2 rounded"
                disabled={@importing}
              />
              <button
                type="submit"
                class="bg-red-600 px-4 py-2 rounded hover:bg-red-700 transition"
                disabled={@importing}
              >
                <%= if @importing, do: "Importing...", else: "Import" %>
              </button>
            </form>
            <%= if @import_error do %>
              <p class="text-red-400 text-sm mt-2"><%= @import_error %></p>
            <% end %>
          </div>
        </div>
      <% end %>
    </div>
    """
  end

  # Helper functions for the template
  defp all_decks_ready?(decks) do
    Enum.all?(decks, fn {_, deck} ->
      deck.status in ["loaded", "playing"] and deck.stream_health > 50
    end)
  end

  defp deck_status_color(status) do
    case status do
      "playing" -> "bg-green-600"
      "loading" -> "bg-yellow-600"
      "loaded" -> "bg-blue-600"
      "stopped" -> "bg-red-600"
      _ -> "bg-gray-600"
    end
  end

  defp stream_health_color(health) when is_number(health) do
    cond do
      health >= 90 -> "bg-green-600"
      health >= 70 -> "bg-yellow-600"
      health >= 50 -> "bg-orange-600"
      true -> "bg-red-600"
    end
  end

  defp deck_stream_url(deck) do
    if deck.stream_url do
      deck.stream_url
    else
      "/media/blank.mp4"
    end
  end
end
