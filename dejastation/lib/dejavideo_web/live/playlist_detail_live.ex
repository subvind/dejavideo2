defmodule DejavideoWeb.PlaylistDetailLive do
  use DejavideoWeb, :live_view
  alias Dejavideo.Media

  def mount(%{"id" => id}, _session, socket) do
    playlist = Media.get_playlist!(id)

    socket = socket
      |> assign(:playlist, playlist)
      |> assign(:current_video_index, 0)
      |> assign(:current_video, List.first(playlist.videos))
      |> assign(:is_playing, false)

    {:ok, socket}
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

  # Handle selecting a video from the list
  def handle_event("select-video", %{"index" => index}, socket) do
    index = String.to_integer(index)
    video = Enum.at(socket.assigns.playlist.videos, index)

    {:noreply,
     socket
     |> assign(:current_video_index, index)
     |> assign(:current_video, video)
     |> push_event("load-video", %{youtube_id: video.youtube_id})}
  end

  def handle_event("next-video", _, socket) do
    next_index = socket.assigns.current_video_index + 1

    if next_index < length(socket.assigns.playlist.videos) do
      next_video = Enum.at(socket.assigns.playlist.videos, next_index)
      {:noreply,
       socket
       |> assign(:current_video_index, next_index)
       |> assign(:current_video, next_video)
       |> push_event("load-video", %{youtube_id: next_video.youtube_id})}
    else
      {:noreply, socket}
    end
  end

  def handle_event("prev-video", _, socket) do
    prev_index = socket.assigns.current_video_index - 1

    if prev_index >= 0 do
      prev_video = Enum.at(socket.assigns.playlist.videos, prev_index)
      {:noreply,
       socket
       |> assign(:current_video_index, prev_index)
       |> assign(:current_video, prev_video)
       |> push_event("load-video", %{youtube_id: prev_video.youtube_id})}
    else
      {:noreply, socket}
    end
  end

  def handle_event("video-ended", _, socket) do
    handle_event("next-video", nil, socket)
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

        <%!-- Video Player Section --%>
        <%= if @current_video do %>
          <div class="mb-8">
            <div class="relative pb-[56.25%] h-0 overflow-hidden bg-black rounded-lg mb-4">
              <div
                id="youtube-player"
                phx-hook="YouTubePlayer"
                data-youtube-id={@current_video.youtube_id}
                class="absolute top-0 left-0 w-full h-full"
              >
              </div>
            </div>

            <div class="flex items-center justify-between bg-gray-100 p-4 rounded-lg">
              <div>
                <h3 class="font-medium text-lg"><%= @current_video.title %></h3>
                <p class="text-sm text-gray-600">
                  Playing <%= @current_video_index + 1 %> of <%= length(@playlist.videos) %>
                </p>
                <.link navigate={~p"/videos/#{@current_video.id}"} class="text-blue-500 hover:underline text-sm">
                  View Full Video Details →
                </.link>
              </div>

              <div class="flex items-center gap-4">
                <button
                  phx-click="prev-video"
                  disabled={@current_video_index == 0}
                  class="p-2 rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <button
                  phx-click="next-video"
                  disabled={@current_video_index == length(@playlist.videos) - 1}
                  class="p-2 rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        <% end %>

        <%!-- Playlist Section --%>
        <div class="space-y-4" id="playlist-videos" phx-hook="Sortable">
          <%= for {video, index} <- Enum.with_index(@playlist.videos) do %>
            <div class={[
              "flex items-center gap-4 p-4 rounded hover:bg-gray-100 transition-colors",
              if(@current_video_index == index, do: "bg-blue-50", else: "bg-gray-50")
            ]} data-video-id={video.id}>
              <div class="flex-none text-gray-400 cursor-move">
                <%= index + 1 %>
              </div>

              <%!-- Make the thumbnail and title clickable to play the video --%>
              <div class="flex flex-grow items-center gap-4 cursor-pointer" phx-click="select-video" phx-value-index={index}>
                <div class="flex-none w-40">
                  <img src={video.thumbnail_url} alt={video.title} class="w-full rounded"/>
                </div>
                <div class="flex-grow">
                  <h3 class="font-medium mb-1">
                    <%= video.title %>
                  </h3>
                  <.link navigate={~p"/videos/#{video.id}"} class="text-blue-500 hover:underline text-sm">
                    View Video →
                  </.link>
                </div>
              </div>

              <button
                phx-click="remove-video"
                phx-value-video_id={video.id}
                class="text-red-500 hover:text-red-700 flex-none"
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
