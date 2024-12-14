export const nginxTemplate = `
upstream {{appName}} {
    server 127.0.0.1:{{port}};
}

server {
    listen 80;
    server_name {{domain}};

    location / {
        proxy_pass http://{{appName}};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;

export const systemdTemplate = `
[Unit]
Description={{appName}}
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/apps/{{appName}}
Environment=PORT={{port}}
Environment=MIX_ENV=prod
ExecStart=/opt/apps/{{appName}}/bin/{{appName}} start
ExecStop=/opt/apps/{{appName}}/bin/{{appName}} stop
Restart=on-failure
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target`;
