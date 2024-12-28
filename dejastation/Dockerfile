
# Dockerfile
# Use the official Elixir image as a builder
FROM hexpm/elixir:1.18.1-erlang-25.2.3-debian-bookworm-20241223 as builder

# Install build dependencies
RUN apt-get update && \
    apt-get install -y build-essential git nodejs npm && \
    apt-get clean && \
    rm -f /var/lib/apt/lists/*_*

# Install hex + rebar
RUN mix local.hex --force && \
    mix local.rebar --force

WORKDIR /app

# Install mix dependencies
COPY mix.exs mix.lock ./
RUN mix deps.get --only prod

# Copy config files
COPY config config

# Copy assets
COPY assets assets
COPY priv priv

# Copy the rest of the application
COPY lib lib

# Compile the application
ENV MIX_ENV=prod
RUN mix deps.compile
RUN mix assets.deploy

# Create the release
RUN mix compile
RUN mix phx.gen.release
RUN mix release

# Create the final image
FROM debian:bullseye-slim

RUN apt-get update && \
    apt-get install -y libstdc++6 openssl libncurses5 locales && \
    apt-get clean && \
    rm -f /var/lib/apt/lists/*_*

# Set the locale
RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen

ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8

WORKDIR /app

# Copy the release from the builder
COPY --from=builder /app/_build/prod/rel/dejavideo ./

# Create a directory for the database
RUN mkdir -p /etc/dejavideo

ENV DATABASE_PATH=/etc/dejavideo/dejavideo.db
ENV PHX_SERVER=true

# Run the Phoenix app
CMD ["/app/bin/server"]
