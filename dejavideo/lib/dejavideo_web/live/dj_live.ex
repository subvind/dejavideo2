defmodule DejavideoWeb.DjLive do
  use DejavideoWeb, :live_view
  alias Dejavideo.StreamState

  @api_base_url "http://localhost:3000/api"

  def mount(_params, _session, socket) do
    if connected?(socket) do
      :timer.send_interval(1000, self(), :update_status)
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
       import_error: nil
     ), temporary_assigns: []}
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

  def handle_event("update_crossfader", %{"value" => position}, socket) do
    position_float = String.to_float(position)

    case HTTPoison.post!("#{@api_base_url}/crossfade", Jason.encode!(%{position: position_float}), [
           {"Content-Type", "application/json"}
         ]) do
      %{status_code: 200} ->
        {:noreply, assign(socket, crossfader: position_float)}
      _ ->
        {:noreply, put_flash(socket, :error, "Failed to update crossfader")}
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

  def handle_info(:update_status, socket) do
    case HTTPoison.get!("#{@api_base_url}/videos") do
      %{status_code: 200, body: body} ->
        videos = Jason.decode!(body)["videos"]
        {:noreply, assign(socket, videos: videos)}
      _ ->
        {:noreply, socket}
    end
  end

  def render(assigns) do
    ~H"""
    <div class="min-h-screen bg-gray-900 text-white p-8">
      <h1 class="text-4xl font-bold mb-8">Video DJ Controller</h1>

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
        <input type="range"
               min="0"
               max="1"
               step="0.1"
               value={@crossfader}
               class="w-full"
               phx-change="update_crossfader" />
        <div class="flex justify-between text-sm">
          <span>Deck A</span>
          <span>Deck B</span>
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

  # Helper functions for formatting
  defp format_duration(seconds) when is_number(seconds) do
    minutes = div(seconds, 60)
    remaining_seconds = rem(seconds, 60)
    "#{minutes}:#{String.pad_leading("#{remaining_seconds}", 2, "0")}"
  end
  defp format_duration(_), do: "Unknown duration"

  defp format_number(number) when is_number(number) do
    number
    |> Integer.to_charlist()
    |> Enum.reverse()
    |> Enum.chunk_every(3)
    |> Enum.join(",")
    |> String.reverse()
  end
  defp format_number(_), do: "Unknown"
end
