FROM python:3.10-slim

WORKDIR /app

# Install Node.js 20 for Byreal CLI
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Byreal CLI tools
RUN npm install -g @byreal-io/byreal-cli @byreal-io/byreal-perps-cli

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
