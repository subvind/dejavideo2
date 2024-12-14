defmodule DejavideoWeb.CollectionLive do
  use DejavideoWeb, :live_view
  alias Dejavideo.Media

  # Number of items per page
  @per_page 30
  # Maximum number of page links to show
  @max_page_links 5

  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(
       videos: [],
       page: 1,
       per_page: @per_page,
       sort_by: :inserted_at,
       sort_order: :desc,
       filter: "",
       total_videos: 0
     )
     |> load_videos()}
  end

  def handle_params(params, _url, socket) do
    page = String.to_integer(params["page"] || "1")
    sort_by = (params["sort_by"] || "inserted_at") |> String.to_atom()
    sort_order = (params["sort_order"] || "desc") |> String.to_atom()
    filter = params["filter"] || ""

    {:noreply,
     socket
     |> assign(
       page: page,
       sort_by: sort_by,
       sort_order: sort_order,
       filter: filter
     )
     |> load_videos()}
  end

  def handle_event("delete", %{"id" => id}, socket) do
    video = Media.get_video!(id)
    {:ok, _} = Media.delete_video(video)

    {:noreply,
     socket
     |> put_flash(:info, "Video removed from collection")
     |> load_videos()}
  end

  def handle_event("filter", %{"filter" => filter}, socket) do
    {:noreply,
     push_patch(socket,
       to:
         ~p"/collection?#{%{
           page: 1,
           sort_by: socket.assigns.sort_by,
           sort_order: socket.assigns.sort_order,
           filter: filter
         }}"
     )}
  end

  def handle_event("sort", %{"sort_by" => sort_by}, socket) do
    sort_order =
      if socket.assigns.sort_by == String.to_atom(sort_by) do
        toggle_sort_order(socket.assigns.sort_order)
      else
        :asc
      end

    {:noreply,
     push_patch(socket,
       to:
         ~p"/collection?#{%{
           page: socket.assigns.page,
           sort_by: sort_by,
           sort_order: sort_order,
           filter: socket.assigns.filter
         }}"
     )}
  end

  defp toggle_sort_order(:asc), do: :desc
  defp toggle_sort_order(:desc), do: :asc

  defp load_videos(socket) do
    %{
      page: page,
      per_page: per_page,
      sort_by: sort_by,
      sort_order: sort_order,
      filter: filter
    } = socket.assigns

    {videos, total} = Media.list_videos_paginated(page, per_page, sort_by, sort_order, filter)

    assign(socket,
      videos: videos,
      total_videos: total,
      total_pages: ceil(total / per_page)
    )
  end

  def render(assigns) do
    ~H"""
    <div class="container mx-auto p-4">
      <h1 class="text-2xl font-bold mb-4">Collection</h1>

      <div class="mb-4">
        <form phx-change="filter" class="flex gap-4">
          <input type="text" name="filter" value={@filter}
                 placeholder="Search videos..."
                 class="px-4 py-2 border rounded-lg flex-grow"
          />
        </form>
      </div>

      <div class="mb-4 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div class="flex gap-4">
          <button phx-click="sort" phx-value-sort_by="title"
                  class={"px-4 py-2 border rounded-lg #{if @sort_by == :title, do: "bg-blue-100"}"}>
            Title
            <%= sort_indicator(@sort_by, :title, @sort_order) %>
          </button>
          <button phx-click="sort" phx-value-sort_by="inserted_at"
                  class={"px-4 py-2 border rounded-lg #{if @sort_by == :inserted_at, do: "bg-blue-100"}"}>
            Date Added
            <%= sort_indicator(@sort_by, :inserted_at, @sort_order) %>
          </button>
        </div>
        <div class="text-sm text-gray-600">
          Showing <%= (@page - 1) * @per_page + 1 %> to <%= min(@page * @per_page, @total_videos) %> of <%= @total_videos %> videos
        </div>
      </div>

      <.pagination_controls {assigns} />

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 my-4">
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

      <.pagination_controls {assigns} />
    </div>
    """
  end

  def pagination_controls(assigns) do
    ~H"""
    <div class="flex justify-center gap-2">
      <div class="flex items-center gap-2">
        <!-- First page -->
        <.link patch={~p"/collection?#{pagination_params(%{page: 1}, assigns)}"}
              class={"px-4 py-2 border rounded-lg #{if @page == 1, do: "bg-gray-100 cursor-not-allowed", else: "hover:bg-gray-100"}"}>
          First
        </.link>

        <!-- Previous page -->
        <.link patch={~p"/collection?#{pagination_params(%{page: max(@page - 1, 1)}, assigns)}"}
              class={"px-4 py-2 border rounded-lg #{if @page == 1, do: "bg-gray-100 cursor-not-allowed", else: "hover:bg-gray-100"}"}>
          ←
        </.link>

        <!-- Page numbers -->
        <%= for page_num <- page_links(@page, @total_pages) do %>
          <%= if page_num == :gap do %>
            <span class="px-4 py-2">...</span>
          <% else %>
            <.link patch={~p"/collection?#{pagination_params(%{page: page_num}, assigns)}"}
                   class={"px-4 py-2 border rounded-lg #{if @page == page_num, do: "bg-blue-500 text-white", else: "hover:bg-gray-100"}"}>
              <%= page_num %>
            </.link>
          <% end %>
        <% end %>

        <!-- Next page -->
        <.link patch={~p"/collection?#{pagination_params(%{page: min(@page + 1, @total_pages)}, assigns)}"}
              class={"px-4 py-2 border rounded-lg #{if @page == @total_pages, do: "bg-gray-100 cursor-not-allowed", else: "hover:bg-gray-100"}"}>
          →
        </.link>

        <!-- Last page -->
        <.link patch={~p"/collection?#{pagination_params(%{page: @total_pages}, assigns)}"}
              class={"px-4 py-2 border rounded-lg #{if @page == @total_pages, do: "bg-gray-100 cursor-not-allowed", else: "hover:bg-gray-100"}"}>
          Last
        </.link>
      </div>
    </div>
    """
  end

  # Helper to generate page links with gaps
  defp page_links(current_page, total_pages) do
    cond do
      total_pages <= @max_page_links ->
        # Show all pages if total is less than or equal to max links
        1..total_pages

      current_page <= 3 ->
        # Near the start
        Enum.concat(1..4, [:gap, total_pages])

      current_page >= total_pages - 2 ->
        # Near the end
        Enum.concat([1, :gap], (total_pages - 3)..total_pages)

      true ->
        # Middle - show current ±1, plus gaps
        Enum.concat([1, :gap], Enum.concat((current_page - 1)..(current_page + 1), [:gap, total_pages]))
    end
  end

  # Helper to maintain query params during pagination
  defp pagination_params(params, assigns) do
    Map.merge(
      %{
        sort_by: assigns.sort_by,
        sort_order: assigns.sort_order,
        filter: assigns.filter
      },
      params
    )
  end

  defp sort_indicator(current_sort, column, order) when current_sort == column do
    case order do
      :asc -> "↑"
      :desc -> "↓"
    end
  end

  defp sort_indicator(_, _, _), do: ""
end
