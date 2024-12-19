# Phoenix Deployment Manager

A Node.js-based deployment tool for managing multiple Phoenix applications on a single server with nginx load balancing.

## Features

- Deploy multiple Phoenix apps from Git repositories
- Automatic nginx configuration
- Systemd service management
- Environment variable management
- Zero-downtime deployments
- Git-based deployment with branch support
- Automatic cleanup of removed apps

## Prerequisites

- Node.js 16+ and npm
- Target server with:
  - Ubuntu/Debian-based OS
  - Sudo access
  - nginx
  - Git
  - Erlang/Elixir
  - systemd

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd phoenix-deployment-manager
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration

Create an `apps.yaml` file in your project root:

```yaml
apps:
  myapp:
    domain: myapp.local
    port: 4001
    repository: https://github.com/username/myapp.git
    branch: main
    enabled: true
    buildCommand: mix do deps.get, assets.deploy, release --overwrite
    env:
      SECRET_KEY_BASE: your-secret-key
      DATABASE_URL: ecto://user:pass@localhost/myapp

  another-app:
    domain: another.local
    port: 4002
    repository: https://github.com/username/another-app.git
    branch: develop
    enabled: true
    env:
      SECRET_KEY_BASE: another-secret-key
```

### Configuration Options

- `domain`: The domain name for the application
- `port`: The port the Phoenix application will run on
- `repository`: Git repository URL
- `branch`: Git branch to deploy from
- `enabled`: Whether the app should be deployed
- `buildCommand`: Custom build command (optional)
- `env`: Environment variables for the application (optional)

## Usage

### Deploy a new application

```bash
npm start dejaploy user@host add myapp
```

### Update an existing application

```bash
npm start dejaploy user@host update myapp
```

### Remove an application

```bash
npm start dejaploy user@host remove myapp
```

## Server Setup
0. Enable ssh:
```bash
# check
ssh localhost
# install
sudo apt update
sudo apt install openssh-server
# verify
sudo service ssh status
# enable
sudo systemctl enable ssh
```

1. Create a deploy user:
```bash
sudo useradd -m -s /bin/bash dejaploy
sudo mkdir -p /opt/apps
sudo chown dejaploy:dejaploy /opt/apps
```

2. Set up SSH key authentication:
```bash
# On your local machine
ssh-copy-id dejaploy@your-server
```

3. Configure sudo access for the deploy user:
```bash
sudo visudo
# Add the following line:
dejaploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl, /usr/sbin/nginx, /usr/bin/apt-get, /usr/bin/tee, /bin/rm, /bin/mkdir, /bin/chown
```

## Environment Variables

- `SSH_USER`: SSH username (defaults to 'dejaploy')
- `SSH_KEY_PATH`: Path to SSH private key (defaults to '~/.ssh/deja')

## Directory Structure

```
/opt/apps/
├── myapp/                 # Application directory
│   ├── _build/           # Build artifacts
│   ├── deps/             # Dependencies
│   └── ...
└── another-app/
    ├── _build/
    ├── deps/
    └── ...

/etc/nginx/sites-enabled/
├── myapp.conf
└── another-app.conf

/etc/systemd/system/
├── phoenix-myapp.service
└── phoenix-another-app.service
```

## How It Works

1. **Deployment**:
   - Clones/updates the Git repository
   - Installs dependencies
   - Builds the release
   - Configures nginx and systemd
   - Starts the service

2. **Updates**:
   - Pulls latest changes from Git
   - Rebuilds the application
   - Performs zero-downtime reload

3. **Removal**:
   - Stops and removes systemd service
   - Removes nginx configuration
   - Cleans up application files

## Troubleshooting

### Common Issues

1. **Permission Denied**:
   - Ensure the deploy user has correct sudo permissions
   - Check SSH key authentication

2. **Build Failures**:
   - Verify Erlang/Elixir installation
   - Check repository access
   - Validate build commands

3. **nginx Errors**:
   - Check nginx configuration syntax
   - Verify domain name resolution
   - Ensure ports are available

### Logs

- Application logs: `journalctl -u phoenix-myapp`
- nginx logs: `/var/log/nginx/{access,error}.log`
- Deployment logs: Output during deployment process

## License

UNLICENSED

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request
