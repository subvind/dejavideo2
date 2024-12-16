defmodule DejavideoWeb.DjController do
  use DejavideoWeb, :controller

  def new(conn, _params) do
    redirect(conn, to: ~p"/djs")
  end
end
