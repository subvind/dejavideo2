defmodule Dejavideo.Media.Playlist do
  use Ecto.Schema
  import Ecto.Changeset

  schema "playlists" do
    field :name, :string
    field :description, :string
    many_to_many :videos, Dejavideo.Media.Video, join_through: "playlist_videos"

    timestamps()
  end

  def changeset(playlist, attrs) do
    playlist
    |> cast(attrs, [:name, :description])
    |> validate_required([:name])
    |> validate_length(:name, min: 1, max: 100)
    |> validate_length(:description, max: 500)
  end
end
