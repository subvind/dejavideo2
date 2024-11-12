# lib/dejavideo_web/live/collection_live.ex
defmodule DejavideoWeb.CollectionLive do
  use DejavideoWeb, :live_view
  alias Dejavideo.Media

  def mount(_params, _session, socket) do
    videos = Media.list_videos()
    {:ok, assign(socket, videos: videos)}
  end

  def handle_event("delete", %{"id" => id}, socket) do
    video = Media.get_video!(id)
    {:ok, _} = Media.delete_video(video)

    {:noreply,
     socket
     |> put_flash(:info, "Video removed from collection")
     |> assign(:videos, Media.list_videos())}
  end

  def render(assigns) do
    ~H"""
    <div class="container mx-auto p-4">
      <h1 class="text-2xl font-bold mb-4">My Collection</h1>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <%= for video <- @videos do %>
          <div class="border p-4 rounded shadow">
            <.link navigate={~p"/videos/#{video.id}"}>
              <img src={video.thumbnail_url} alt={video.title} class="w-full"/>
              <h3 class="font-bold mt-2"><%= video.title %></h3>
            </.link>
            <div class="flex justify-between mt-2">
              <.link navigate={~p"/videos/#{video.id}"} class="text-blue-500 hover:underline">
                View Details
              </.link>
              <button phx-click="delete" phx-value-id={video.id}
                      class="text-red-500 hover:text-red-700"
                      data-confirm="Are you sure?">
                Remove
              </button>
            </div>
          </div>
        <% end %>
      </div>
    </div>
    """
  end
end
