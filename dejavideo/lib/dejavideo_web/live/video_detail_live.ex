# lib/dejavideo_web/live/video_detail_live.ex
defmodule DejavideoWeb.VideoDetailLive do
  use DejavideoWeb, :live_view
  alias Dejavideo.Media

  def mount(%{"id" => id}, _session, socket) do
    video = Media.get_video!(id)

    # Optionally fetch fresh details from YouTube
    details = Media.get_video_details(video.youtube_id)

    {:ok, assign(socket, video: video, details: details)}
  end

  def render(assigns) do
    ~H"""
    <div class="container mx-auto p-4">
      <div class="mb-4">
        <.link navigate={~p"/collection"} class="text-blue-500 hover:underline">
          ← Back to Collection
        </.link>
      </div>

      <div class="bg-white rounded-lg shadow-lg overflow-hidden">
        <div class="aspect-w-16 aspect-h-9">
          <iframe
            src={"https://www.youtube.com/embed/#{@video.youtube_id}"}
            class="w-full h-full"
            allowfullscreen
          >
          </iframe>
        </div>

        <div class="p-6">
          <h1 class="text-3xl font-bold mb-4"><%= @video.title %></h1>

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
