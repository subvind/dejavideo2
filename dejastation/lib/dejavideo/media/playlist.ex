defmodule Dejavideo.Media.Playlist do
  use Ecto.Schema
  import Ecto.Changeset

  schema "playlists" do
    field :name, :string
    field :description, :string
    field :youtube_id, :string
    field :thumbnail_url, :string
    field :source, :string, default: "manual"

    many_to_many :videos, Dejavideo.Media.Video,
      join_through: Dejavideo.Media.PlaylistVideo,
      on_replace: :delete

    timestamps()
  end

  def changeset(playlist, attrs) do
    playlist
    |> cast(attrs, [:name, :description, :youtube_id, :thumbnail_url, :source])
    |> validate_required([:name, :source])
    |> validate_length(:name, min: 1, max: 100)
    |> validate_length(:description, max: 500)
    |> validate_inclusion(:source, ["manual", "youtube"])
    |> maybe_validate_youtube_id()
    |> unique_constraint(:youtube_id, name: :playlists_youtube_id_unique_when_present)
  end

  defp maybe_validate_youtube_id(changeset) do
    case get_field(changeset, :source) do
      "youtube" ->
        changeset
        |> validate_required([:youtube_id])
      _ ->
        changeset
    end
  end
end
