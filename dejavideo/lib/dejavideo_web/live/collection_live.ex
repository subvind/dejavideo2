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
                View Video →
              </.link>
              <button phx-click="delete" phx-value-id={video.id}
                      class="text-red-500 hover:text-red-700"
                      data-confirm="Are you sure?">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        <% end %>
      </div>
    </div>
    """
  end
end
