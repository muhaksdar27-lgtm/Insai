FROM node:22-bullseye-slim

# Install system dependencies including Python and GCC
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Setup Python Virtual Environment and ensure permissions
RUN python3 -m venv /app/venv && \
    chmod -R 755 /app/venv/bin

# Copy Python requirements first for caching
COPY python-engine/requirements.txt python-engine/

# Install Python packages
RUN /app/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /app/venv/bin/pip install --no-cache-dir -r python-engine/requirements.txt

# Copy Node.js package manifests
COPY package.json package-lock.json* ./

# Install Node dependencies
RUN npm ci --prefer-offline --no-audit

# Copy the rest of the application source code
COPY . .

# Ensure env file exists
RUN cp .env.example .env || true

# Build Next.js application
ENV NODE_ENV=production
RUN npm run build

# Expose ports for both Node and Python
EXPOSE 3000
EXPOSE 8181

# Command to start the main Next.js server (which will spawn Python locally)
CMD ["npm", "run", "start"]
