defmodule Dejavideo.StreamState do
  use GenServer

  # Client API
  def start_link(opts) do
    GenServer.start_link(__MODULE__, %{}, opts)
  end

  def get_deck_status(deck) do
    GenServer.call(__MODULE__, {:get_deck_status, deck})
  end

  def update_deck(deck, status) do
    GenServer.cast(__MODULE__, {:update_deck, deck, status})
  end

  # Server Callbacks
  def init(_) do
    {:ok, %{
      deck_a: %{status: "stopped", volume: 1.0, current_video: nil},
      deck_b: %{status: "stopped", volume: 1.0, current_video: nil}
    }}
  end

  def handle_call({:get_deck_status, deck}, _from, state) do
    {:reply, Map.get(state, deck), state}
  end

  def handle_cast({:update_deck, deck, status}, state) do
    {:noreply, Map.put(state, deck, status)}
  end
end
