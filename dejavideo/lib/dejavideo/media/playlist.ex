defmodule Dejavideo.Media.Playlist do
  use Ecto.Schema
  import Ecto.Changeset

  schema "playlists" do
    field :name, :string
    field :description, :string
    field :youtube_id, :string
    field :thumbnail_url, :string
    field :source, :string, default: "manual" # Can be "manual" or "youtube"

    many_to_many :videos, Dejavideo.Media.Video,
      join_through: Dejavideo.Media.PlaylistVideo,
      on_replace: :delete

    timestamps()
  end

  def changeset(playlist, attrs) do
    playlist
    |> cast(attrs, [:name, :description])
    |> validate_required([:name])
    |> validate_length(:name, min: 1, max: 100)
    |> validate_length(:description, max: 500)
    |> validate_inclusion(:source, ["manual", "youtube"])
    |> maybe_validate_youtube_id()
  end

  defp maybe_validate_youtube_id(changeset) do
    if get_field(changeset, :source) == "youtube" do
      changeset
      |> validate_required([:youtube_id])
      |> unique_constraint(:youtube_id)
    else
      changeset
    end
  end
end
