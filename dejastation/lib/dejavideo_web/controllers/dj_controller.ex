defmodule DejavideoWeb.DjController do
  use DejavideoWeb, :controller

  @api_base_url "http://localhost:3000/api"

  def new(conn, _params) do
    case create_new_dj() do
      {:ok, dj} ->
        conn
        |> put_flash(:info, "DJ console created")
        |> redirect(to: ~p"/dj/#{dj["id"]}")

      {:error, _reason} ->
        conn
        |> put_flash(:error, "Failed to create DJ")
        |> redirect(to: ~p"/")
    end
  end

  defp create_new_dj do
    username = "dj_#{:rand.uniform(999)}"
    email = "dj#{:rand.uniform(999)}@example.com"

    case HTTPoison.post!(
           "#{@api_base_url}/djs",
           Jason.encode!(%{
             username: username,
             email: email
           }),
           [{"Content-Type", "application/json"}]
         ) do
      %{status_code: status, body: body} when status in [200, 201] ->
        {:ok, Jason.decode!(body)["dj"]}

      _error ->
        {:error, "Failed to create DJ"}
    end
  end
end
