# syntax=docker/dockerfile:1.7-labs

# Use Python 3.12 as base image
FROM python:3.12

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV PIP_NO_CACHE_DIR=1
ARG LOGS_DIR="/logs"
ENV LOGS_DIR=${LOGS_DIR}
ARG PLUGINS_INSTALL_DIR="plugins"
ENV PLUGINS_INSTALL_DIR=${PLUGINS_INSTALL_DIR}
ARG VNC_INSTALL=false
ENV VNC_INSTALL=${VNC_INSTALL}
ARG NOVNC_VERSION=
ENV NOVNC_VERSION=${NOVNC_VERSION}

# Create application user
RUN groupadd -r mediamirror && useradd -m --no-log-init -r -g mediamirror mediamirror

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget curl build-essential python3-dev libffi-dev sudo \
    && rm -rf /var/lib/apt/lists/*

# Ensure the local directory exists
RUN mkdir -p "/home/mediamirror/.local" \
    && chown -R mediamirror:mediamirror "/home/mediamirror/.local"

# Download and extract Chrome and install dependencies
RUN apt-get update && apt-get install -y \
    libnspr4 libnss3 libxss1 libasound2 libatk-bridge2.0-0 libgtk-3-0 libdrm2 \
    libgbm1 libxcomposite1 libxrandr2 libxdamage1 libpango-1.0-0 \
    libpangocairo-1.0-0 libcups2 libatspi2.0-0 libxinerama1 \
    libxext6 libx11-xcb1 libxtst6 libxfixes3 libxkbcommon0 \
    && rm -rf "/var/lib/apt/lists/*" \
    && wget -q "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb" -O /tmp/google-chrome.deb \
    && dpkg-deb -x "/tmp/google-chrome.deb" "/tmp/chrome" \
    && mv "/tmp/chrome/opt/google/chrome" "/home/mediamirror/.local" \
    && ln -s "/home/mediamirror/.local/chrome/google-chrome" "/usr/bin/google-chrome" \
    && rm -rf "/tmp/google-chrome.deb" "/tmp/chrome"

# Conditionally install VNC, noVNC and dependencies
RUN if [ "$VNC_INSTALL" = "true" ] && [ ! -z "$NOVNC_VERSION" ]; then \
    apt-get update \
    && apt-get install -y x11vnc xvfb fluxbox \
    && rm -rf "/var/lib/apt/lists/*" \
    && mkdir -p "/home/mediamirror/.local/novnc" \
    && wget -qO- "https://github.com/novnc/noVNC/archive/refs/tags/v${NOVNC_VERSION}.tar.gz" | tar xz --strip-components=1 -C "/home/mediamirror/.local/novnc" \
    && chown -R mediamirror:mediamirror "/home/mediamirror/.local/novnc" \
    && chmod +x "/home/mediamirror/.local/novnc/utils/novnc_proxy" \
    && ln -s "/home/mediamirror/.local/novnc/utils/novnc_proxy" "/usr/bin/novnc_proxy"; \
    fi

# Make logs directory
RUN mkdir -p "$LOGS_DIR" \
    && chown -R mediamirror:mediamirror "$LOGS_DIR"

# Make plugins directory
RUN if [ "$PLUGINS_INSTALL_DIR" != "plugins" ]; then \
    mkdir -p "$PLUGINS_INSTALL_DIR" \
    && chown -R mediamirror:mediamirror "$PLUGINS_INSTALL_DIR"; \
    fi

# User operations
USER mediamirror
ENV PATH="/home/mediamirror/.local/bin:${PATH}"

# Copy Quart app files
WORKDIR /app
COPY --chown=mediamirror:mediamirror --exclude="plugins" --exclude="scripts" . .
RUN if [ "$VNC_INSTALL" != "true" ]; then \
    rm "/app/mediamirror/views/vnc.py"; \
    fi

# Copy plugin files
COPY --chown=mediamirror:mediamirror "plugins" "$PLUGINS_INSTALL_DIR"

# Install Python requirements
RUN pip install --user --upgrade pip \
    && pip install --user -r requirements.txt

# Server Quart app via hypercorn on image start
CMD ["hypercorn", "--log-level", "critical", "--bind", "0.0.0.0:5000", "--worker-class", "uvloop", "mediamirror.app:app"]
