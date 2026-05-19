# Extends the official Synapse image with Aether clinical modules
FROM matrixdotorg/synapse:latest

# Install Python dependencies for modules
RUN pip install --no-cache-dir \
    attrs \
    requests

# Copy Aether Synapse modules
COPY modules/ /usr/local/lib/python3/dist-packages/

# Synapse stores data in /data
VOLUME ["/data"]

EXPOSE 8008

# Healthcheck via Synapse's built-in health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:8008/health || exit 1
