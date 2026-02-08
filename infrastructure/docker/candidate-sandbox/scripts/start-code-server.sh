#!/bin/bash
# Start code-server with proper environment

# Wait for Xvfb to be ready (for any GUI extensions)
sleep 3

# Ensure config directory exists
mkdir -p /home/candidate/.config/code-server
mkdir -p /home/candidate/.local/share/code-server

# Start code-server
exec /usr/bin/code-server \
    --config /home/candidate/.config/code-server/config.yaml \
    /workspace
