defmodule DejavideoWeb.VideoDetailLive do
  use DejavideoWeb, :live_view
  alias Dejavideo.Media

  def mount(%{"id" => id}, _session, socket) do
    video = Media.get_video!(id)
    details = Media.get_video_details(video.youtube_id)
    playlists = Media.list_playlists()

    {:ok, assign(socket,
      video: video,
      details: details,
      playlists: playlists,
      show_playlist_menu: false,
      video_playlists: Media.get_video_playlists(video)
    )}
  end

  def handle_event("toggle-playlist-menu", _, socket) do
    {:noreply, assign(socket, show_playlist_menu: !socket.assigns.show_playlist_menu)}
  end

  def handle_event("add-to-playlist", %{"playlist_id" => playlist_id}, socket) do
    playlist = Enum.find(socket.assigns.playlists, &(&1.id == String.to_integer(playlist_id)))
    video = socket.assigns.video

    case Media.add_video_to_playlist(video, playlist) do
      {:ok, _} ->
        {:noreply,
         socket
         |> put_flash(:info, "Added to playlist")
         |> assign(video_playlists: Media.get_video_playlists(video))
         |> assign(show_playlist_menu: false)}

      {:error, _} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to add to playlist")
         |> assign(show_playlist_menu: false)}
    end
  end

  def handle_event("remove-from-playlist", %{"playlist_id" => playlist_id}, socket) do
    playlist = Enum.find(socket.assigns.playlists, &(&1.id == String.to_integer(playlist_id)))
    video = socket.assigns.video

    case Media.remove_video_from_playlist(video, playlist) do
      {:ok, _} ->
        {:noreply,
         socket
         |> put_flash(:info, "Removed from playlist")
         |> assign(video_playlists: Media.get_video_playlists(video))}

      {:error, _} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to remove from playlist")}
    end
  end

  def render(assigns) do
    ~H"""
    <div class="container mx-auto p-4">
      <div class="mb-4">
        <.link navigate={~p"/collection"} class="text-blue-500 hover:underline">
          ← Back to Collection
        </.link>
      </div>

      <div class="bg-white rounded-lg shadow-lg">
        <div class="aspect-w-16 aspect-h-9">
          <iframe
            src={"https://www.youtube.com/embed/#{@video.youtube_id}"}
            class="w-full h-full"
            allowfullscreen
          >
          </iframe>
        </div>

        <div class="p-6">
          <div class="flex justify-between items-start mb-4">
            <h1 class="text-3xl font-bold"><%= @video.title %></h1>

            <div class="relative">
              <button
                phx-click="toggle-playlist-menu"
                class="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 4a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1v-2zm1 5a1 1 0 00-1 1v2a1 1 0 001 1h14a1 1 0 001-1v-2a1 1 0 00-1-1H3z" />
                </svg>
                Add to Playlist
              </button>

              <%= if @show_playlist_menu do %>
                <div class="absolute right-0 mt-2 w-64 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                  <div class="py-1" role="menu">
                    <%= for playlist <- @playlists do %>
                      <div class="px-4 py-2 flex items-center justify-between">
                        <span><%= playlist.name %></span>
                        <%= if Enum.any?(@video_playlists, & &1.id == playlist.id) do %>
                          <button
                            phx-click="remove-from-playlist"
                            phx-value-playlist_id={playlist.id}
                            class="text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        <% else %>
                          <button
                            phx-click="add-to-playlist"
                            phx-value-playlist_id={playlist.id}
                            class="text-blue-500 hover:text-blue-700"
                          >
                            Add
                          </button>
                        <% end %>
                      </div>
                    <% end %>
                  </div>
                </div>
              <% end %>
            </div>
          </div>

          <%= if @video_playlists != [] do %>
            <div class="mb-6">
              <h3 class="text-sm font-semibold text-gray-500 mb-2">Added to Playlists:</h3>
              <div class="flex flex-wrap gap-2">
                <%= for playlist <- @video_playlists do %>
                  <.link
                    navigate={~p"/playlists/#{playlist.id}"}
                    class="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 hover:bg-gray-200"
                  >
                    <%= playlist.name %>
                  </.link>
                <% end %>
              </div>
            </div>
          <% end %>

          <%= if @details do %>
            <div class="grid grid-cols-2 gap-4 mb-4 text-sm text-gray-600">
              <div>
                <span class="font-semibold">Views:</span>
                <%= Number.Delimit.number_to_delimited(@details.view_count) %>
              </div>
              <div>
                <span class="font-semibold">Likes:</span>
                <%= Number.Delimit.number_to_delimited(@details.like_count) %>
              </div>
            </div>

            <div class="prose max-w-none">
              <h3 class="text-lg font-semibold mb-2">Description</h3>
              <p class="whitespace-pre-wrap"><%= @details.description %></p>
            </div>
          <% end %>
        </div>
      </div>
    </div>
    """
  end
end
