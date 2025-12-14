# md-web Deployment

Example systemd unit and nginx reverse proxy modeled after the code_server deployment. Adjust paths, user, domain, and certs before use.

## Systemd Service
File: `example_deployment/md_web/md_web.service`

- Set `WorkingDirectory` to your cloned repo (default `/home/cow/repos/md-web`).
- Adjust `ExecStart` port or node path if needed (defaults: `/usr/bin/env PORT=3009 NODE_ENV=production /usr/bin/node server.js`).
- Install and enable:
  ```
  sudo install -m 644 md_web.service /etc/systemd/system/md_web.service
  sudo systemctl daemon-reload
  sudo systemctl enable md_web
  sudo systemctl start md_web
  sudo systemctl status md_web
  ```
- Ensure your `.env` at the working directory contains AUTH_USER, AUTH_PASS, SESSION_SECRET, VAULT_ROOT, PORT, etc.

## Nginx Reverse Proxy
File: `example_deployment/md_web/md-web.conf`

- Replace `example.com` with your domain.
- Update cert paths to your real certificate (e.g., from certbot).
- The proxy expects the app on `127.0.0.1:3009`; change if you run on a different port.
- Deploy:
  ```
  sudo install -m 644 md-web.conf /etc/nginx/conf.d/md-web.conf
  sudo nginx -t
  sudo systemctl reload nginx
  ```

## Notes
- The nginx config includes WebSocket headers (`map $http_upgrade`), HTTP→HTTPS redirect, and basic hardening headers.
- If you need a different port/domain, update both the systemd unit `PORT` and the nginx `proxy_pass`/`server_name`.
