# lib/dejavideo/youtube.ex
defmodule Dejavideo.YouTube do
  use Tesla
  require Logger

  @google_auth_url "https://oauth2.googleapis.com/token"

  plug Tesla.Middleware.JSON
  plug Tesla.Middleware.Headers, [{"content-type", "application/json"}]

  def search(params) do
    case get_access_token() do
      {:ok, token} -> search_with_token(params, token)
      error -> error
    end
  end

  defp search_with_token(params, token) do
    client = Tesla.client([
      {Tesla.Middleware.Headers, [{"authorization", "Bearer #{token}"}]},
      Tesla.Middleware.JSON
    ])

    query_params = build_search_params(params)

    with {:ok, %{status: 200, body: body}} <- Tesla.get(client, "https://www.googleapis.com/youtube/v3/search", query: query_params),
         videos_with_ids = parse_search_results(body),
         {:ok, detailed_videos} <- fetch_videos_details(videos_with_ids, token) do
      next_page_token = Map.get(body, "nextPageToken")
      {:ok, %{videos: detailed_videos, next_page_token: next_page_token}}
    else
      {:ok, %{status: status, body: body}} ->
        Logger.error("YouTube API error: #{status} - #{inspect(body)}")
        {:error, "YouTube API error: #{status}"}
      {:error, error} ->
        Logger.error("Request failed: #{inspect(error)}")
        {:error, "Request failed"}
    end
  end

  defp parse_search_results(%{"items" => items}) do
    Enum.map(items, fn item ->
      %{
        id: get_in(item, ["id", "videoId"]),
        title: get_in(item, ["snippet", "title"]),
        thumbnail_url: get_in(item, ["snippet", "thumbnails", "medium", "url"]),
        youtube_id: get_in(item, ["id", "videoId"]),
        channel_title: get_in(item, ["snippet", "channelTitle"]),
        published_at: get_in(item, ["snippet", "publishedAt"])
      }
    end)
  end

  defp build_search_params(%{
    query: query,
    sort_by: sort_by,
    upload_date: upload_date,
    duration: duration,
    type: type,
    page_size: page_size,
    page_token: page_token
  }) do
    # Map the sort_by value to YouTube API's expected value
    youtube_sort = case sort_by do
      "upload_date" -> "date"
      other -> other
    end

    [
      part: "snippet",
      q: query,
      maxResults: page_size,
      order: youtube_sort,
      type: if(type == "any", do: "video", else: type),
      pageToken: page_token,
      videoDefinition: "any",
      videoDuration: if(duration == "any", do: nil, else: duration),
      publishedAfter: get_published_after(upload_date)
    ]
    |> Enum.reject(fn {_, v} -> is_nil(v) end)
  end

  defp build_search_params(%{query: query}) do
    [
      part: "snippet",
      q: query,
      maxResults: 12,
      type: "video"
    ]
  end

  defp get_published_after("any"), do: nil
  defp get_published_after("hour"), do: format_datetime(DateTime.add(DateTime.utc_now(), -1, :hour))
  defp get_published_after("today"), do: format_datetime(DateTime.add(DateTime.utc_now(), -1, :day))
  defp get_published_after("week"), do: format_datetime(DateTime.add(DateTime.utc_now(), -7, :day))
  defp get_published_after("month"), do: format_datetime(DateTime.add(DateTime.utc_now(), -30, :day))
  defp get_published_after("year"), do: format_datetime(DateTime.add(DateTime.utc_now(), -365, :day))
  defp get_published_after(_), do: nil

  defp format_datetime(datetime) do
    DateTime.to_iso8601(datetime)
  end

  defp get_access_token do
    case load_cached_token() do
      {:ok, token} -> {:ok, token}
      _ -> generate_new_token()
    end
  end

  defp load_cached_token do
    token_path = Path.expand("priv/credentials/google-token.json")

    with true <- File.exists?(token_path),
         {:ok, content} <- File.read(token_path),
         {:ok, data} <- Jason.decode(content),
         token_data when not is_nil(token_data) <- Map.get(data, "access_token"),
         exp_time when not is_nil(exp_time) <- Map.get(data, "expires_at"),
         true <- is_valid_token?(exp_time) do
      {:ok, token_data}
    else
      error ->
        Logger.debug("Token load failed: #{inspect(error)}")
        {:error, :invalid_token}
    end
  end

  defp is_valid_token?(expires_at) do
    case expires_at do
      nil -> false
      exp_time ->
        current_time = System.system_time(:second)
        exp_time > current_time + 300
    end
  end

  defp generate_new_token do
    credentials_path = Application.get_env(:dejavideo, :google)[:credentials_path]

    with {:ok, cred_json} <- File.read(credentials_path),
         {:ok, credentials} <- Jason.decode(cred_json) do
      request_new_token(credentials)
    else
      error ->
        Logger.error("Failed to load credentials: #{inspect(error)}")
        {:error, "Failed to load credentials"}
    end
  end

  defp request_new_token(credentials) do
    scope = "https://www.googleapis.com/auth/youtube.readonly"

    now = System.system_time(:second)
    claims = %{
      "iss" => credentials["client_email"],
      "scope" => scope,
      "aud" => @google_auth_url,
      "exp" => now + 3600,
      "iat" => now
    }

    with {:ok, jwt} <- generate_jwt(claims, credentials["private_key"]),
         {:ok, response} <- Tesla.post(@google_auth_url, "", query: [
           grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
           assertion: jwt
         ]),
         {:ok, token_data} <- handle_token_response(response) do

      # Add expiration time to token data
      token_data = Map.put(token_data, "expires_at", now + Map.get(token_data, "expires_in", 3600))
      save_token(token_data)
      {:ok, token_data["access_token"]}
    else
      error ->
        Logger.error("Token request failed: #{inspect(error)}")
        {:error, "Failed to get access token"}
    end
  end

  defp handle_token_response(%{status: 200, body: body}) when is_map(body), do: {:ok, body}
  defp handle_token_response(%{status: 200, body: body}) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, decoded} -> {:ok, decoded}
      error ->
        Logger.error("Failed to decode token response: #{inspect(error)}")
        error
    end
  end
  defp handle_token_response(response) do
    Logger.error("Unexpected token response: #{inspect(response)}")
    {:error, "Unexpected response"}
  end

  defp save_token(token_data) do
    token_path = Path.expand("priv/credentials/google-token.json")
    File.mkdir_p!(Path.dirname(token_path))
    File.write!(token_path, Jason.encode!(token_data))
  end

  defp generate_jwt(claims, private_key) do
    header = %{"alg" => "RS256", "typ" => "JWT"}

    signer = JOSE.JWS.from_map(%{"alg" => "RS256"})
    jwk = JOSE.JWK.from_pem(private_key)

    {_, jwt} = JOSE.JWT.sign(jwk, signer, claims)
    |> JOSE.JWS.compact()

    {:ok, jwt}
  end

  defp parse_videos(%{"items" => items}) do
    Enum.map(items, fn item ->
      %{
        id: get_in(item, ["id", "videoId"]),
        title: get_in(item, ["snippet", "title"]),
        thumbnail_url: get_in(item, ["snippet", "thumbnails", "medium", "url"]),
        youtube_id: get_in(item, ["id", "videoId"])
      }
    end)
  end

  def get_video_details(video_id) do
    case get_access_token() do
      {:ok, token} -> get_video_details_with_token(video_id, token)
      error -> error
    end
  end

  defp get_video_details_with_token(video_id, token) do
    client = Tesla.client([
      {Tesla.Middleware.Headers, [{"authorization", "Bearer #{token}"}]},
      Tesla.Middleware.JSON
    ])

    params = [
      part: "snippet,statistics,contentDetails",
      id: video_id
    ]

    case Tesla.get(client, "https://www.googleapis.com/youtube/v3/videos", query: params) do
      {:ok, %{status: 200, body: %{"items" => [item | _]}}} ->
        {:ok, parse_video_details(item)}
      error ->
        Logger.error("Failed to fetch video details: #{inspect(error)}")
        {:error, "Failed to fetch video details"}
    end
  end

  defp fetch_videos_details(videos, token) do
    client = Tesla.client([
      {Tesla.Middleware.Headers, [{"authorization", "Bearer #{token}"}]},
      Tesla.Middleware.JSON
    ])

    video_ids = Enum.map(videos, & &1.youtube_id) |> Enum.join(",")

    case Tesla.get(client, "https://www.googleapis.com/youtube/v3/videos", query: [
      part: "contentDetails,statistics",
      id: video_ids
    ]) do
      {:ok, %{status: 200, body: %{"items" => items}}} ->
        detailed_videos = merge_video_details(videos, items)
        {:ok, detailed_videos}
      error ->
        Logger.error("Failed to fetch video details: #{inspect(error)}")
        {:error, "Failed to fetch video details"}
    end
  end

  defp merge_video_details(videos, details) do
    details_map = Map.new(details, fn item ->
      {item["id"],
       %{
         duration: format_duration(get_in(item, ["contentDetails", "duration"])),
         view_count: get_in(item, ["statistics", "viewCount"]),
         like_count: get_in(item, ["statistics", "likeCount"])
       }}
    end)

    Enum.map(videos, fn video ->
      case Map.get(details_map, video.youtube_id) do
        nil -> video
        details -> Map.merge(video, details)
      end
    end)
  end

  defp format_duration(nil), do: "00:00"
  defp format_duration(duration) do
    # Convert ISO 8601 duration to readable format
    # Example: "PT1H2M10S" -> "1:02:10"
    duration
    |> String.slice(2..(-2)//1) # Fixed the warning by adding explicit step
    |> String.split(["H", "M"])
    |> Enum.map(&String.replace(&1, ~r/[^\d]/, ""))
    |> Enum.map(&String.pad_leading(String.trim(&1), 2, "0"))
    |> format_duration_parts()
  end

  defp format_duration_parts([]), do: "00:00"
  defp format_duration_parts([s]), do: "00:#{String.pad_leading(s, 2, "0")}"
  defp format_duration_parts([m, s]), do: "#{m}:#{String.pad_leading(s, 2, "0")}"
  defp format_duration_parts([h, m, s]), do: "#{h}:#{m}:#{String.pad_leading(s, 2, "0")}"

  defp get_published_after("any"), do: nil
  defp get_published_after("hour"), do: format_datetime(DateTime.add(DateTime.utc_now(), -1, :hour))
  defp get_published_after("today"), do: format_datetime(DateTime.add(DateTime.utc_now(), -1, :day))
  defp get_published_after("week"), do: format_datetime(DateTime.add(DateTime.utc_now(), -7, :day))
  defp get_published_after("month"), do: format_datetime(DateTime.add(DateTime.utc_now(), -30, :day))
  defp get_published_after("year"), do: format_datetime(DateTime.add(DateTime.utc_now(), -365, :day))
  defp get_published_after(_), do: nil

  defp format_datetime(datetime) do
    DateTime.to_iso8601(datetime)
  end

  defp parse_video_details(item) do
    %{
      title: get_in(item, ["snippet", "title"]),
      description: get_in(item, ["snippet", "description"]),
      youtube_id: item["id"],
      thumbnail_url: get_in(item, ["snippet", "thumbnails", "medium", "url"]),
      duration: format_duration(get_in(item, ["contentDetails", "duration"])),
      view_count: get_in(item, ["statistics", "viewCount"]),
      like_count: get_in(item, ["statistics", "likeCount"])
    }
  end

  def get_channel_info(channel_id) do
    case get_access_token() do
      {:ok, token} -> get_channel_info_with_token(channel_id, token)
      error -> error
    end
  end

  defp get_channel_info_with_token(channel_id, token) do
    client = Tesla.client([
      {Tesla.Middleware.Headers, [{"authorization", "Bearer #{token}"}]},
      Tesla.Middleware.JSON
    ])

    with {:ok, channel} <- fetch_channel_details(client, channel_id),
         {:ok, playlists} <- fetch_channel_playlists(client, channel_id),
         {:ok, recent_videos} <- fetch_channel_videos(client, channel_id) do
      {:ok, %{
        channel: channel,
        playlists: playlists,
        recent_videos: recent_videos
      }}
    end
  end

  defp fetch_channel_details(client, channel_id) do
    case Tesla.get(client, "https://www.googleapis.com/youtube/v3/channels", query: [
      part: "snippet,statistics",
      id: channel_id
    ]) do
      {:ok, %{status: 200, body: %{"items" => [channel | _]}}} ->
        {:ok, parse_channel_details(channel)}
      {:ok, %{status: 200, body: %{"items" => []}}} ->
        {:error, "Channel not found"}
      error ->
        Logger.error("Failed to fetch channel details: #{inspect(error)}")
        {:error, "Failed to fetch channel details"}
    end
  end

  defp fetch_channel_playlists(client, channel_id) do
    case Tesla.get(client, "https://www.googleapis.com/youtube/v3/playlists", query: [
      part: "snippet,contentDetails",
      channelId: channel_id,
      maxResults: 50
    ]) do
      {:ok, %{status: 200, body: %{"items" => playlists}}} ->
        {:ok, Enum.map(playlists, &parse_playlist_details/1)}
      error ->
        Logger.error("Failed to fetch playlists: #{inspect(error)}")
        {:error, "Failed to fetch playlists"}
    end
  end

  defp fetch_channel_videos(client, channel_id) do
    case Tesla.get(client, "https://www.googleapis.com/youtube/v3/search", query: [
      part: "snippet",
      channelId: channel_id,
      maxResults: 50,
      order: "date",
      type: "video"
    ]) do
      {:ok, %{status: 200, body: body}} ->
        videos = parse_search_results(body)
        {:ok, videos}
      error ->
        Logger.error("Failed to fetch channel videos: #{inspect(error)}")
        {:error, "Failed to fetch channel videos"}
    end
  end

  def import_playlist(playlist_id) do
    case get_access_token() do
      {:ok, token} -> import_playlist_with_token(playlist_id, token)
      error -> error
    end
  end

  defp import_playlist_with_token(playlist_id, token) do
    client = Tesla.client([
      {Tesla.Middleware.Headers, [{"authorization", "Bearer #{token}"}]},
      Tesla.Middleware.JSON
    ])

    case Tesla.get(client, "https://www.googleapis.com/youtube/v3/playlistItems", query: [
      part: "snippet,contentDetails",
      playlistId: playlist_id,
      maxResults: 50
    ]) do
      {:ok, %{status: 200, body: %{"items" => items}}} ->
        {:ok, Enum.map(items, &parse_playlist_item/1)}
      error ->
        Logger.error("Failed to import playlist: #{inspect(error)}")
        {:error, "Failed to import playlist"}
    end
  end

  defp parse_channel_details(channel) do
    %{
      id: channel["id"],
      title: get_in(channel, ["snippet", "title"]),
      description: get_in(channel, ["snippet", "description"]),
      thumbnail_url: get_in(channel, ["snippet", "thumbnails", "medium", "url"]),
      subscriber_count: get_in(channel, ["statistics", "subscriberCount"]),
      video_count: get_in(channel, ["statistics", "videoCount"])
    }
  end

  defp parse_playlist_details(playlist) do
    %{
      youtube_id: playlist["id"],  # Added youtube_id for playlists
      title: get_in(playlist, ["snippet", "title"]),
      description: get_in(playlist, ["snippet", "description"]),
      thumbnail_url: get_in(playlist, ["snippet", "thumbnails", "medium", "url"]),
      video_count: get_in(playlist, ["contentDetails", "itemCount"])
    }
  end

  defp parse_playlist_item(item) do
    %{
      youtube_id: get_in(item, ["contentDetails", "videoId"]),  # Changed from video_id to youtube_id
      title: get_in(item, ["snippet", "title"]),
      description: get_in(item, ["snippet", "description"]),
      thumbnail_url: get_in(item, ["snippet", "thumbnails", "medium", "url"]),
      position: get_in(item, ["snippet", "position"])
    }
  end

  defp parse_search_results(%{"items" => items}) do
    Enum.map(items, fn item ->
      %{
        youtube_id: get_in(item, ["id", "videoId"]),  # Ensure this is consistent
        title: get_in(item, ["snippet", "title"]),
        thumbnail_url: get_in(item, ["snippet", "thumbnails", "medium", "url"]),
        channel_title: get_in(item, ["snippet", "channelTitle"]),
        published_at: get_in(item, ["snippet", "publishedAt"]),
        description: get_in(item, ["snippet", "description"])
      }
    end)
  end

  # New function to fetch full video details for playlist items
  defp enrich_playlist_videos(client, videos) do
    # Get video IDs as comma-separated string
    video_ids = Enum.map_join(videos, ",", & &1.youtube_id)

    case Tesla.get(client, "https://www.googleapis.com/youtube/v3/videos", query: [
      part: "snippet,contentDetails,statistics",
      id: video_ids
    ]) do
      {:ok, %{status: 200, body: %{"items" => items}}} ->
        enriched_videos = Enum.map(videos, fn video ->
          case Enum.find(items, &(&1["id"] == video.youtube_id)) do
            nil -> video
            item ->
              Map.merge(video, %{
                duration: format_duration(get_in(item, ["contentDetails", "duration"])),
                view_count: get_in(item, ["statistics", "viewCount"]),
                like_count: get_in(item, ["statistics", "likeCount"])
              })
          end
        end)
        {:ok, enriched_videos}
      error ->
        Logger.error("Failed to enrich video details: #{inspect(error)}")
        {:ok, videos}  # Return original videos if enrichment fails
    end
  end

  def import_playlist(playlist_id) do
    case get_access_token() do
      {:ok, token} -> import_playlist_with_token(playlist_id, token)
      error -> error
    end
  end

  defp import_playlist_with_token(playlist_id, token) do
    client = Tesla.client([
      {Tesla.Middleware.Headers, [{"authorization", "Bearer #{token}"}]},
      Tesla.Middleware.JSON
    ])

    with {:ok, %{status: 200, body: %{"items" => items}}} <- Tesla.get(client, "https://www.googleapis.com/youtube/v3/playlistItems", query: [
           part: "snippet,contentDetails",
           playlistId: playlist_id,
           maxResults: 50
         ]),
         videos = Enum.map(items, &parse_playlist_item/1),
         {:ok, enriched_videos} <- enrich_playlist_videos(client, videos) do
      {:ok, enriched_videos}
    else
      error ->
        Logger.error("Failed to import playlist: #{inspect(error)}")
        {:error, "Failed to import playlist"}
    end
  end

  def get_playlist_videos(playlist_id) do
    case get_access_token() do
      {:ok, token} -> get_playlist_videos_with_token(playlist_id, token)
      error -> error
    end
  end

  defp get_playlist_videos_with_token(playlist_id, token) do
    client = Tesla.client([
      {Tesla.Middleware.Headers, [{"authorization", "Bearer #{token}"}]},
      Tesla.Middleware.JSON
    ])

    get_all_playlist_items(client, playlist_id, nil, [])
  end

  defp get_all_playlist_items(client, playlist_id, page_token, acc) do
    params = [
      part: "snippet,contentDetails",
      playlistId: playlist_id,
      maxResults: 50
    ]

    params = if page_token, do: [{:pageToken, page_token} | params], else: params

    case Tesla.get(client, "https://www.googleapis.com/youtube/v3/playlistItems", query: params) do
      {:ok, %{status: 200, body: body}} ->
        items = Enum.map(body["items"], &parse_playlist_item/1)
        all_items = acc ++ items

        case body do
          %{"nextPageToken" => next_token} ->
            get_all_playlist_items(client, playlist_id, next_token, all_items)

          _ ->
            {:ok, all_items}
        end

      error ->
        Logger.error("Failed to fetch playlist items: #{inspect(error)}")
        {:error, "Failed to fetch playlist items"}
    end
  end
end
