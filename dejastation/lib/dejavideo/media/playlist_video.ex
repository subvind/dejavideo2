defmodule Dejavideo.Media.PlaylistVideo do
  use Ecto.Schema
  import Ecto.Changeset

  schema "playlist_videos" do
    field :position, :integer

    belongs_to :playlist, Dejavideo.Media.Playlist
    belongs_to :video, Dejavideo.Media.Video

    timestamps(type: :utc_datetime)
  end

  def changeset(playlist_video, attrs) do
    playlist_video
    |> cast(attrs, [:playlist_id, :video_id, :position])
    |> validate_required([:playlist_id, :video_id, :position])
    |> foreign_key_constraint(:playlist_id)
    |> foreign_key_constraint(:video_id)
    |> unique_constraint([:playlist_id, :video_id])
  end
end
