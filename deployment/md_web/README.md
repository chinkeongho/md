# md-web Deployment

Example systemd unit and nginx reverse proxy modeled after the code_server deployment. Adjust paths, user, domain, and certs before use.

## Systemd Service
File: `deployment/md_web/md-web.service`

- Set `WorkingDirectory` to your cloned repo (default `/home/cow/repos/md`).
- Adjust `ExecStart` port or node path if needed (defaults: `/usr/bin/env PORT=3008 NODE_ENV=production node server.js`).
- Install and enable:
  ```
  sudo install -m 644 md-web.service /etc/systemd/system/md-web.service
  sudo systemctl daemon-reload
  sudo systemctl enable md-web
  sudo systemctl start md-web
  sudo systemctl status md-web
  ```
- Ensure your `.env` at the working directory contains AUTH_USER, AUTH_PASS, SESSION_SECRET, VAULT_ROOT, PORT, etc.

## Nginx Reverse Proxy
File: `deployment/md_web/md-web.conf`

- Replace the domain with yours.
- Update cert paths to your real certificate (e.g., from certbot).
- The proxy listens on 3009 and forwards to the app on `127.0.0.1:3008`; change if you run on a different port.
- Deploy:
  ```
  sudo install -m 644 md-web.conf /etc/nginx/conf.d/md-web.conf
  sudo nginx -t
  sudo systemctl reload nginx
  ```

## Notes
- The nginx config includes WebSocket headers (`map $http_upgrade`), HTTP→HTTPS redirect, and basic hardening headers.
- If you need a different port/domain, update both the systemd unit `PORT` and the nginx `proxy_pass`/`server_name`.
