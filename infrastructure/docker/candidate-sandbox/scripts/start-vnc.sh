#!/bin/bash
# Start X11vnc with optimized settings for development workloads

# Wait for Xvfb to be ready
sleep 2

# Start X11vnc with WebSocket support and performance optimizations
exec /usr/bin/x11vnc \
    -display :1 \
    -forever \
    -shared \
    -repeat \
    -xkb \
    -noxrecord \
    -noxfixes \
    -noxdamage \
    -wait 5 \
    -defer 5 \
    -ncache 10 \
    -ncache_cr \
    -rfbport 5901 \
    -nopw \
    -websocket \
    -websocket_port 5902
