defmodule Dejavideo.Repo do
  use Ecto.Repo,
    otp_app: :dejavideo,
    adapter: Ecto.Adapters.SQLite3
end
