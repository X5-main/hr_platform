# Multi-stage Dockerfile for HR Candidate Screening Platform
# Provides isolated development environment with VS Code, noVNC, and Claude Code

# Stage 1: Base System
FROM ubuntu:24.04 AS base

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install essential packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    git \
    gnupg \
    lsb-release \
    software-properties-common \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r candidate -g 1000 && \
    useradd -r -g candidate -u 1000 -m -s /bin/bash candidate && \
    mkdir -p /home/candidate && \
    chown -R candidate:candidate /home/candidate

# Stage 2: Development Tools
FROM base AS dev-tools

# Install Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Python 3.12
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.12 \
    python3.12-venv \
    python3-pip \
    python3.12-dev \
    build-essential \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install common development tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    vim \
    nano \
    htop \
    tree \
    jq \
    unzip \
    zip \
    && rm -rf /var/lib/apt/lists/*

# Stage 3: IDE and Desktop Environment
FROM dev-tools AS ide-desktop

# Install X11 and VNC stack
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    fluxbox \
    xterm \
    fonts-dejavu-core \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Install noVNC
RUN mkdir -p /opt/noVNC && \
    curl -fsSL https://github.com/novnc/noVNC/archive/refs/tags/v1.4.0.tar.gz | \
    tar -xz -C /opt/noVNC --strip-components=1 && \
    curl -fsSL https://github.com/novnc/websockify/archive/refs/tags/v0.11.0.tar.gz | \
    tar -xz -C /opt/noVNC/utils/websockify --strip-components=1 && \
    ln -s /opt/noVNC/vnc.html /opt/noVNC/index.html

# Install code-server (VS Code Server)
RUN curl -fsSL https://code-server.dev/install.sh | sh -s -- --version 4.20.0 && \
    mkdir -p /home/candidate/.config/code-server && \
    chown -R candidate:candidate /home/candidate/.config

# Configure code-server
COPY --chown=candidate:candidate config/code-server-config.yaml /home/candidate/.config/code-server/config.yaml

# Stage 4: Claude Code and Final Setup
FROM ide-desktop AS final

# Install Claude Code CLI (placeholder - requires manual installation or custom build)
# Note: Claude Code is a commercial tool that requires proper licensing
# This creates a wrapper script that will be configured at runtime
RUN mkdir -p /usr/local/bin && \
    cat > /usr/local/bin/claude-code << 'EOF'
#!/bin/bash
# Claude Code CLI wrapper
# Requires ANTHROPIC_API_KEY environment variable
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "Error: ANTHROPIC_API_KEY not set"
    exit 1
fi
# Placeholder for actual Claude Code CLI invocation
# In production, this would invoke the actual Claude Code binary
echo "Claude Code CLI - Placeholder"
echo "API Key configured: ${ANTHROPIC_API_KEY:0:8}..."
EOF
    chmod +x /usr/local/bin/claude-code

# Set up workspace directory
RUN mkdir -p /workspace && \
    chown -R candidate:candidate /workspace

# Copy supervisor configuration
COPY config/supervisord.conf /etc/supervisor/supervisord.conf

# Copy startup scripts
COPY scripts/start-vnc.sh /usr/local/bin/start-vnc.sh
COPY scripts/start-code-server.sh /usr/local/bin/start-code-server.sh
RUN chmod +x /usr/local/bin/start-*.sh

# Stage 5: Security Hardening
FROM final AS hardened

# Remove unnecessary packages and clean up
RUN apt-get purge -y --auto-remove \
    software-properties-common \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    /tmp/* \
    /var/tmp/*

# Remove setuid/setgid binaries (security hardening)
RUN find / -perm /6000 -type f -exec chmod a-s {} \; 2>/dev/null || true

# Set proper permissions
RUN chown -R candidate:candidate /home/candidate && \
    chown -R candidate:candidate /workspace && \
    chown -R root:root /opt/noVNC && \
    chmod -R 755 /opt/noVNC

# Create required directories with proper permissions
RUN mkdir -p /tmp/.X11-unix && \
    chmod 1777 /tmp/.X11-unix && \
    mkdir -p /var/log/supervisor && \
    chown candidate:candidate /var/log/supervisor

# Switch to non-root user
USER candidate
WORKDIR /workspace

# Environment variables
ENV HOME=/home/candidate \
    USER=candidate \
    DISPLAY=:1 \
    VNC_PORT=5901 \
    NOVNC_PORT=6080 \
    CODE_SERVER_PORT=8080 \
    SHELL=/bin/bash \
    TERM=xterm-256color

# Expose ports
# 8080 - code-server (VS Code)
# 5901 - VNC server
# 6080 - noVNC web client
EXPOSE 8080 5901 6080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Entrypoint
ENTRYPOINT ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf", "-n"]
