# lib/dejavideo/media.ex
defmodule Dejavideo.Media do
  require Logger
  import Ecto.Query
  alias Dejavideo.Repo
  alias Dejavideo.YouTube
  alias Dejavideo.Media.{Video, Playlist, PlaylistVideo}

  def list_videos do
    Repo.all(Video)
  end

  def get_video!(id), do: Repo.get!(Video, id)

  def get_video_by_youtube_id(youtube_id) do
    Repo.get_by(Video, youtube_id: youtube_id)
  end

  def create_video(attrs \\ %{}) do
    %Video{}
    |> Video.changeset(attrs)
    |> Repo.insert()
  end

  def delete_video(%Video{} = video) do
    Repo.delete(video)
  end

  def add_video_to_collection(video_data) do
    case get_video_by_youtube_id(video_data.youtube_id) do
      nil -> create_video(video_data)
      video -> {:ok, video}
    end
  end

  # Get additional video details from YouTube API if needed
  def get_video_details(youtube_id) do
    case YouTube.get_video_details(youtube_id) do
      {:ok, details} -> details
      _ -> nil
    end
  end

  # Playlist-related functions
  def list_playlists do
    Repo.all(Playlist)
    |> Repo.preload(:videos)
  end

  def get_playlist!(id) do
    Repo.get!(Playlist, id)
    |> Repo.preload(:videos)
  end

  def create_playlist(attrs \\ %{}) do
    %Playlist{}
    |> Playlist.changeset(attrs)
    |> Repo.insert()
  end

  def create_manual_playlist(attrs \\ %{}) do
    attrs = Map.merge(attrs, %{source: "manual"})

    %Playlist{}
    |> Playlist.changeset(attrs)
    |> Repo.insert()
  end

  def create_youtube_playlist(attrs \\ %{}) do
    attrs = Map.merge(attrs, %{source: "youtube"})

    %Playlist{}
    |> Playlist.changeset(attrs)
    |> Repo.insert()
  end

  def delete_playlist(%Playlist{} = playlist) do
    Repo.delete(playlist)
  end

  def get_video_playlists(video) do
    Repo.all(
      from p in Playlist,
      join: pv in PlaylistVideo,
      on: pv.playlist_id == p.id,
      where: pv.video_id == ^video.id,
      order_by: [asc: p.name]
    )
  end

  def add_video_to_playlist(video, playlist) do
    # Get the next position
    next_position =
      from(pv in PlaylistVideo,
        where: pv.playlist_id == ^playlist.id,
        select: count("*")
      )
      |> Repo.one()

    # Use a direct SQL query for the insert
    timestamp = DateTime.utc_now()

    result = Ecto.Adapters.SQL.query(
      Repo,
      "INSERT INTO playlist_videos (position, playlist_id, video_id, inserted_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (playlist_id, video_id) DO NOTHING",
      [
        next_position + 1,
        playlist.id,
        video.id,
        timestamp,
        timestamp
      ]
    )

    case result do
      {:ok, %{num_rows: 1}} ->
        {:ok, %PlaylistVideo{
          playlist_id: playlist.id,
          video_id: video.id,
          position: next_position + 1,
          inserted_at: timestamp,
          updated_at: timestamp
        }}
      {:ok, %{num_rows: 0}} ->
        # Already exists - return success
        {:ok, %PlaylistVideo{
          playlist_id: playlist.id,
          video_id: video.id,
          position: next_position + 1,
          inserted_at: timestamp,
          updated_at: timestamp
        }}
      {:error, _} = error -> error
    end
  end

  def remove_video_from_playlist(video, playlist) do
    from(pv in PlaylistVideo,
      where: pv.playlist_id == ^playlist.id and pv.video_id == ^video.id
    )
    |> Repo.delete_all()

    # Reorder remaining videos
    from(pv in PlaylistVideo,
      where: pv.playlist_id == ^playlist.id,
      order_by: [asc: pv.position]
    )
    |> Repo.all()
    |> Enum.with_index(1)
    |> Enum.each(fn {video, index} ->
      Ecto.Changeset.change(video, position: index)
      |> Repo.update()
    end)

    {:ok, get_playlist!(playlist.id)}
  end

  def reorder_playlist_videos(playlist, video_ids) do
    # Update positions based on the new order
    video_ids
    |> Enum.with_index(1)
    |> Enum.each(fn {video_id, index} ->
      from(pv in PlaylistVideo,
        where: pv.playlist_id == ^playlist.id and pv.video_id == ^video_id
      )
      |> Repo.update_all(set: [position: index])
    end)

    {:ok, get_playlist!(playlist.id)}
  end

  def get_playlist_by_youtube_id(youtube_id) do
    Repo.get_by(Playlist, youtube_id: youtube_id, source: "youtube")
  end

  def import_youtube_playlist(playlist_attrs, videos) do
    # Start a transaction to ensure playlist and videos are created atomically
    Repo.transaction(fn ->
      # Ensure required fields are present
      playlist_attrs = playlist_attrs
        |> Map.merge(%{
          source: "youtube",
          name: playlist_attrs.title, # Map title to name for Playlist schema
          description: playlist_attrs.description
        })
        |> Map.take([:name, :description, :youtube_id, :thumbnail_url, :source])

      # First check if playlist already exists
      result = case get_playlist_by_youtube_id(playlist_attrs.youtube_id) do
        nil ->
          # Create new playlist
          case create_youtube_playlist(playlist_attrs) do
            {:ok, playlist} ->
              import_playlist_videos(playlist, videos)
            {:error, changeset} ->
              Logger.error("Failed to create playlist: #{inspect(changeset)}")
              Repo.rollback(changeset)
          end

        playlist ->
          # Update existing playlist with new videos
          import_playlist_videos(playlist, videos)
      end

      case result do
        {:ok, playlist} -> playlist  # Already wrapped in {:ok, _}
        {:error, error} -> Repo.rollback(error)
        error -> Repo.rollback(error)
      end
    end)
  end

  defp import_playlist_videos(playlist, videos) do
    # Import all videos first, with better error handling
    results = Enum.map(videos, fn video ->
      video_attrs = %{
        title: video.title,
        description: video.description,
        youtube_id: video.youtube_id,
        thumbnail_url: video.thumbnail_url
      }

      case add_video_to_collection(video_attrs) do
        {:ok, video} -> {:ok, video}
        {:error, error} ->
          Logger.error("Failed to import video: #{inspect(error)}")
          {:error, error}
      end
    end)

    # Check if any video imports failed
    case Enum.find(results, &match?({:error, _}, &1)) do
      nil ->
        # All videos imported successfully, now associate them with the playlist
        imported_videos = Enum.map(results, fn {:ok, video} -> video end)
        case associate_videos_with_playlist(playlist, imported_videos) do
          {:ok, updated_playlist} -> {:ok, updated_playlist}
          {:error, error} ->
            Logger.error("Failed to associate videos with playlist: #{inspect(error)}")
            {:error, error}
        end

      {:error, error} ->
        {:error, error}
    end
  end

  defp associate_videos_with_playlist(playlist, videos) do
    # Get existing playlist video associations
    existing_associations =
      from(pv in PlaylistVideo,
        where: pv.playlist_id == ^playlist.id,
        select: pv.video_id
      )
      |> Repo.all()
      |> MapSet.new()

    # Create new associations for videos not already in the playlist
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    video_associations =
      videos
      |> Enum.with_index()
      |> Enum.reject(fn {video, _} -> MapSet.member?(existing_associations, video.id) end)
      |> Enum.map(fn {video, index} ->
        %{
          playlist_id: playlist.id,
          video_id: video.id,
          position: index,
          inserted_at: now,
          updated_at: now
        }
      end)

    case video_associations do
      [] ->
        {:ok, Map.put(playlist, :inserted_count, 0)}

      associations ->
        try do
          {count, _} = Repo.insert_all(PlaylistVideo, associations)
          {:ok, Map.put(playlist, :inserted_count, count)}
        rescue
          e ->
            Logger.error("Failed to insert playlist associations: #{inspect(e)}")
            {:error, "Failed to associate videos with playlist"}
        end
    end
  end
end
