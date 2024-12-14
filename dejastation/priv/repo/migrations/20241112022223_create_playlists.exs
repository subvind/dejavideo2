defmodule Dejavideo.Repo.Migrations.CreatePlaylists do
  use Ecto.Migration

  def change do
    create table(:playlists) do
      add :name, :string, null: false
      add :description, :string
      add :youtube_id, :string
      add :thumbnail_url, :string
      add :source, :string, null: false, default: "manual" # manual or youtube

      timestamps(type: :utc_datetime)
    end

    create table(:playlist_videos, primary_key: false) do
      add :playlist_id, references(:playlists, on_delete: :delete_all), null: false
      add :video_id, references(:videos, on_delete: :delete_all), null: false
      add :position, :integer, null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:playlists, [:youtube_id])
    create index(:playlist_videos, [:playlist_id])
    create index(:playlist_videos, [:video_id])
    create unique_index(:playlist_videos, [:playlist_id, :video_id])
  end
end
