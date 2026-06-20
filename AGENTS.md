# DreamStudio Agent Rules

## Post-Change Verification

- After completing any code change, rebuild the Docker service and restart it so the user can manually verify the change in the running app.
- Use the project Compose setup from the repository root:

```bash
docker compose up -d --build dreamstudio
```

- After the service restarts, report the verification URL and any relevant service status or failure output.
