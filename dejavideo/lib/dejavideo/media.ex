# lib/dejavideo/media.ex
defmodule Dejavideo.Media do
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
end
