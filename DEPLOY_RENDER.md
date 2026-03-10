## Deploy To Render (Free)

1. Push this folder to a GitHub repository.
2. Go to https://dashboard.render.com and sign in.
3. Click `New` -> `Blueprint`.
4. Select your repository.
5. Render will detect `render.yaml` and create the service.
6. Click `Apply`.
7. Wait for deploy to finish, then open your public URL:
   `https://<service-name>.onrender.com`

Notes:
- This app needs Node server + WebSockets (`socket.io`), which Render supports.
- On free plan, the service may sleep when idle.
