dejavideo2
========
@UseWithBroadcastPattern()
@UseWithGuardPattern()
member permission types:
- publisher: able to edit video records
- subscriber: able to view video records
- pending: in line to become a subscriber
- bounced: denied from becoming a subscriber
- banned: canceled from everything

```bash
# 1. First, ensure Elixir and Phoenix are installed
# For Arch Linux:
sudo pacman -S elixir

# For macOS with Homebrew:
brew install elixir

# For Ubuntu/Debian:
sudo apt-get update
sudo apt-get install elixir

# 1.1
mix local.hex
mix archive.install hex phx_new

# 2. Create new Phoenix project
mix phx.new dejavideo --database sqlite3
cd dejavideo

# 3. Configure the database in config/dev.exs
# Update username/password if needed

# 4. Create and migrate database
mix ecto.create
mix ecto.migrate

# 5. Create required directories
mkdir -p lib/dejavideo/media
mkdir -p lib/dejavideo/live
mkdir -p priv/static/uploads

# 6. Set proper permissions for uploads directory
chmod 777 priv/static/uploads

# 7. Generate authentication (optional but recommended)
mix phx.gen.auth Accounts User users

# 8. Create videos table migration
mix ecto.gen.migration create_videos

# 9. Install dependencies from mix.exs
mix deps.get

# 10. Start Phoenix server
mix phx.server

# Project structure should look like this:
dejavideo/
├── assets/
│   ├── css/
│   └── js/
├── config/
│   ├── config.exs
│   ├── dev.exs
│   └── prod.exs
├── lib/
│   ├── dejavideo/
│   │   ├── media/
│   │   │   ├── video.ex
│   │   └── media.ex
│   └── dejavideo_web/
│       ├── live/
│       │   └── video_browser_live.ex
│       ├── templates/
│       └── router.ex
├── priv/
│   ├── repo/
│   │   └── migrations/
│   └── static/
│       └── uploads/
└── mix.exs

# install youtube downloader
sudo pacman -S yt-dlp
```



