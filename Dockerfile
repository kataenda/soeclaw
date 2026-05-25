FROM python:3.10-slim

WORKDIR /app

# Install system dependencies + Node.js 20
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    build-essential \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
       | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
       > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Byreal CLI tools (needs build-essential for better-sqlite3)
RUN npm install -g @byreal-io/byreal-cli @byreal-io/byreal-perps-cli --build-from-source

# Install RealClaw with invite code (set BYREAL_INVITE_CODE in Railway variables)
# Uses a temp .npmrc so @byreal-io:registry scope is NOT persisted globally
ARG BYREAL_INVITE_CODE
RUN if [ -n "$BYREAL_INVITE_CODE" ]; then \
      printf "@byreal-io:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=%s\n" "$BYREAL_INVITE_CODE" > /tmp/rc.npmrc && \
      npm install -g @byreal-io/realclaw --userconfig /tmp/rc.npmrc --build-from-source || \
      npm install -g @byreal-io/realclaw --//registry.npmjs.org/:_authToken="$BYREAL_INVITE_CODE" --build-from-source || true; \
      rm -f /tmp/rc.npmrc; \
    fi

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
