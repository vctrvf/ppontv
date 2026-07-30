# ppontv
PhotoPrism On TV — a simple slideshow interface for Google TV

# ppontv — PhotoPrism On TV

A TV-friendly slideshow interface for PhotoPrism, designed for Google TV / Android TV.

## Setup

1. Copy this folder to your NAS, e.g. `/mnt/storage/ppontv/`
2. Edit `ppontv.conf` with your PhotoPrism URL and credentials
3. Build and start:

```bash
docker-compose up -d --build
```

4. Open `http://homenas:3000` in Chrome on your Google TV
5. Bookmark it — that's all you'll ever need to do on the TV

## Usage

- Browse your PhotoPrism albums as big tiles
- Click any album → fullscreen slideshow starts automatically
- Press **← →** to navigate manually
- Press **Backspace** or **Escape** to exit slideshow

## Configuration (ppontv.conf)

| Variable | Default | Description |
|---|---|---|
| PHOTOPRISM_URL | http://homenas:2342 | PhotoPrism address |
| PHOTOPRISM_USER | admin | PhotoPrism username |
| PHOTOPRISM_PASSWORD | family | PhotoPrism password |
| SLIDESHOW_INTERVAL | 5 | Seconds between photos |
| SLIDESHOW_RANDOM | false | Randomize photo order |
| SHOW_INFO_OVERLAY | true | Show date/location on photos |
| SHOW_CLOCK | true | Show clock on album screen |
| PORT | 3000 | Port to run ppontv on |
