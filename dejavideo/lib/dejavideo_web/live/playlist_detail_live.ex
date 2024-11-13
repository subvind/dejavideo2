defmodule DejavideoWeb.PlaylistDetailLive do
  use DejavideoWeb, :live_view
  alias Dejavideo.Media

  def mount(%{"id" => id}, _session, socket) do
    playlist = Media.get_playlist!(id)
    {:ok, assign(socket, playlist: playlist)}
  end

  def handle_event("remove-video", %{"video_id" => video_id}, socket) do
    playlist = socket.assigns.playlist
    video = Media.get_video!(video_id)

    case Media.remove_video_from_playlist(playlist, video) do
      {:ok, updated_playlist} ->
        {:noreply,
         socket
         |> put_flash(:info, "Video removed from playlist")
         |> assign(playlist: updated_playlist)}

      {:error, _changeset} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to remove video")}
    end
  end

  def handle_event("reorder-videos", %{"video_ids" => video_ids}, socket) do
    playlist = socket.assigns.playlist

    case Media.reorder_playlist_videos(playlist, video_ids) do
      {:ok, updated_playlist} ->
        {:noreply, assign(socket, playlist: updated_playlist)}

      {:error, _changeset} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to reorder videos")}
    end
  end

  def render(assigns) do
    ~H"""
    <div class="container mx-auto p-4">
      <div class="mb-4">
        <.link navigate={~p"/playlists"} class="text-blue-500 hover:underline">
          ← Back to Playlists
        </.link>
      </div>

      <div class="bg-white rounded-lg shadow-lg p-6 mb-8">
        <div class="flex justify-between items-start mb-6">
          <div>
            <h1 class="text-3xl font-bold mb-2"><%= @playlist.name %></h1>
            <p class="text-gray-600"><%= @playlist.description %></p>
          </div>
          <div class="text-sm text-gray-500">
            <%= length(@playlist.videos) %> videos
          </div>
        </div>

        <div class="space-y-4" id="playlist-videos" phx-hook="Sortable">
          <%= for {video, index} <- Enum.with_index(@playlist.videos) do %>
            <div class="flex items-center gap-4 p-4 bg-gray-50 rounded" data-video-id={video.id}>
              <div class="flex-none text-gray-400 cursor-move">
                <%= index + 1 %>
              </div>
              <div class="flex-none w-40">
                <img src={video.thumbnail_url} alt={video.title} class="w-full rounded"/>
              </div>
              <div class="flex-grow">
                <h3 class="font-medium">
                  <.link navigate={~p"/videos/#{video.id}"}>
                    <%= video.title %>
                  </.link>
                </h3>
              </div>
              <button
                phx-click="remove-video"
                phx-value-video_id={video.id}
                class="text-red-500 hover:text-red-700"
                data-confirm="Remove this video from the playlist?"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
              </button>
            </div>
          <% end %>
        </div>
      </div>
    </div>
    """
  end
end
