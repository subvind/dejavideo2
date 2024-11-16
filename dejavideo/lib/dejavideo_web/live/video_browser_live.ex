defmodule DejavideoWeb.VideoBrowserLive do
  require Logger
  use DejavideoWeb, :live_view
  alias Dejavideo.YouTube
  alias Dejavideo.Media

  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       videos: [],
       search_query: "",
       loading: false,
       page_token: nil,
       sort_by: "relevance",
       upload_date: "any",
       duration: "any",
       type: "any",
       page_size: 12
     )}
  end

  # Add these handle_event functions
  def handle_event("search", %{"query" => query}, socket) do
    # Set loading state and preserve all filter values
    socket = assign(socket, loading: true)

    # Build complete search params with current filter values
    search_params = %{
      query: query,
      sort_by: socket.assigns.sort_by,
      upload_date: socket.assigns.upload_date,
      duration: socket.assigns.duration,
      type: socket.assigns.type,
      page_size: socket.assigns.page_size
    }

    case YouTube.search(search_params) do
      {:ok, %{videos: videos, next_page_token: next_page_token}} ->
        {:noreply,
         socket
         |> assign(
           search_query: query,
           videos: videos,
           loading: false,
           page_token: next_page_token,
           # Explicitly maintain filter values
           sort_by: socket.assigns.sort_by,
           upload_date: socket.assigns.upload_date,
           duration: socket.assigns.duration,
           type: socket.assigns.type
         )}

      {:error, error} ->
        {:noreply,
         socket
         |> put_flash(:error, "Search failed: #{error}")
         |> assign(loading: false)}
    end
  end

  def handle_event("load-more", _params, socket) do
    search_params = %{
      query: socket.assigns.search_query,
      sort_by: socket.assigns.sort_by,
      upload_date: socket.assigns.upload_date,
      duration: socket.assigns.duration,
      type: socket.assigns.type,
      page_size: socket.assigns.page_size,
      page_token: socket.assigns.page_token
    }

    case YouTube.search(search_params) do
      {:ok, %{videos: new_videos, next_page_token: next_page_token}} ->
        {:noreply,
         socket
         |> assign(
           videos: socket.assigns.videos ++ new_videos,
           page_token: next_page_token
         )}

      {:error, error} ->
        {:noreply, put_flash(socket, :error, "Failed to load more videos: #{error}")}
    end
  end

  def handle_event("update-filter", params, socket) do
    # Create a map of the current filters
    current_filters = %{
      "sort_by" => socket.assigns.sort_by,
      "upload_date" => socket.assigns.upload_date,
      "duration" => socket.assigns.duration,
      "type" => socket.assigns.type
    }

    # Debug log to see what params are being received
    Logger.debug("Update filter params: #{inspect(params)}")
    Logger.debug("Current filters: #{inspect(current_filters)}")

    # Merge the new params with current filters
    updated_filters = Map.merge(current_filters, params)

    Logger.debug("Updated filters: #{inspect(updated_filters)}")

    socket =
      socket
      |> assign(
        sort_by: updated_filters["sort_by"],
        upload_date: updated_filters["upload_date"],
        duration: updated_filters["duration"],
        type: updated_filters["type"]
      )

    search_params = %{"query" => socket.assigns.search_query} |> Map.merge(updated_filters)
    handle_event("search", search_params, socket)
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
        {:noreply, put_flash(socket, :error, "Failed to add video")}
    end
  end

  def render(assigns) do
    ~H"""
    <div class="container mx-auto p-4">
      <h1 class="text-2xl font-bold mb-4">Video Browser</h1>

      <form phx-submit="search" class="mb-4">
        <div class="flex gap-4 mb-4">
          <input
            type="text"
            name="query"
            value={@search_query}
            class="flex-grow border p-2 rounded"
            placeholder="Search YouTube videos..."
          />
          <%# Add hidden inputs to preserve filter values on form submit %>
          <input type="hidden" name="sort_by" value={@sort_by} />
          <input type="hidden" name="upload_date" value={@upload_date} />
          <input type="hidden" name="duration" value={@duration} />
          <input type="hidden" name="type" value={@type} />
          <button type="submit" class="bg-blue-500 text-white px-4 py-2 rounded">
            Search
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label class="block text-sm font-medium mb-1">Sort By</label>
            <select
              class="w-full border rounded p-2"
              phx-change="update-filter"
              name="sort_by"
              value={@sort_by}
            >
              <option value="relevance">Relevance</option>
              <option value="upload_date">Upload Date</option>
              <option value="viewCount">View Count</option>
              <option value="rating">Rating</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Upload Date</label>
            <select
              class="w-full border rounded p-2"
              phx-change="update-filter"
              name="upload_date"
              value={@upload_date}
            >
              <option value="any">Any Time</option>
              <option value="hour">Last Hour</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Duration</label>
            <select
              class="w-full border rounded p-2"
              phx-change="update-filter"
              name="duration"
              value={@duration}
            >
              <option value="any">Any Duration</option>
              <option value="short">Under 4 minutes</option>
              <option value="medium">4-20 minutes</option>
              <option value="long">Over 20 minutes</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Type</label>
            <select
              class="w-full border rounded p-2"
              phx-change="update-filter"
              name="type"
              value={@type}
            >
              <option value="any">Any Type</option>
              <option value="video">Video</option>
              <option value="channel">Channel</option>
              <option value="playlist">Playlist</option>
            </select>
          </div>
        </div>
      </form>

      <%= if @loading do %>
        <div class="text-center py-8">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p class="mt-4">Loading...</p>
        </div>
      <% end %>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <%= for video <- @videos do %>
          <div class="border rounded-lg shadow-lg overflow-hidden bg-white">
            <div class="relative">
              <img src={video.thumbnail_url} alt={video.title} class="w-full aspect-video object-cover" />
              <div class="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white px-2 py-1 rounded text-sm">
                <%= video.duration %>
              </div>
            </div>

            <div class="p-4">
              <h3 class="font-bold text-lg mb-2 line-clamp-2" title={video.title}><%= video.title %></h3>

              <div class="space-y-2 text-sm text-gray-600">
                <div class="flex items-center gap-2">
                  <.icon name="hero-calendar" class="w-4 h-4" />
                  <%= format_date(video.published_at) %>
                </div>

                <div class="flex items-center gap-2">
                  <.icon name="hero-eye" class="w-4 h-4" />
                  <%= format_number(video.view_count) %> views
                </div>

                <div class="flex items-center gap-2">
                  <.icon name="hero-hand-thumb-up" class="w-4 h-4" />
                  <%= format_number(video.like_count) %> likes
                </div>

                <div class="flex items-center gap-2">
                  <.icon name="hero-user" class="w-4 h-4" />
                  <span class="truncate" title={video.channel_title}><%= video.channel_title %></span>
                </div>
              </div>

              <div class="mt-4 flex justify-between items-center">
                <button
                  phx-click="add-to-collection"
                  phx-value-video={video.id}
                  class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Add to Collection
                </button>

                <a
                  href={"https://youtube.com/watch?v=#{video.youtube_id}"}
                  target="_blank"
                  class="text-blue-500 hover:text-blue-600"
                >
                  Watch on YouTube
                </a>
              </div>
            </div>
          </div>
        <% end %>
      </div>

      <%= if @page_token && length(@videos) > 0 do %>
        <div class="text-center mt-8">
          <button
            phx-click="load-more"
            class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Load More
          </button>
        </div>
      <% end %>
    </div>
    """
  end

  # Add these helper functions for formatting
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
