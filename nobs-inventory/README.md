# NOBS Inventory

Web mockup of an inventory for PCs, servers, SIP phones, tablets, monitors, switches, patch panels, storage and racks.

## Run

    docker compose up --build

Then open http://localhost:8080.

## Status

Mockup only. Data lives in the browser session and is not stored on a server yet.

## Updating

Run `./update.sh` from this folder. It pulls the latest code, rebuilds the image and restarts the container. Data stays where it is: the mockup keeps it in the browser, and the server database (once added) lives in a named volume that a rebuild doesn't touch.

Manual steps, if the script isn't available:

    git pull --ff-only
    docker compose up -d --build

Before a real release, tag the image (for example `nobs-inventory:0.2`) and pin that tag in `docker-compose.yml`, so an update is a deliberate version change.
