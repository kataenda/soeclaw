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
ARG BYREAL_INVITE_CODE
RUN if [ -n "$BYREAL_INVITE_CODE" ]; then \
      npm config set //registry.npmjs.org/:_authToken "$BYREAL_INVITE_CODE" && \
      npm install -g @byreal-io/realclaw --build-from-source || \
      npm config set @byreal-io:registry https://npm.pkg.github.com && \
      npm config set //npm.pkg.github.com/:_authToken "$BYREAL_INVITE_CODE" && \
      npm install -g @byreal-io/realclaw --build-from-source || true; \
    fi

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
