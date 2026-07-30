# ppontv — PhotoPrism On TV

A lightweight TV-friendly slideshow interface for [PhotoPrism](https://photoprism.app), designed for Google TV / Android TV.

Browse your PhotoPrism albums on the big screen with two clicks — no app store, no subscriptions, no heavy frameworks.

## Features

- Album grid with cover photos
- Fullscreen slideshow with smooth transitions
- Date & location overlay
- Clock on the album screen
- Pause/resume on click
- Prev/Next controls (auto-hide)
- Runs in Docker — one small container

## Setup

1. Copy this folder to your server
2. Create your config file from the example:
   ```bash
   cp ppontv.conf.example ppontv.conf
   nano ppontv.conf
   ```
3. Build and start:
   ```bash
   docker-compose up -d --build
   ```
4. Open `http://your-server:3000` in Chrome on your Google TV and bookmark it

## Usage

- Click any album → fullscreen slideshow starts
- **Click anywhere** → pause/resume
- **❮ ❯** buttons at bottom → prev/next photo (auto-hide)
- **✕ Exit** button → back to albums
- **Backspace / Escape** → back to albums

## Configuration (ppontv.conf)

| Variable | Default | Description |
|---|---|---|
| PHOTOPRISM_URL | http://your-host:2342 | PhotoPrism address |
| PHOTOPRISM_USER | your-username | PhotoPrism username |
| PHOTOPRISM_PASSWORD | your-password | PhotoPrism password |
| SLIDESHOW_INTERVAL | 5 | Seconds between photos |
| SLIDESHOW_RANDOM | false | Randomize photo order |
| SHOW_INFO_OVERLAY | true | Show date/location on photos |
| SHOW_CLOCK | true | Show clock on album screen |
| PORT | 3000 | Port to run ppontv on |

## Requirements

- Docker & docker-compose on the server
- PhotoPrism running and accessible from the server
- A browser on your TV (Chrome on Google TV works great)

## License

MIT

