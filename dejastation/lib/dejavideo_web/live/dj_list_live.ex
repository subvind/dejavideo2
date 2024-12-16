defmodule DejavideoWeb.DjListLive do
  use DejavideoWeb, :live_view

  @api_base_url "http://localhost:3000/api"

  def mount(_params, _session, socket) do
    if connected?(socket) do
      :timer.send_interval(5000, self(), :update_djs)
      send(self(), :update_djs)
    end

    {:ok,
     assign(socket,
       djs: [],
       loading: true
     )}
  end

  def handle_info(:update_djs, socket) do
    case fetch_djs() do
      {:ok, djs} ->
        {:noreply,
         socket
         |> assign(:djs, djs)
         |> assign(:loading, false)}

      {:error, _reason} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to fetch DJs")
         |> assign(:loading, false)}
    end
  end

  defp fetch_djs do
    case HTTPoison.get!("#{@api_base_url}/djs") do
      %{status_code: 200, body: body} -> {:ok, Jason.decode!(body)}
      _error -> {:error, "Failed to fetch DJs"}
    end
  end

  defp format_datetime(datetime_string) do
    case DateTime.from_iso8601(datetime_string) do
      {:ok, datetime, _} ->
        Calendar.strftime(datetime, "%Y-%m-%d %H:%M:%S")

      _ ->
        datetime_string
    end
  end

  def render(assigns) do
    ~H"""
    <div class="min-h-screen bg-gray-900 text-white p-8">
      <div class="max-w-7xl mx-auto">
        <div class="flex justify-between items-center mb-8">
          <h1 class="text-4xl font-bold">DJ Sessions</h1>
          <.link
            href={~p"/dj/new"}
            class="bg-blue-600 px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            New Session
          </.link>
        </div>

        <%= if @loading do %>
          <div class="flex justify-center items-center h-64">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        <% else %>
          <div class="bg-gray-800 rounded-lg overflow-hidden">
            <table class="w-full">
              <thead>
                <tr class="bg-gray-700">
                  <%!-- <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    DJ ID
                  </th> --%>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Username
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Resource Usage
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Created At
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-700">
                <%= for dj <- @djs do %>
                  <tr class="hover:bg-gray-700">
                    <%!-- <td class="px-6 py-4 whitespace-nowrap text-sm font-mono">
                      <%= dj["id"] %>
                    </td> --%>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                      <%= dj["username"] %>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      <span class={[
                        "px-2 py-1 text-xs rounded-full",
                        dj["status"] == "active" && "bg-green-600",
                        dj["status"] == "inactive" && "bg-red-600"
                      ]}>
                        <%= String.upcase(dj["status"]) %>
                      </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                      <div class="flex flex-col space-y-1">
                        <div class="flex items-center space-x-2">
                          <span class="text-gray-400">CPU:</span>
                          <span><%= dj["resourceUsage"]["cpu"] %>%</span>
                        </div>
                        <div class="flex items-center space-x-2">
                          <span class="text-gray-400">Memory:</span>
                          <span><%= dj["resourceUsage"]["memory"] %>MB</span>
                        </div>
                        <div class="flex items-center space-x-2">
                          <span class="text-gray-400">Bandwidth:</span>
                          <span><%= dj["resourceUsage"]["bandwidth"] %>Mbps</span>
                        </div>
                      </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                      <%= format_datetime(dj["createdAt"]) %>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                      <div class="flex space-x-2">
                        <.link
                          href={~p"/dj/#{dj["id"]}"}
                          class="text-blue-400 hover:text-blue-300"
                        >
                          Deja Controller
                        </.link>
                        <button
                          phx-click="delete_dj"
                          phx-value-id={dj["id"]}
                          class="text-red-400 hover:text-red-300"
                          data-confirm="Are you sure you want to delete this DJ session?"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                <% end %>
              </tbody>
            </table>
          </div>
        <% end %>
      </div>
    </div>
    """
  end

  def handle_event("delete_dj", %{"id" => dj_id}, socket) do
    case HTTPoison.delete!("#{@api_base_url}/djs/#{dj_id}") do
      %{status_code: 200} ->
        send(self(), :update_djs)
        {:noreply, put_flash(socket, :info, "DJ session deleted")}

      _error ->
        {:noreply, put_flash(socket, :error, "Failed to delete DJ session")}
    end
  end
end
