# lib/dejavideo/media.ex
defmodule Dejavideo.Media do
  import Ecto.Query
  alias Dejavideo.Repo
  alias Dejavideo.Media.Video
  alias Dejavideo.YouTube

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
end
