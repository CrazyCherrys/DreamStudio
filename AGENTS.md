# DreamStudio Agent Rules

## Post-Change Verification

- After completing any code change, rebuild the Docker service and restart it so the user can manually verify the change in the running app.
- Keep the documentation in sync with code changes. When implementation details, commands, configuration, API behavior, or user-visible workflows change, update the relevant docs in the same work session before considering the change complete.
- After completing changes, push the committed work to the remote branch that corresponds to the current local branch.
- Use the project Compose setup from the repository root:

```bash
docker compose up -d --build dreamstudio
```

- After the service restarts, report the verification URL and any relevant service status or failure output.
