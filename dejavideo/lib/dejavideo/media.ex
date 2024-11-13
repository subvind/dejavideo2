# lib/dejavideo/media.ex
defmodule Dejavideo.Media do
  import Ecto.Query
  alias Dejavideo.Repo
  alias Dejavideo.Media.Video
  alias Dejavideo.YouTube
  alias Dejavideo.Media.Playlist

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

  def list_playlists do
    Repo.all(Playlist) |> Repo.preload(:videos)
  end

  def get_playlist!(id) do
    Repo.get!(Playlist, id) |> Repo.preload(:videos)
  end

  def create_playlist(attrs \\ %{}) do
    %Playlist{}
    |> Playlist.changeset(attrs)
    |> Repo.insert()
  end

  def update_playlist(%Playlist{} = playlist, attrs) do
    playlist
    |> Playlist.changeset(attrs)
    |> Repo.update()
  end

  def delete_playlist(%Playlist{} = playlist) do
    Repo.delete(playlist)
  end

  def add_video_to_playlist(%Playlist{} = playlist, %Video{} = video) do
    playlist = Repo.preload(playlist, :videos)

    playlist
    |> Ecto.Changeset.change()
    |> Ecto.Changeset.put_assoc(:videos, [video | playlist.videos])
    |> Repo.update()
  end

  def remove_video_from_playlist(%Playlist{} = playlist, video_id) do
    playlist = Repo.preload(playlist, :videos)

    updated_videos = Enum.reject(playlist.videos, &(&1.id == video_id))

    playlist
    |> Ecto.Changeset.change()
    |> Ecto.Changeset.put_assoc(:videos, updated_videos)
    |> Repo.update()
  end
end
