defmodule Dejavideo.Repo.Migrations.CreateVideos do
  use Ecto.Migration

  def change do
    create table(:videos) do
      add :title, :string
      add :youtube_id, :string
      add :thumbnail_url, :string
      add :local_path, :string
      add :downloaded, :boolean, default: false
      add :description, :string
      add :duration, :string
      add :view_count, :integer
      add :like_count, :integer

      timestamps()
    end
  end
end
