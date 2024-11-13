defmodule DejavideoWeb.VideoBrowserLive do
  use DejavideoWeb, :live_view
  alias Dejavideo.YouTube
  alias Dejavideo.Media

  def mount(_params, _session, socket) do
    {:ok, assign(socket,
      videos: [],
      search_query: "",
      loading: false
    )}
  end

  # Add these handle_event functions
  def handle_event("search", %{"query" => query}, socket) do
    # Set loading state
    socket = assign(socket, loading: true)

    # Perform YouTube search
    case YouTube.search(query) do
      {:ok, videos} ->
        {:noreply,
         socket
         |> assign(search_query: query)
         |> assign(videos: videos)
         |> assign(loading: false)}

      {:error, error} ->
        {:noreply,
         socket
         |> put_flash(:error, "Search failed: #{error}")
         |> assign(loading: false)}
    end
  end

  def handle_event("add-to-collection", %{"video" => video_id}, socket) do
    video = Enum.find(socket.assigns.videos, &(&1.id == video_id))

    case Media.add_video_to_collection(video) do
      {:ok, _video} ->
        {:noreply,
         socket
         |> put_flash(:info, "Video added to collection")
         |> push_navigate(to: ~p"/collection")}

      {:error, _changeset} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to add video")}
    end
  end

  def render(assigns) do
    ~H"""
    <div class="container mx-auto p-4">
      <h1 class="text-2xl font-bold mb-4">Video Browser</h1>

      <form phx-submit="search" class="mb-4">
        <input type="text" name="query" value={@search_query}
               class="border p-2 rounded"
               placeholder="Search YouTube videos..."
        />
        <button type="submit" class="bg-blue-500 text-white px-4 py-2 rounded">
          Search
        </button>
      </form>

      <%= if @loading do %>
        <div class="text-center">Loading...</div>
      <% end %>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <%= for video <- @videos do %>
          <div class="border p-4 rounded shadow">
            <img src={video.thumbnail_url} alt={video.title} class="w-full"/>
            <h3 class="font-bold mt-2"><%= video.title %></h3>
            <button phx-click="add-to-collection" phx-value-video={video.id}
                    class="bg-green-500 text-white px-2 py-1 rounded mt-2">
              Add to Collection
            </button>
          </div>
        <% end %>
      </div>
    </div>
    """
  end
end
