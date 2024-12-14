defmodule Dejavideo.Media.Video do
  use Ecto.Schema
  import Ecto.Changeset

  schema "videos" do
    field :title, :string
    field :youtube_id, :string
    field :thumbnail_url, :string
    field :local_path, :string
    field :downloaded, :boolean, default: false
    field :description, :string
    field :duration, :string
    field :view_count, :integer
    field :like_count, :integer

    timestamps()
  end

  def changeset(video, attrs) do
    video
    |> cast(attrs, [:title, :youtube_id, :thumbnail_url, :local_path, :downloaded, :description, :duration, :view_count, :like_count])
    |> validate_required([:title, :youtube_id, :thumbnail_url])
  end
end
