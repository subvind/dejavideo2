defmodule Dejavideo.Repo.Migrations.CreatePlaylists do
  use Ecto.Migration

  def change do
    create table(:playlists) do
      add :name, :string, null: false
      add :description, :string

      timestamps()
    end

    create table(:playlist_videos, primary_key: false) do
      add :playlist_id, references(:playlists, on_delete: :delete_all), primary_key: true
      add :video_id, references(:videos, on_delete: :delete_all), primary_key: true
      add :position, :integer, null: false
    end

    create index(:playlist_videos, [:playlist_id])
    create index(:playlist_videos, [:video_id])
    create unique_index(:playlist_videos, [:playlist_id, :video_id])
  end
end
