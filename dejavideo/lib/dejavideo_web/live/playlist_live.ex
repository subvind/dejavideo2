defmodule DejavideoWeb.PlaylistLive do
  use DejavideoWeb, :live_view
  alias Dejavideo.Media

  def mount(_params, _session, socket) do
    playlists = Media.list_playlists()
    {:ok, assign(socket, playlists: playlists, show_new_form: false)}
  end

  def handle_event("show-new-form", _, socket) do
    {:noreply, assign(socket, show_new_form: true)}
  end

  def handle_event("hide-new-form", _, socket) do
    {:noreply, assign(socket, show_new_form: false)}
  end

  def handle_event("create-playlist", %{"playlist" => playlist_params}, socket) do
    case Media.create_playlist(playlist_params) do
      {:ok, _playlist} ->
        {:noreply,
         socket
         |> put_flash(:info, "Playlist created successfully")
         |> assign(show_new_form: false)
         |> assign(playlists: Media.list_playlists())}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply,
         socket
         |> put_flash(:error, "Error creating playlist")
         |> assign(changeset: changeset)}
    end
  end

  def handle_event("delete-playlist", %{"id" => id}, socket) do
    playlist = Media.get_playlist!(id)
    {:ok, _} = Media.delete_playlist(playlist)

    {:noreply,
     socket
     |> put_flash(:info, "Playlist deleted")
     |> assign(playlists: Media.list_playlists())}
  end

  def render(assigns) do
    ~H"""
    <div class="container mx-auto p-4">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold">Playlists</h1>
        <button
          phx-click="show-new-form"
          class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          New Playlist
        </button>
      </div>

      <%= if @show_new_form do %>
        <div class="bg-white p-4 rounded shadow mb-6">
          <form phx-submit="create-playlist">
            <div class="mb-4">
              <label class="block text-gray-700 text-sm font-bold mb-2">
                Playlist Name
              </label>
              <input
                type="text"
                name="playlist[name]"
                class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                required
              />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 text-sm font-bold mb-2">
                Description
              </label>
              <textarea
                name="playlist[description]"
                class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                rows="3"
              ></textarea>
            </div>
            <div class="flex items-center justify-end gap-4">
              <button
                type="button"
                phx-click="hide-new-form"
                class="text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Create Playlist
              </button>
            </div>
          </form>
        </div>
      <% end %>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <%= for playlist <- @playlists do %>
          <div class="border rounded-lg shadow-sm p-4">
            <div class="flex justify-between items-start mb-2">
              <div>
                <h3 class="font-bold text-lg">
                  <.link navigate={~p"/playlists/#{playlist.id}"}>
                    <%= playlist.name %>
                  </.link>
                </h3>
                <p class="text-gray-600 text-sm">
                  <%= length(playlist.videos) %> videos
                </p>
              </div>
              <button
                phx-click="delete-playlist"
                phx-value-id={playlist.id}
                class="text-red-500 hover:text-red-700"
                data-confirm="Are you sure you want to delete this playlist?"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
              </button>
            </div>
            <p class="text-gray-600 mb-4"><%= playlist.description %></p>
            <.link
              navigate={~p"/playlists/#{playlist.id}"}
              class="text-blue-500 hover:text-blue-700 text-sm"
            >
              View Playlist →
            </.link>
          </div>
        <% end %>
      </div>
    </div>
    """
  end
end
