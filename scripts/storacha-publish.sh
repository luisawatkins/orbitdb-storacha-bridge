#!/bin/bash
# -----------------------------------------------------------------------------
# Storacha Publishing Script
#
# This script builds your project and publishes it to Storacha (web3.storage)
# instead of IPFS. It uses the w3up-client to upload the built project.
#
# Setup Requirements:
# 1. Install w3 CLI: npm install -g @web3-storage/w3cli
# 2. Login: w3 login your-email@example.com
# 3. Create/select space: w3 space create my-project-space
# 4. Either:
#    a) Set STORACHA_KEY and STORACHA_PROOF in .env file, OR
#    b) Create UCAN delegation: w3 delegation create --can "*" --output .env.ucan
#       and set STORACHA_UCAN_FILE=./.env.ucan in .env file
#
# Environment Variables (optional):
#   STORACHA_KEY - Storacha private key
#   STORACHA_PROOF - Storacha proof/delegation
#   STORACHA_UCAN_FILE - Path to UCAN delegation file
#   STORACHA_UCAN_TOKEN - Base64 encoded UCAN token
#
# Usage:
#   ./scripts/storacha-publish.sh
#
# This script will:
# 1. Check for Storacha credentials
# 2. Build the project (npm run build)
# 3. Upload the build directory to Storacha
# 4. Bump package version
# 5. Commit and tag the release
# 6. Push to GitHub
# -----------------------------------------------------------------------------

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}🔵 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

print_status "OrbitDB Storacha Bridge - Storacha Publisher"
echo "=================================================="

# Change to project root
cd "$PROJECT_ROOT"

# Check if Node.js upload script exists
UPLOAD_SCRIPT="$SCRIPT_DIR/storacha-upload.js"

if [ ! -f "$UPLOAD_SCRIPT" ]; then
    print_error "Upload script not found: $UPLOAD_SCRIPT"
    print_status "Creating the upload script..."
    
    # The upload script should be created separately
    print_error "Please ensure storacha-upload.js exists in the scripts directory"
    exit 1
fi

# Make sure the upload script is executable
chmod +x "$UPLOAD_SCRIPT"

print_status "Checking Node.js and npm..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

print_success "Node.js and npm are available"

# Check if package.json exists
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Are you in the right directory?"
    exit 1
fi

print_status "Installing/updating dependencies..."
npm install

print_status "Running Storacha upload script..."

# Run the Node.js upload script
node "$UPLOAD_SCRIPT"

# Check if the upload was successful
if [ $? -eq 0 ]; then
    print_success "Storacha deployment completed successfully!"
    
    # Optional: Show recent git tags
    print_status "Recent releases:"
    git tag --sort=-version:refname | head -5
    
    echo ""
    print_success "Your project is now available on IPFS via Storacha!"
    print_status "Check the output above for the IPFS URLs."
else
    print_error "Storacha deployment failed!"
    exit 1
fi
