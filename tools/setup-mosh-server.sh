#!/bin/bash
# Setup mosh-server on the VPS
# Run once: bash tools/setup-mosh-server.sh
#
# Prerequisites:
#   - sudo access on the VPS
#   - AWS security group must allow UDP 60000-61000 inbound

set -euo pipefail

echo "Installing mosh-server..."
sudo apt-get update -qq
sudo apt-get install -y mosh

echo ""
echo "mosh-server installed: $(which mosh-server)"
mosh-server --version 2>&1 | head -1

echo ""
echo "IMPORTANT: Ensure UDP ports 60000-61000 are open in your AWS security group."
echo "  AWS Console → EC2 → Security Groups → Inbound Rules → Add Rule:"
echo "    Type: Custom UDP"
echo "    Port range: 60000-61000"
echo "    Source: 0.0.0.0/0 (or your IP range)"
echo ""
echo "Done. Clients can now connect with mosh."
