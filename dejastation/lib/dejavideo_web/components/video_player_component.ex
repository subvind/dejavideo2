defmodule DejavideoWeb.Components.VideoPlayer do
  use Phoenix.Component

  def preview(assigns) do
    ~H"""
    <div class="relative aspect-video bg-black rounded-lg overflow-hidden">
      <video
        id={@id}
        class="w-full h-full object-contain"
        autoplay={@autoplay}
        muted={@muted}
        controls={@controls}
      >
        <source src={@src || "/media/blank.mp4"} type={@type || "video/mp4"} />
      </video>
    </div>
    """
  end
end
