defmodule DejavideoWeb.ChannelUploadLive do
  require Logger
  use DejavideoWeb, :live_view
  alias Dejavideo.YouTube
  alias Dejavideo.Media
  alias Dejavideo.Media.Playlist

  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       channel_id: "",
       loading: false,
       channel: nil,
       error: nil,
       selected_playlists: MapSet.new(),
       selected_videos: MapSet.new()
     )}
  end

  def handle_event("validate", %{"channel_id" => channel_id}, socket) do
    {:noreply, assign(socket, channel_id: channel_id)}
  end

  def handle_event("load_channel", %{"channel_id" => channel_id}, socket) do
    socket = assign(socket, loading: true, error: nil)

    case YouTube.get_channel_info(channel_id) do
      {:ok, channel_data} ->
        {:noreply,
         socket
         |> assign(
           loading: false,
           channel: channel_data
         )}

      {:error, message} ->
        {:noreply,
         socket
         |> assign(
           loading: false,
           error: message
         )}
    end
  end

  def handle_event("toggle_playlist", %{"id" => playlist_id}, socket) do
    selected = socket.assigns.selected_playlists

    updated =
      if MapSet.member?(selected, playlist_id) do
        MapSet.delete(selected, playlist_id)
      else
        MapSet.put(selected, playlist_id)
      end

    {:noreply, assign(socket, selected_playlists: updated)}
  end

  def handle_event("toggle_video", %{"id" => video_id}, socket) do
    selected = socket.assigns.selected_videos

    updated =
      if MapSet.member?(selected, video_id) do
        MapSet.delete(selected, video_id)
      else
        MapSet.put(selected, video_id)
      end

    {:noreply, assign(socket, selected_videos: updated)}
  end

  def handle_event("import_selected", _params, socket) do
    socket = assign(socket, loading: true)
    results = %{playlists: 0, playlist_videos: 0, videos: 0, failed: 0}

    # Import selected playlists
    results =
      Enum.reduce(socket.assigns.selected_playlists, results, fn playlist_id, acc ->
        # Find playlist details from channel data
        playlist_data = Enum.find(socket.assigns.channel.playlists, &(&1.youtube_id == playlist_id))

        case playlist_data do
          nil ->
            %{acc | failed: acc.failed + 1}

          playlist_data ->
            # Get all videos for this playlist
            case YouTube.get_playlist_videos(playlist_id) do
              {:ok, videos} ->
                case Media.import_youtube_playlist(playlist_data, videos) do
                  {:ok, playlist} ->
                    inserted_count = Map.get(playlist, :inserted_count, 0)
                    %{
                      acc |
                      playlists: acc.playlists + 1,
                      playlist_videos: acc.playlist_videos + inserted_count
                    }

                  {:error, _} ->
                    %{acc | failed: acc.failed + 1}
                end

              {:error, _} ->
                %{acc | failed: acc.failed + 1}
            end
        end
      end)

    # Import selected videos
    results =
      Enum.reduce(socket.assigns.selected_videos, results, fn video_id, acc ->
        video = Enum.find(socket.assigns.channel.recent_videos, &(&1.youtube_id == video_id))

        case Media.add_video_to_collection(video) do
          {:ok, _} -> %{acc | videos: acc.videos + 1}
          {:error, _} -> %{acc | failed: acc.failed + 1}
        end
      end)

    cond do
      results.playlists == 0 and results.videos == 0 and MapSet.size(socket.assigns.selected_playlists) == 0 and MapSet.size(socket.assigns.selected_videos) == 0 ->
        {:noreply,
         socket
         |> put_flash(:error, "No items selected for import")
         |> assign(loading: false)}

      results.failed > 0 ->
        message =
          "Imported #{results.playlists} playlists (#{results.playlist_videos} videos) " <>
          "and #{results.videos} individual videos. #{results.failed} items failed."

        {:noreply,
         socket
         |> put_flash(:info, message)
         |> push_navigate(to: ~p"/collection")}

      true ->
        message =
          "Successfully imported #{results.playlists} playlists (#{results.playlist_videos} videos) " <>
          "and #{results.videos} individual videos."

        {:noreply,
         socket
         |> put_flash(:info, message)
         |> push_navigate(to: ~p"/collection")}
    end
  end

  defp import_videos(videos) do
    Enum.map(videos, fn video ->
      Media.add_video_to_collection(video)
    end)
  end

  def render(assigns) do
    ~H"""
    <div class="container mx-auto p-4">
      <h1 class="text-2xl font-bold mb-6">Import from YouTube Channel</h1>

      <form phx-submit="load_channel" class="mb-8">
        <div class="flex gap-4">
          <input
            type="text"
            name="channel_id"
            value={@channel_id}
            placeholder="Enter YouTube Channel ID"
            class="flex-1 border rounded p-2"
            phx-change="validate"
          />
          <button
            type="submit"
            class="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
            disabled={@loading}
          >
            <%= if @loading do %>
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            <% else %>
              Load Channel
            <% end %>
          </button>
        </div>
      </form>

      <%= if @error do %>
        <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">
          <p><%= @error %></p>
        </div>
      <% end %>

      <%= if @channel do %>
        <div class="space-y-8">
          <div class="bg-gray-50 p-4 rounded">
            <h2 class="text-xl font-semibold"><%= @channel.channel.title %></h2>
            <p class="text-gray-600 mt-2"><%= @channel.channel.description %></p>
            <div class="mt-4 flex gap-4 text-sm text-gray-600">
              <div>
                <span class="font-semibold"><%= format_number(@channel.channel.subscriber_count) %></span> subscribers
              </div>
              <div>
                <span class="font-semibold"><%= format_number(@channel.channel.video_count) %></span> videos
              </div>
            </div>
          </div>

          <%= if length(@channel.playlists) > 0 do %>
            <div>
              <h3 class="text-lg font-semibold mb-4">Playlists</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <%= for playlist <- @channel.playlists do %>
                  <div
                    class={"p-4 border rounded cursor-pointer #{if MapSet.member?(@selected_playlists, playlist.youtube_id), do: "border-blue-500 bg-blue-50"}"}
                    phx-click="toggle_playlist"
                    phx-value-id={playlist.youtube_id}
                  >
                    <h4 class="font-medium"><%= playlist.title %></h4>
                    <p class="text-sm text-gray-600"><%= playlist.video_count %> videos</p>
                  </div>
                <% end %>
              </div>
            </div>
          <% end %>

          <%= if length(@channel.recent_videos) > 0 do %>
            <div>
              <h3 class="text-lg font-semibold mb-4">Recent Videos</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <%= for video <- @channel.recent_videos do %>
                  <div
                    class={"border rounded overflow-hidden cursor-pointer #{if MapSet.member?(@selected_videos, video.youtube_id), do: "border-blue-500 bg-blue-50"}"}
                    phx-click="toggle_video"
                    phx-value-id={video.youtube_id}
                  >
                    <img src={video.thumbnail_url} alt={video.title} class="w-full aspect-video object-cover" />
                    <div class="p-4">
                      <h4 class="font-medium line-clamp-2"><%= video.title %></h4>
                      <p class="text-sm text-gray-600 mt-2">
                        Published <%= format_date(video.published_at) %>
                      </p>
                    </div>
                  </div>
                <% end %>
              </div>
            </div>
          <% end %>

          <%= if MapSet.size(@selected_playlists) > 0 or MapSet.size(@selected_videos) > 0 do %>
            <div class="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex justify-between items-center">
              <div class="text-sm text-gray-600">
                Selected: <%= MapSet.size(@selected_playlists) %> playlists,
                <%= MapSet.size(@selected_videos) %> videos
              </div>
              <button
                phx-click="import_selected"
                class="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600"
                disabled={@loading}
              >
                Import Selected Items
              </button>
            </div>
          <% end %>
        </div>
      <% end %>
    </div>
    """
  end

  # Helper functions from VideoBrowserLive
  defp format_number(nil), do: "0"
  defp format_number(number) when is_binary(number), do: format_number(String.to_integer(number))
  defp format_number(number) when number >= 1_000_000, do: "#{Float.round(number / 1_000_000, 1)}M"
  defp format_number(number) when number >= 1_000, do: "#{Float.round(number / 1_000, 1)}K"
  defp format_number(number), do: Number.Delimit.number_to_delimited(number, precision: 0)

  defp format_date(nil), do: "Unknown date"
  defp format_date(date_string) do
    case DateTime.from_iso8601(date_string) do
      {:ok, datetime, _} ->
        case DateTime.diff(DateTime.utc_now(), datetime, :day) do
          days when days < 1 ->
            hours = DateTime.diff(DateTime.utc_now(), datetime, :hour)
            if hours < 1, do: "Just now", else: "#{hours}h ago"
          days when days < 7 ->
            "#{days}d ago"
          days when days < 30 ->
            "#{div(days, 7)}w ago"
          days when days < 365 ->
            "#{div(days, 30)}mo ago"
          days ->
            "#{div(days, 365)}y ago"
        end
      _ -> "Unknown date"
    end
  end
end
