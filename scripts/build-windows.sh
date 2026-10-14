#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rm -rf launcher/web
mkdir -p launcher/web releases
cp -R dist/. launcher/web/
cd launcher
export GOCACHE="${GOCACHE:-/tmp/generals-go-cache}"
export GOPATH="${GOPATH:-/tmp/generals-go-path}"
go test ./...
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags='-s -w -H=windowsgui' -o ../releases/GeneralsNoLimits.exe .
